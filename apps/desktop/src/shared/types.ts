/** Shared types between Electron main and renderer. */

export interface Project {
  id: string
  name: string
  msczPath: string
  lastKnownHash: string | null
  createdAt: string
}

export interface Commit {
  id: string
  projectId: string
  message: string
  timestamp: string
  blobHash: string
  parentCommitId: string | null
}

export interface DiffSummary {
  additions: number
  deletions: number
  changes: number
}

export interface MeasureChange {
  type: string
  detail: Record<string, unknown>
}

export interface MeasureDiff {
  number: number
  part: string
  changes: MeasureChange[]
}

export interface DiffResult {
  summary: DiffSummary
  measures: MeasureDiff[]
}

export interface AppStatus {
  project: Project | null
  commits: Commit[]
  hasUncommittedChanges: boolean
  museScorePath: string | null
  reminder: string
}

export interface CommitPreview {
  summary: DiffSummary
  measures: MeasureDiff[]
  musicXml: string
  workingHash: string
}

export type CommitProgressStage =
  | 'converting'
  | 'diffing'
  | 'saving'
  | 'idle'

export interface AppSettings {
  museScorePath?: string
  lastScorePath?: string
}

export interface CommitInput {
  message: string
}

export interface RestoreOptions {
  commitId: string
  mode: 'overwrite' | 'export'
  exportPath?: string
}

export const REMINDER =
  'Save your score in MuseScore before committing.'
