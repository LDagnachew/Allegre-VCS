import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '../shared/ipc'
import {
  REMINDER_SAVE_IN_MUSESCORE,
  type AppSettings,
  type AppStatus,
  type CommitPreview,
  type CommitProgressStage,
  type DiffResult,
  type Project,
} from '../shared/types'
import {
  locateMuseScore,
  msczToMusicXml,
  musicXmlToMscz,
} from './cli-bridge'
import { runDiffStrings } from './diff-runner'
import { Vault } from './vault'
import { ScoreWatcher, hashFile } from './watcher'

export class AllegreApp {
  private vault: Vault | null = null
  private watcher = new ScoreWatcher()
  private museScorePath: string | null = null
  private window: BrowserWindow | null = null
  private workingHash: string | null = null
  private currentProjectId: string | null = null
  private ipcRegistered = false

  async init(window: BrowserWindow): Promise<void> {
    this.window = window
    this.museScorePath = await locateMuseScore(this.loadSavedMuseScorePath())
    this.registerIpc()

    try {
      const vaultRoot = path.join(app.getPath('userData'), 'vault', 'default')
      this.vault = new Vault(vaultRoot)

      let project = this.vault.getProject()
      if (!project || !fs.existsSync(project.msczPath)) {
        const lastPath = this.loadSettings().lastScorePath
        if (lastPath && fs.existsSync(lastPath)) {
          project = this.vault.openOrCreateProject(lastPath)
        } else {
          project = null
        }
      }

      this.currentProjectId = project?.id ?? null
      if (project && fs.existsSync(project.msczPath)) {
        this.attachWatcher(project.msczPath)
        this.workingHash = hashFile(project.msczPath)
        this.saveSettings({ lastScorePath: project.msczPath })
      }
    } catch (err) {
      console.error('Failed to initialize vault:', err)
    }

    this.emitStatus()
  }

  dispose(): void {
    this.watcher.stop()
    this.vault?.close()
  }

  private vaultOrThrow(): Vault {
    if (!this.vault) throw new Error('Vault not initialized')
    return this.vault
  }

  private settingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json')
  }

  private loadSettings(): AppSettings {
    try {
      const raw = fs.readFileSync(this.settingsPath(), 'utf8')
      return JSON.parse(raw) as AppSettings
    } catch {
      return {}
    }
  }

  private saveSettings(patch: AppSettings): void {
    const next = { ...this.loadSettings(), ...patch }
    fs.mkdirSync(path.dirname(this.settingsPath()), { recursive: true })
    fs.writeFileSync(this.settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  }

  private loadSavedMuseScorePath(): string | null {
    return this.loadSettings().museScorePath ?? null
  }

  private saveMuseScorePath(museScorePath: string): void {
    this.saveSettings({ museScorePath })
  }

  private emitProgress(stage: CommitProgressStage): void {
    this.window?.webContents.send(IpcChannels.commitProgress, stage)
  }

  private attachWatcher(filePath: string): void {
    this.watcher.start(filePath, (hash) => {
      this.workingHash = hash
      this.emitStatus()
    })
  }

  private getActiveProject(): Project | null {
    if (!this.vault) return null
    if (this.currentProjectId) {
      const byId = this.vault.getProjectById(this.currentProjectId)
      if (byId) return byId
    }
    const fromMeta = this.vault.getProject()
    if (fromMeta) {
      this.currentProjectId = fromMeta.id
    }
    return fromMeta
  }

  private scoreNeedsMuseScore(project: Project): boolean {
    const ext = path.extname(project.msczPath).toLowerCase()
    return ext === '.mscz' || ext === '.mscx'
  }

  private resolveWorkingHash(project: Project | null): string | null {
    if (!project || !fs.existsSync(project.msczPath)) return null
    if (this.workingHash) return this.workingHash
    try {
      return hashFile(project.msczPath)
    } catch {
      return null
    }
  }

  private buildCommitReminder(input: {
    project: Project | null
    commits: AppStatus['commits']
    canCommit: boolean
    hasUncommittedChanges: boolean
  }): string {
    const { project, commits, canCommit, hasUncommittedChanges } = input
    if (!project) {
      return 'Open a score to start tracking versions.'
    }
    if (this.scoreNeedsMuseScore(project) && !this.museScorePath) {
      return 'Locate MuseScore in the top bar before committing .mscz files.'
    }
    if (canCommit && commits.length === 0) {
      return 'No commits yet — preview your score, add a message, then commit.'
    }
    if (canCommit) {
      return 'Preview the diff, add a message, then commit.'
    }
    if (!hasUncommittedChanges && commits.length > 0) {
      return REMINDER_SAVE_IN_MUSESCORE
    }
    if (!fs.existsSync(project.msczPath)) {
      return 'Score file not found at the saved path. Open the score again.'
    }
    return 'Waiting for changes to the score file.'
  }

  getStatus(): AppStatus {
    if (!this.vault) {
      return {
        project: null,
        commits: [],
        hasUncommittedChanges: false,
        canCommit: false,
        workingHash: null,
        museScorePath: this.museScorePath,
        reminder: 'Open a score to start tracking versions.',
      }
    }

    const vault = this.vault
    const project = this.getActiveProject()
    const commits = project ? vault.listCommits(project.id) : []
    const head = project ? vault.getHeadCommit(project.id) : null
    const currentHash = this.resolveWorkingHash(project)
    const museScoreReady =
      !project || !this.scoreNeedsMuseScore(project) || Boolean(this.museScorePath)

    const hasUncommittedChanges = Boolean(
      project &&
        currentHash &&
        (!head ||
          project.lastKnownHash === null ||
          currentHash !== project.lastKnownHash),
    )

    const canCommit = Boolean(project && currentHash && museScoreReady && hasUncommittedChanges)

    const reminder = this.buildCommitReminder({
      project,
      commits,
      canCommit,
      hasUncommittedChanges,
    })

    return {
      project,
      commits,
      hasUncommittedChanges,
      canCommit,
      workingHash: currentHash,
      museScorePath: this.museScorePath,
      reminder,
    }
  }

  private emitStatus(): void {
    this.window?.webContents.send(IpcChannels.statusChanged, this.getStatus())
  }

  private async snapshotWorkingScore(scorePath: string): Promise<{
    musicXml: string
    workingHash: string
  }> {
    const workingHash = hashFile(scorePath)
    const ext = path.extname(scorePath).toLowerCase()

    // Dev convenience: allow committing MusicXML / .musicxml directly.
    if (ext === '.musicxml' || ext === '.xml') {
      return {
        musicXml: fs.readFileSync(scorePath, 'utf8'),
        workingHash,
      }
    }

    if (!this.museScorePath) {
      throw new Error(
        'MuseScore CLI not found. Set the path in Settings before committing.',
      )
    }

    const musicXml = await msczToMusicXml(this.museScorePath, scorePath)
    return { musicXml, workingHash }
  }

  private registerIpc(): void {
    if (this.ipcRegistered) return
    this.ipcRegistered = true

    const sendOnly = new Set<string>([
      IpcChannels.statusChanged,
      IpcChannels.commitProgress,
    ])
    const invokeChannels = Object.values(IpcChannels).filter(
      (channel) => !sendOnly.has(channel),
    )
    for (const channel of invokeChannels) {
      ipcMain.removeHandler(channel)
    }
    ipcMain.handle(IpcChannels.getStatus, () => this.getStatus())

    ipcMain.handle(IpcChannels.locateMuseScore, async () => {
      this.museScorePath = await locateMuseScore(this.museScorePath)
      this.emitStatus()
      return this.museScorePath
    })

    ipcMain.handle(IpcChannels.pickMuseScore, async () => {
      const result = await dialog.showOpenDialog({
        title: 'Locate MuseScore CLI',
        properties: ['openFile'],
        defaultPath:
          process.platform === 'darwin' ? '/Applications' : undefined,
        message:
          'Select the MuseScore executable (on macOS: MuseScore 4.app/Contents/MacOS/mscore)',
      })
      if (result.canceled || result.filePaths.length === 0) return null
      let chosen = result.filePaths[0]
      if (process.platform === 'darwin' && chosen.endsWith('.app')) {
        const nested = path.join(chosen, 'Contents/MacOS/mscore')
        if (fs.existsSync(nested)) chosen = nested
      }
      this.museScorePath = chosen
      this.saveMuseScorePath(chosen)
      this.emitStatus()
      return chosen
    })

    ipcMain.handle(IpcChannels.setMuseScorePath, async (_e, filePath: string) => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Path does not exist: ${filePath}`)
      }
      this.museScorePath = filePath
      this.saveMuseScorePath(filePath)
      this.emitStatus()
      return this.museScorePath
    })

    ipcMain.handle(IpcChannels.openProject, async () => {
      const result = await dialog.showOpenDialog({
        title: 'Open score or project folder',
        properties: ['openFile', 'openDirectory'],
        filters: [
          {
            name: 'Scores',
            extensions: ['mscz', 'mscx', 'musicxml', 'xml'],
          },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) return null

      let scorePath = result.filePaths[0]
      if (fs.statSync(scorePath).isDirectory()) {
        const found = fs
          .readdirSync(scorePath)
          .find((f) => /\.(mscz|musicxml|xml)$/i.test(f))
        if (!found) {
          throw new Error('No .mscz or .musicxml file found in that folder')
        }
        scorePath = path.join(scorePath, found)
      }

      scorePath = path.resolve(scorePath)

      const vault = this.vaultOrThrow()
      const project = vault.openOrCreateProject(scorePath)
      this.currentProjectId = project.id

      // Always rebind watcher/hash when switching (even back to a known score).
      this.attachWatcher(project.msczPath)
      this.workingHash = fs.existsSync(project.msczPath)
        ? hashFile(project.msczPath)
        : null
      this.saveSettings({ lastScorePath: project.msczPath })

      this.emitStatus()
      return project
    })

    ipcMain.handle(
      IpcChannels.previewCommit,
      async (): Promise<CommitPreview> => {
        const vault = this.vaultOrThrow()
        const project = this.getActiveProject()
        if (!project) throw new Error('No project open')

        try {
          this.emitProgress('converting')
          const { musicXml, workingHash } = await this.snapshotWorkingScore(
            project.msczPath,
          )

          const head = vault.getHeadCommit(project.id)
          let diff: DiffResult
          if (!head) {
            diff = {
              summary: {
                additions: 0,
                deletions: 0,
                changes: 0,
              },
              measures: [],
            }
            diff.summary.additions = 1
          } else {
            this.emitProgress('diffing')
            const baseline = vault.readBlob(head.blobHash)
            diff = await runDiffStrings(
              baseline,
              musicXml,
              path.join(os.tmpdir(), 'allegrevcs-diff'),
              app.getAppPath(),
            )
          }

          return {
            summary: diff.summary,
            measures: diff.measures,
            musicXml,
            workingHash,
          }
        } finally {
          this.emitProgress('idle')
        }
      },
    )

    ipcMain.handle(
      IpcChannels.confirmCommit,
      async (
        _e,
        payload: { message: string; musicXml: string; workingHash: string },
      ) => {
        const vault = this.vaultOrThrow()
        const project = this.getActiveProject()
        if (!project) throw new Error('No project open')

        try {
          this.emitProgress('saving')
          const head = vault.getHeadCommit(project.id)
          const commit = vault.createCommit({
            projectId: project.id,
            message: payload.message,
            musicXml: payload.musicXml,
            workingFileHash: payload.workingHash,
            parentCommitId: head?.id ?? null,
          })

          this.workingHash = payload.workingHash
          this.emitStatus()
          return commit
        } finally {
          this.emitProgress('idle')
        }
      },
    )

    ipcMain.handle(IpcChannels.getWorkingMusicXml, async () => {
      const vault = this.vaultOrThrow()
      const project = this.getActiveProject()
      if (!project) throw new Error('No project open')
      if (!fs.existsSync(project.msczPath)) {
        throw new Error(`Score file not found: ${project.msczPath}`)
      }
      const { musicXml } = await this.snapshotWorkingScore(project.msczPath)
      return musicXml
    })

    ipcMain.handle(IpcChannels.getCommitMusicXml, (_e, commitId: string) => {
      const vault = this.vaultOrThrow()
      const project = this.getActiveProject()
      const commit = vault.getCommit(commitId)
      if (!commit) throw new Error(`Unknown commit: ${commitId}`)
      if (project && commit.projectId !== project.id) {
        throw new Error('Commit does not belong to the active score')
      }
      return vault.readBlob(commit.blobHash)
    })

    ipcMain.handle(
      IpcChannels.diffCommits,
      async (_e, aId: string, bId: string): Promise<DiffResult> => {
        const vault = this.vaultOrThrow()
        const project = this.getActiveProject()
        const a = vault.getCommit(aId)
        const b = vault.getCommit(bId)
        if (!a || !b) throw new Error('One or both commits not found')
        if (
          project &&
          (a.projectId !== project.id || b.projectId !== project.id)
        ) {
          throw new Error('Commits do not belong to the active score')
        }
        return runDiffStrings(
          vault.readBlob(a.blobHash),
          vault.readBlob(b.blobHash),
          path.join(os.tmpdir(), 'allegrevcs-diff'),
          app.getAppPath(),
        )
      },
    )

    ipcMain.handle(
      IpcChannels.restoreCommit,
      async (
        _e,
        options: {
          commitId: string
          mode: 'overwrite' | 'export'
          exportPath?: string
        },
      ) => {
        const vault = this.vaultOrThrow()
        const project = this.getActiveProject()
        if (!project) throw new Error('No project open')

        const commit = vault.getCommit(options.commitId)
        if (!commit) throw new Error(`Unknown commit: ${options.commitId}`)
        if (commit.projectId !== project.id) {
          throw new Error('Commit does not belong to the active score')
        }

        const musicXml = vault.readBlob(commit.blobHash)
        const tmpXml = path.join(
          os.tmpdir(),
          `allegrevcs-restore-${commit.id}.musicxml`,
        )
        fs.writeFileSync(tmpXml, musicXml, 'utf8')

        const ext = path.extname(project.msczPath).toLowerCase()
        const isNative = ext === '.mscz' || ext === '.mscx'

        if (options.mode === 'export') {
          let exportPath = options.exportPath
          if (!exportPath) {
            const picked = await dialog.showSaveDialog({
              title: 'Export restored score',
              defaultPath: path.join(
                path.dirname(project.msczPath),
                `${project.name}-restored${isNative ? '.mscz' : '.musicxml'}`,
              ),
            })
            if (picked.canceled || !picked.filePath) return null
            exportPath = picked.filePath
          }

          if (isNative) {
            if (!this.museScorePath) {
              throw new Error('MuseScore CLI required to restore .mscz')
            }
            await musicXmlToMscz(this.museScorePath, tmpXml, exportPath)
          } else {
            fs.copyFileSync(tmpXml, exportPath)
          }
          return exportPath
        }

        // overwrite working file
        if (isNative) {
          if (!this.museScorePath) {
            throw new Error('MuseScore CLI required to restore .mscz')
          }
          await musicXmlToMscz(this.museScorePath, tmpXml, project.msczPath)
        } else {
          fs.writeFileSync(project.msczPath, musicXml, 'utf8')
        }

        const newHash = hashFile(project.msczPath)
        vault.updateLastKnownHash(project.id, newHash)
        // After overwrite, lastKnownHash matches working file but content
        // may differ from head blob (lossy restore). Keep history intact;
        // mark as matching so Commit disables until further edits.
        this.workingHash = newHash
        this.emitStatus()
        return project.msczPath
      },
    )
  }
}
