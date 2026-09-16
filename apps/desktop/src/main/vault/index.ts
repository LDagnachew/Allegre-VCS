import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Commit, Project } from '../../shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mscz_path TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS commits_project_ts
  ON commits(project_id, timestamp);

CREATE INDEX IF NOT EXISTS projects_path
  ON projects(mscz_path);
`

function rowToProject(row: {
  id: string
  name: string
  mscz_path: string
  last_known_hash: string | null
  created_at: string
}): Project {
  return {
    id: row.id,
    name: row.name,
    msczPath: row.mscz_path,
    lastKnownHash: row.last_known_hash || null,
    createdAt: row.created_at,
  }
}

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Normalize score paths so the same file always maps to one project. */
export function normalizeScorePath(scorePath: string): string {
  return path.resolve(scorePath)
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
    this.migrateLegacySchema()
  }

  close(): void {
    this.db.close()
  }

  private migrateLegacySchema(): void {
    // Older DBs may lack UNIQUE on mscz_path / meta table — SCHEMA IF NOT EXISTS
    // already added meta. Deduplicate paths if any slipped in.
    const dupes = this.db
      .prepare(
        `SELECT mscz_path, COUNT(*) AS c FROM projects
         GROUP BY mscz_path HAVING c > 1`,
      )
      .all() as Array<{ mscz_path: string }>
    for (const { mscz_path } of dupes) {
      const rows = this.db
        .prepare(
          `SELECT id FROM projects WHERE mscz_path = ? ORDER BY created_at ASC`,
        )
        .all(mscz_path) as Array<{ id: string }>
      // Keep oldest; drop extras that have no commits, else rename path suffix
      for (const extra of rows.slice(1)) {
        const commitCount = (
          this.db
            .prepare(`SELECT COUNT(*) AS n FROM commits WHERE project_id = ?`)
            .get(extra.id) as { n: number }
        ).n
        if (commitCount === 0) {
          this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(extra.id)
        } else {
          this.db
            .prepare(`UPDATE projects SET mscz_path = ? WHERE id = ?`)
            .run(`${mscz_path}#${extra.id.slice(0, 8)}`, extra.id)
        }
      }
    }
  }

  private getMeta(key: string): string | null {
    const row = this.db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value)
  }

  getActiveProjectId(): string | null {
    return this.getMeta('active_project_id')
  }

  setActiveProjectId(projectId: string): void {
    this.setMeta('active_project_id', projectId)
  }

  getProjectById(projectId: string): Project | null {
    const row = this.db
      .prepare(
        `SELECT id, name, mscz_path, last_known_hash, created_at
         FROM projects WHERE id = ?`,
      )
      .get(projectId) as
      | {
          id: string
          name: string
          mscz_path: string
          last_known_hash: string | null
          created_at: string
        }
      | undefined
    return row ? rowToProject(row) : null
  }

  findProjectByPath(scorePath: string): Project | null {
    const normalized = normalizeScorePath(scorePath)
    const row = this.db
      .prepare(
        `SELECT id, name, mscz_path, last_known_hash, created_at
         FROM projects WHERE mscz_path = ?`,
      )
      .get(normalized) as
      | {
          id: string
          name: string
          mscz_path: string
          last_known_hash: string | null
          created_at: string
        }
      | undefined
    return row ? rowToProject(row) : null
  }

  /** Active project, if any. Never falls back to a different score's row. */
  getProject(): Project | null {
    const activeId = this.getActiveProjectId()
    if (!activeId) return null
    return this.getProjectById(activeId)
  }

  /**
   * Open an existing project for this score path, or create a new one.
   * Switching scores activates that project's own commit history.
   */
  openOrCreateProject(msczPath: string, name?: string): Project {
    const normalized = normalizeScorePath(msczPath)
    const displayName =
      name ?? path.basename(normalized, path.extname(normalized))
    const existing = this.findProjectByPath(normalized)
    if (existing) {
      this.setActiveProjectId(existing.id)
      if (displayName !== existing.name) {
        this.db
          .prepare(`UPDATE projects SET name = ? WHERE id = ?`)
          .run(displayName, existing.id)
        return this.getProjectById(existing.id)!
      }
      return existing
    }

    const project: Project = {
      id: randomUUID(),
      name: name ?? path.basename(normalized, path.extname(normalized)),
      msczPath: normalized,
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

    this.setActiveProjectId(project.id)
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

  /**
   * Delete all commits for a project and drop unreferenced blobs.
   * Leaves the project row so the score can be opened again.
   */
  clearProjectHistory(projectId: string): { deletedCommits: number } {
    const project = this.getProjectById(projectId)
    if (!project) throw new Error(`Unknown project: ${projectId}`)

    const before = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM commits WHERE project_id = ?`)
        .get(projectId) as { n: number }
    ).n

    const tx = this.db.transaction(() => {
      this.db
        .prepare(`DELETE FROM commits WHERE project_id = ?`)
        .run(projectId)
      this.db
        .prepare(
          `UPDATE projects SET last_known_hash = NULL WHERE id = ?`,
        )
        .run(projectId)
    })
    tx()

    this.gcOrphanBlobs()
    return { deletedCommits: before }
  }

  private gcOrphanBlobs(): void {
    const used = new Set(
      (
        this.db.prepare(`SELECT DISTINCT blob_hash FROM commits`).all() as Array<{
          blob_hash: string
        }>
      ).map((r) => r.blob_hash),
    )

    if (!fs.existsSync(this.blobsDir)) return
    for (const name of fs.readdirSync(this.blobsDir)) {
      if (!name.endsWith('.musicxml')) continue
      const hash = name.replace(/\.musicxml$/, '')
      if (used.has(hash)) continue
      fs.rmSync(path.join(this.blobsDir, name), { force: true })
    }
  }
}
