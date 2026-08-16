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
- Dedupes identical snapshots for free

### Commit

```
{ id, projectId, message, timestamp, blobHash, parentCommitId | null }
```

Linear history for Phase 1: each commit has at most one parent. `parent_commit_id` is nullable so the first commit has no parent, and Phase 2 can add a second parent column for merges later.

### Project

```
{ id, name, msczPath, lastKnownHash }
```

`lastKnownHash` is the content hash of the working `.mscz` (or imported MusicXML) at the last successful commit. The file watcher compares the current hash against this to enable the Commit action.
