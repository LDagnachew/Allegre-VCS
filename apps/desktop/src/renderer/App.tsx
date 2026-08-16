import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppStatus,
  CommitPreview,
  DiffResult,
} from '../shared/types'
import { CommitPanel } from './components/CommitPanel'
import { Timeline } from './components/Timeline'
import { ScoreView } from './verovio/ScoreView'

const emptyStatus: AppStatus = {
  project: null,
  commits: [],
  hasUncommittedChanges: false,
  museScorePath: null,
  reminder: 'Save your score in MuseScore before committing.',
}

export function App() {
  const [status, setStatus] = useState<AppStatus>(emptyStatus)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<string | null>(null)
  const [musicXml, setMusicXml] = useState<string | null>(null)
  const [compareDiff, setCompareDiff] = useState<DiffResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.allegre.getStatus().then((s) => {
      setStatus(s)
      if (s.commits[0]) setSelectedId(s.commits[0].id)
    })
    return window.allegre.onStatusChanged((s) => setStatus(s))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMusicXml(null)
      return
    }
    let cancelled = false
    void window.allegre
      .getCommitMusicXml(selectedId)
      .then((xml) => {
        if (!cancelled) setMusicXml(xml)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !compareId || selectedId === compareId) {
      setCompareDiff(null)
      return
    }
    let cancelled = false
    void window.allegre
      .diffCommits(compareId, selectedId)
      .then((diff) => {
        if (!cancelled) setCompareDiff(diff)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, compareId])

  const highlightMeasures = useMemo(() => {
    const source = compareDiff
    if (!source) return []
    return [...new Set(source.measures.map((m) => m.number))]
  }, [compareDiff])

  const openProject = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      await window.allegre.openProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const onPreview = useCallback(async (): Promise<CommitPreview> => {
    setBusy(true)
    try {
      return await window.allegre.previewCommit()
    } finally {
      setBusy(false)
    }
  }, [])

  const onConfirm = useCallback(
    async (message: string, preview: CommitPreview) => {
      setBusy(true)
      try {
        const commit = await window.allegre.confirmCommit({
          message,
          musicXml: preview.musicXml,
          workingHash: preview.workingHash,
        })
        setSelectedId(commit.id)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const restore = useCallback(
    async (mode: 'overwrite' | 'export') => {
      if (!selectedId) return
      setBusy(true)
      setError(null)
      try {
        await window.allegre.restoreCommit({ commitId: selectedId, mode })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [selectedId],
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-name">AllegreVCS</div>
          <div className="brand-sub">
            {status.project
              ? status.project.name
              : 'Version history for MuseScore'}
          </div>
        </div>
        <div className="topbar-actions">
          {status.project && (
            <span
              className={`status-chip ${
                status.hasUncommittedChanges ? 'dirty' : 'clean'
              }`}
            >
              {status.hasUncommittedChanges ? 'Uncommitted changes' : 'Clean'}
            </span>
          )}
          <span className="muted mono" title={status.museScorePath ?? undefined}>
            {status.museScorePath
              ? 'MuseScore CLI ready'
              : 'MuseScore CLI missing'}
          </span>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void openProject()}
          >
            Open score…
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel panel-timeline">
          <h2 className="panel-title">Timeline</h2>
          <Timeline
            commits={status.commits}
            selectedId={selectedId}
            compareId={compareId}
            onSelect={setSelectedId}
            onToggleCompare={(id) =>
              setCompareId((prev) => (prev === id ? null : id))
            }
          />
        </aside>

        <main className="panel panel-score">
          <h2 className="panel-title">Score</h2>
          {error && <div className="error-banner">{error}</div>}
          <ScoreView musicXml={musicXml} highlightMeasures={highlightMeasures} />
          {selectedId && (
            <div className="restore-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void restore('export')}
              >
                Export this version…
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void restore('overwrite')}
              >
                Restore over working file
              </button>
            </div>
          )}
        </main>

        <aside className="panel panel-commit">
          <h2 className="panel-title">Commit</h2>
          <CommitPanel
            canCommit={Boolean(status.project && status.hasUncommittedChanges)}
            reminder={status.reminder}
            busy={busy}
            onPreview={onPreview}
            onConfirm={onConfirm}
            compareDiff={compareDiff}
          />
        </aside>
      </div>
    </div>
  )
}
