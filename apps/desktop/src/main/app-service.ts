import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '../shared/ipc'
import {
  REMINDER,
  type AppStatus,
  type CommitPreview,
  type DiffResult,
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

  async init(window: BrowserWindow): Promise<void> {
    this.window = window
    this.museScorePath = await locateMuseScore(this.loadSavedMuseScorePath())
    this.registerIpc()

    try {
      const vaultRoot = path.join(app.getPath('userData'), 'vault', 'default')
      this.vault = new Vault(vaultRoot)

      const project = this.vault.getProject()
      if (project && fs.existsSync(project.msczPath)) {
        this.attachWatcher(project.msczPath)
        this.workingHash = hashFile(project.msczPath)
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

  private loadSavedMuseScorePath(): string | null {
    try {
      const raw = fs.readFileSync(this.settingsPath(), 'utf8')
      const data = JSON.parse(raw) as { museScorePath?: string }
      return data.museScorePath ?? null
    } catch {
      return null
    }
  }

  private saveMuseScorePath(museScorePath: string): void {
    fs.mkdirSync(path.dirname(this.settingsPath()), { recursive: true })
    fs.writeFileSync(
      this.settingsPath(),
      JSON.stringify({ museScorePath }, null, 2),
      'utf8',
    )
  }

  private attachWatcher(filePath: string): void {
    this.watcher.start(filePath, (hash) => {
      this.workingHash = hash
      this.emitStatus()
    })
  }

  getStatus(): AppStatus {
    if (!this.vault) {
      return {
        project: null,
        commits: [],
        hasUncommittedChanges: false,
        museScorePath: this.museScorePath,
        reminder: REMINDER,
      }
    }

    const vault = this.vault
    const project = vault.getProject()
    const commits = project ? vault.listCommits(project.id) : []
    const currentHash =
      this.workingHash ??
      (project && fs.existsSync(project.msczPath)
        ? hashFile(project.msczPath)
        : null)

    const hasUncommittedChanges = Boolean(
      project &&
        currentHash &&
        (project.lastKnownHash === null ||
          currentHash !== project.lastKnownHash),
    )

    return {
      project,
      commits,
      hasUncommittedChanges,
      museScorePath: this.museScorePath,
      reminder: REMINDER,
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
    ipcMain.handle(IpcChannels.getStatus, () => this.getStatus())

    ipcMain.handle(IpcChannels.locateMuseScore, async () => {
      this.museScorePath = await locateMuseScore(this.museScorePath)
      this.emitStatus()
      return this.museScorePath
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

      const vault = this.vaultOrThrow()
      const project = vault.openOrCreateProject(scorePath)
      this.attachWatcher(scorePath)
      this.workingHash = hashFile(scorePath)
      this.emitStatus()
      return project
    })

    ipcMain.handle(
      IpcChannels.previewCommit,
      async (): Promise<CommitPreview> => {
        const vault = this.vaultOrThrow()
        const project = vault.getProject()
        if (!project) throw new Error('No project open')

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
          // Treat first commit as full add of content length heuristically
          diff.summary.additions = 1
        } else {
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
      },
    )

    ipcMain.handle(
      IpcChannels.confirmCommit,
      async (
        _e,
        payload: { message: string; musicXml: string; workingHash: string },
      ) => {
        const vault = this.vaultOrThrow()
        const project = vault.getProject()
        if (!project) throw new Error('No project open')

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
      },
    )

    ipcMain.handle(IpcChannels.getCommitMusicXml, (_e, commitId: string) => {
      const vault = this.vaultOrThrow()
      const commit = vault.getCommit(commitId)
      if (!commit) throw new Error(`Unknown commit: ${commitId}`)
      return vault.readBlob(commit.blobHash)
    })

    ipcMain.handle(
      IpcChannels.diffCommits,
      async (_e, aId: string, bId: string): Promise<DiffResult> => {
        const vault = this.vaultOrThrow()
        const a = vault.getCommit(aId)
        const b = vault.getCommit(bId)
        if (!a || !b) throw new Error('One or both commits not found')
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
        const project = vault.getProject()
        if (!project) throw new Error('No project open')

        const commit = vault.getCommit(options.commitId)
        if (!commit) throw new Error(`Unknown commit: ${options.commitId}`)

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
