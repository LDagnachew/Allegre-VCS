/** IPC channel names shared by main and preload. */

export const IpcChannels = {
  getStatus: 'allegre:get-status',
  openProject: 'allegre:open-project',
  previewCommit: 'allegre:preview-commit',
  confirmCommit: 'allegre:confirm-commit',
  getCommitMusicXml: 'allegre:get-commit-musicxml',
  diffCommits: 'allegre:diff-commits',
  restoreCommit: 'allegre:restore-commit',
  locateMuseScore: 'allegre:locate-musescore',
  setMuseScorePath: 'allegre:set-musescore-path',
  statusChanged: 'allegre:status-changed',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
