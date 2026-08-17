/** IPC channel names shared by main and preload. */

export const IpcChannels = {
  getStatus: 'allegre:get-status',
  openProject: 'allegre:open-project',
  previewCommit: 'allegre:preview-commit',
  confirmCommit: 'allegre:confirm-commit',
  getCommitMusicXml: 'allegre:get-commit-musicxml',
  getWorkingMusicXml: 'allegre:get-working-musicxml',
  diffCommits: 'allegre:diff-commits',
  restoreCommit: 'allegre:restore-commit',
  locateMuseScore: 'allegre:locate-musescore',
  pickMuseScore: 'allegre:pick-musescore',
  setMuseScorePath: 'allegre:set-musescore-path',
  statusChanged: 'allegre:status-changed',
  commitProgress: 'allegre:commit-progress',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
