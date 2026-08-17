# AllegreVCS data model (v1, local only)

Single-user, single-machine storage. Designed so Phase 2 can add branching without a schema rewrite.

## Layout on disk

Per project, under the Electron `userData` directory:

```
<userData>/vault/<projectId>/
  vault.sqlite          # commit + project metadata
  blobs/
    <sha256>.musicxml   # content-addressed MusicXML snapshots
```

## SQLite schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mscz_path TEXT NOT NULL,
  last_known_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  blob_hash TEXT NOT NULL,
  parent_commit_id TEXT REFERENCES commits(id)
  -- Phase 2: add parent_commit_id_2 for merge commits
);

CREATE INDEX commits_project_ts ON commits(project_id, timestamp);
```

## Entities

### Blob

- Content-addressed: filename = SHA-256 of MusicXML UTF-8 bytes
- Immutable once written
- Dedupes identical snapshots for free (shared across projects in the same vault)

### Commit

```
{ id, projectId, message, timestamp, blobHash, parentCommitId | null }
```

Linear history for Phase 1: each commit has at most one parent. Commits always belong to exactly one project.

### Project

```
{ id, name, msczPath, lastKnownHash }
```

One project per absolute score path (`mscz_path` is unique). Opening a different `.mscz` / `.musicxml` activates that project’s timeline — it does not overwrite another score’s history. `meta.active_project_id` records which project is currently open.
