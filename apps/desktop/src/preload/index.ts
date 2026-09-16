import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type {
  AppStatus,
  Commit,
  CommitPreview,
  CommitProgressStage,
  DiffResult,
  Project,
} from '../shared/types'

const api = {
  getStatus: (): Promise<AppStatus> =>
    ipcRenderer.invoke(IpcChannels.getStatus),

  openProject: (): Promise<Project | null> =>
    ipcRenderer.invoke(IpcChannels.openProject),

  previewCommit: (): Promise<CommitPreview> =>
    ipcRenderer.invoke(IpcChannels.previewCommit),

  confirmCommit: (payload: {
    message: string
    musicXml: string
    workingHash: string
  }): Promise<Commit> => ipcRenderer.invoke(IpcChannels.confirmCommit, payload),

  getCommitMusicXml: (commitId: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.getCommitMusicXml, commitId),

  getWorkingMusicXml: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.getWorkingMusicXml),

  diffCommits: (aId: string, bId: string): Promise<DiffResult> =>
    ipcRenderer.invoke(IpcChannels.diffCommits, aId, bId),

  restoreCommit: (options: {
    commitId: string
    mode: 'overwrite' | 'export'
    exportPath?: string
  }): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.restoreCommit, options),

  clearHistory: (): Promise<{ deletedCommits: number } | null> =>
    ipcRenderer.invoke(IpcChannels.clearHistory),

  dismissTip: (tipId: string): Promise<AppStatus> =>
    ipcRenderer.invoke(IpcChannels.dismissTip, tipId),

  locateMuseScore: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.locateMuseScore),

  pickMuseScore: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.pickMuseScore),

  setMuseScorePath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.setMuseScorePath, filePath),

  onStatusChanged: (cb: (status: AppStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppStatus): void => {
      cb(status)
    }
    ipcRenderer.on(IpcChannels.statusChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.statusChanged, listener)
  },

  onCommitProgress: (cb: (stage: CommitProgressStage) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      stage: CommitProgressStage,
    ): void => {
      cb(stage)
    }
    ipcRenderer.on(IpcChannels.commitProgress, listener)
    return () => ipcRenderer.removeListener(IpcChannels.commitProgress, listener)
  },
}

contextBridge.exposeInMainWorld('allegre', api)

export type AllegreApi = typeof api
