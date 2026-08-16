import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Commit, Project } from '../../shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mscz_path TEXT NOT NULL,
  last_known_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  blob_hash TEXT NOT NULL,
  parent_commit_id TEXT REFERENCES commits(id)
);

CREATE INDEX IF NOT EXISTS commits_project_ts
  ON commits(project_id, timestamp);
`

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export class Vault {
  readonly rootDir: string
  readonly blobsDir: string
  private readonly db: Database.Database

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.blobsDir = path.join(rootDir, 'blobs')
    fs.mkdirSync(this.blobsDir, { recursive: true })
    this.db = new Database(path.join(rootDir, 'vault.sqlite'))
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  getProject(): Project | null {
    const row = this.db
      .prepare(
        `SELECT id, name, mscz_path, last_known_hash, created_at
         FROM projects LIMIT 1`,
      )
      .get() as
      | {
          id: string
          name: string
          mscz_path: string
          last_known_hash: string | null
          created_at: string
        }
      | undefined

    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      msczPath: row.mscz_path,
      lastKnownHash: row.last_known_hash,
      createdAt: row.created_at,
    }
  }

  openOrCreateProject(msczPath: string, name?: string): Project {
    const existing = this.getProject()
    if (existing) {
      this.db
        .prepare(`UPDATE projects SET mscz_path = ?, name = ? WHERE id = ?`)
        .run(msczPath, name ?? existing.name, existing.id)
      return this.getProject()!
    }

    const project: Project = {
      id: randomUUID(),
      name: name ?? path.basename(msczPath, path.extname(msczPath)),
      msczPath,
      lastKnownHash: null,
      createdAt: new Date().toISOString(),
    }

    this.db
      .prepare(
        `INSERT INTO projects (id, name, mscz_path, last_known_hash, created_at)
         VALUES (@id, @name, @msczPath, @lastKnownHash, @createdAt)`,
      )
      .run({
        id: project.id,
        name: project.name,
        msczPath: project.msczPath,
        lastKnownHash: project.lastKnownHash,
        createdAt: project.createdAt,
      })

    return project
  }

  listCommits(projectId: string): Commit[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, message, timestamp, blob_hash, parent_commit_id
         FROM commits
         WHERE project_id = ?
         ORDER BY timestamp DESC`,
      )
      .all(projectId) as Array<{
      id: string
      project_id: string
      message: string
      timestamp: string
      blob_hash: string
      parent_commit_id: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      message: row.message,
      timestamp: row.timestamp,
      blobHash: row.blob_hash,
      parentCommitId: row.parent_commit_id,
    }))
  }

  getCommit(commitId: string): Commit | null {
    const row = this.db
      .prepare(
        `SELECT id, project_id, message, timestamp, blob_hash, parent_commit_id
         FROM commits WHERE id = ?`,
      )
      .get(commitId) as
      | {
          id: string
          project_id: string
          message: string
          timestamp: string
          blob_hash: string
          parent_commit_id: string | null
        }
      | undefined

    if (!row) return null
    return {
      id: row.id,
      projectId: row.project_id,
      message: row.message,
      timestamp: row.timestamp,
      blobHash: row.blob_hash,
      parentCommitId: row.parent_commit_id,
    }
  }

  getHeadCommit(projectId: string): Commit | null {
    const commits = this.listCommits(projectId)
    return commits[0] ?? null
  }

  writeBlob(musicXml: string): string {
    const hash = hashContent(musicXml)
    const blobPath = path.join(this.blobsDir, `${hash}.musicxml`)
    if (!fs.existsSync(blobPath)) {
      fs.writeFileSync(blobPath, musicXml, 'utf8')
    }
    return hash
  }

  readBlob(hash: string): string {
    const blobPath = path.join(this.blobsDir, `${hash}.musicxml`)
    if (!fs.existsSync(blobPath)) {
      throw new Error(`Blob not found: ${hash}`)
    }
    return fs.readFileSync(blobPath, 'utf8')
  }

  createCommit(input: {
    projectId: string
    message: string
    musicXml: string
    workingFileHash: string
    parentCommitId: string | null
  }): Commit {
    const blobHash = this.writeBlob(input.musicXml)
    const commit: Commit = {
      id: randomUUID(),
      projectId: input.projectId,
      message: input.message.trim() || 'Commit',
      timestamp: new Date().toISOString(),
      blobHash,
      parentCommitId: input.parentCommitId,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO commits
             (id, project_id, message, timestamp, blob_hash, parent_commit_id)
           VALUES
             (@id, @projectId, @message, @timestamp, @blobHash, @parentCommitId)`,
        )
        .run(commit)

      this.db
        .prepare(`UPDATE projects SET last_known_hash = ? WHERE id = ?`)
        .run(input.workingFileHash, input.projectId)
    })
    tx()

    return commit
  }

  updateLastKnownHash(projectId: string, hash: string): void {
    this.db
      .prepare(`UPDATE projects SET last_known_hash = ? WHERE id = ?`)
      .run(hash, projectId)
  }
}
