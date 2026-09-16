import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppStatus,
  CommitPreview,
  CommitProgressStage,
  DiffResult,
} from '../shared/types'
import { CommitPanel, type RestoreCommitRequest } from './components/CommitPanel'
import { SettingsBar } from './components/SettingsBar'
import {
  Timeline,
  previousCommitId,
  type CompareSlot,
} from './components/Timeline'
import { DiffView } from './components/DiffView'
import { ScoreView } from './verovio/ScoreView'
import {
  toneForChangeTypes,
  type MeasureHighlight,
} from './verovio/highlightMeasures'
import appIcon from './assets/icon.png'
import { chronologicalCommits } from './components/ScrubBar'

const emptyStatus: AppStatus = {
  project: null,
  commits: [],
  hasUncommittedChanges: false,
  canCommit: false,
  workingHash: null,
  museScorePath: null,
  reminder: 'Open a score to start tracking versions.',
  appVersion: '0.1.0',
  dismissedTips: [],
}

function scoreTitle(project: { name: string; msczPath: string } | null): string {
  if (!project) return 'Version history for MuseScore'
  const file = project.msczPath.split(/[/\\]/).pop()
  if (!file) return project.name
  return file.replace(/\.(mscz|mscx|musicxml|xml)$/i, '') || project.name
}

function highlightsFromDiff(diff: DiffResult | null): MeasureHighlight[] {
  if (!diff) return []
  const byNumber = new Map<number, string[]>()
  for (const m of diff.measures) {
    const types = byNumber.get(m.number) ?? []
    types.push(...m.changes.map((c) => c.type))
    byNumber.set(m.number, types)
  }
  return [...byNumber.entries()].map(([number, types]) => ({
    number,
    tone: toneForChangeTypes(types),
  }))
}

export function App() {
  const [status, setStatus] = useState<AppStatus>(emptyStatus)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [fromId, setFromId] = useState<string | null>(null)
  const [picking, setPicking] = useState<CompareSlot>('to')
  /** MusicXML for the selected timeline commit (may be stale across score switches until reloaded). */
  const [commitMusicXml, setCommitMusicXml] = useState<string | null>(null)
  /** Live MusicXML for the file currently open on disk. */
  const [workingMusicXml, setWorkingMusicXml] = useState<string | null>(null)
  /** Snapshot from Preview diff — preferred while reviewing a commit. */
  const [previewMusicXml, setPreviewMusicXml] = useState<string | null>(null)
  const [compareDiff, setCompareDiff] = useState<DiffResult | null>(null)
  const [previewDiff, setPreviewDiff] = useState<DiffResult | null>(null)
  const [focusedMeasure, setFocusedMeasure] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<CommitProgressStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [scoreSource, setScoreSource] = useState<
    'preview' | 'commit' | 'working' | null
  >(null)
  const [restoreCommitRequest, setRestoreCommitRequest] =
    useState<RestoreCommitRequest | null>(null)
  const [allowCommitAfterRestore, setAllowCommitAfterRestore] = useState(false)
  const activeScorePathRef = useRef<string | null>(null)

  const loadWorkingScore = useCallback(async () => {
    try {
      const xml = await window.allegre.getWorkingMusicXml()
      setWorkingMusicXml(xml)
      return xml
    } catch (err) {
      setWorkingMusicXml(null)
      throw err
    }
  }, [])

  const resetViewForProject = useCallback(() => {
    setCompareMode(false)
    setFromId(null)
    setPicking('to')
    setCompareDiff(null)
    setPreviewDiff(null)
    setPreviewMusicXml(null)
    setCommitMusicXml(null)
    setWorkingMusicXml(null)
    setFocusedMeasure(null)
    setError(null)
    setScoreSource(null)
    setRestoreCommitRequest(null)
    setAllowCommitAfterRestore(false)
  }, [])

  const timelineCommits = useMemo(() => {
    const projectId = status.project?.id
    if (!projectId) return []
    return status.commits.filter((c) => c.projectId === projectId)
  }, [status.project?.id, status.commits])

  const loadedScorePathRef = useRef<string | null>(null)

  useEffect(() => {
    void window.allegre.getStatus().then((s) => {
      activeScorePathRef.current = s.project?.msczPath ?? null
      setStatus(s)
      setSelectedId(null)
    })
    return window.allegre.onStatusChanged((s) => {
      const expected = activeScorePathRef.current
      if (expected && s.project?.msczPath !== expected) return
      setStatus(s)
    })
  }, [])

  useEffect(() => {
    return window.allegre.onCommitProgress(setProgress)
  }, [])

  // Only reset the view when the open *file* changes, not on status refreshes.
  useEffect(() => {
    const scorePath = status.project?.msczPath ?? null
    if (loadedScorePathRef.current === scorePath) return
    loadedScorePathRef.current = scorePath

    resetViewForProject()
    setSelectedId(null)

    if (!scorePath) return

    let cancelled = false
    void (async () => {
      try {
        const xml = await window.allegre.getWorkingMusicXml()
        if (cancelled || loadedScorePathRef.current !== scorePath) return
        setWorkingMusicXml(xml)
        setScoreSource('working')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [status.project?.id, status.project?.msczPath, resetViewForProject])

  useEffect(() => {
    if (!selectedId) {
      setCommitMusicXml(null)
      return
    }
    let cancelled = false
    void window.allegre
      .getCommitMusicXml(selectedId)
      .then((xml) => {
        if (cancelled) return
        setCommitMusicXml(xml)
        setPreviewMusicXml(null)
        setPreviewDiff(null)
        setScoreSource('commit')
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCommitMusicXml(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (selectedId && !timelineCommits.some((c) => c.id === selectedId)) {
      setSelectedId(null)
      setCommitMusicXml(null)
    }
  }, [selectedId, timelineCommits])

  useEffect(() => {
    if (!compareMode || !fromId || !selectedId || fromId === selectedId) {
      setCompareDiff(null)
      return
    }
    let cancelled = false
    void window.allegre
      .diffCommits(fromId, selectedId)
      .then((diff) => {
        if (!cancelled) {
          setCompareDiff(diff)
          setFocusedMeasure(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [compareMode, fromId, selectedId])

  const activeDiff = compareDiff ?? previewDiff
  const highlights = useMemo(
    () => highlightsFromDiff(activeDiff),
    [activeDiff],
  )

  const selectedIsForActiveScore =
    selectedId != null && timelineCommits.some((c) => c.id === selectedId)
  const displayMusicXml = previewMusicXml
    ? previewMusicXml
    : selectedIsForActiveScore
      ? commitMusicXml
      : workingMusicXml
  const selectedCommit = selectedIsForActiveScore
    ? timelineCommits.find((c) => c.id === selectedId) ?? null
    : null

  useEffect(() => {
    if (previewMusicXml) setScoreSource('preview')
    else if (commitMusicXml) setScoreSource('commit')
    else if (workingMusicXml) setScoreSource('working')
    else setScoreSource(null)
  }, [previewMusicXml, commitMusicXml, workingMusicXml])

  const openProject = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const project = await window.allegre.openProject()
      if (!project) return

      activeScorePathRef.current = project.msczPath
      loadedScorePathRef.current = null
      resetViewForProject()
      setSelectedId(null)
      setStatus({
        ...emptyStatus,
        project,
        museScorePath: status.museScorePath,
        reminder: status.reminder,
      })

      const next = await window.allegre.getStatus()
      if (next.project?.msczPath !== project.msczPath) return
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [resetViewForProject])

  const onPreview = useCallback(async (): Promise<CommitPreview> => {
    setBusy(true)
    try {
      const preview = await window.allegre.previewCommit()
      // Always render the score being committed (current file), not the old commit.
      setPreviewMusicXml(preview.musicXml)
      setWorkingMusicXml(preview.musicXml)
      setScoreSource('preview')
      return preview
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
        setPreviewDiff(null)
        setPreviewMusicXml(null)
        setFocusedMeasure(null)
        setCommitMusicXml(preview.musicXml)
        setWorkingMusicXml(preview.musicXml)
        setSelectedId(commit.id)
        setScoreSource('commit')
        setAllowCommitAfterRestore(false)
        setRestoreCommitRequest(null)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const onPreviewDiffChange = useCallback((diff: DiffResult | null) => {
    setPreviewDiff(diff)
    if (!diff) {
      setPreviewMusicXml(null)
    }
  }, [])

  const restore = useCallback(
    async (mode: 'overwrite' | 'export') => {
      if (!selectedId) return
      setBusy(true)
      setError(null)
      try {
        const result = await window.allegre.restoreCommit({
          commitId: selectedId,
          mode,
        })
        if (!result) return
        if (mode === 'overwrite') {
          await loadWorkingScore()
          setPreviewMusicXml(null)
          setPreviewDiff(null)
          setCommitMusicXml(null)
          setSelectedId(null)
          setScoreSource('working')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [selectedId, loadWorkingScore],
  )

  const restoreAndCommit = useCallback(async () => {
    if (!selectedId) return
    const commit = timelineCommits.find((c) => c.id === selectedId)
    if (!commit) return

    setBusy(true)
    setError(null)
    setAllowCommitAfterRestore(true)
    try {
      const result = await window.allegre.restoreCommit({
        commitId: selectedId,
        mode: 'overwrite',
      })
      if (!result) {
        setAllowCommitAfterRestore(false)
        return
      }
      await loadWorkingScore()
      setPreviewMusicXml(null)
      setPreviewDiff(null)
      setCommitMusicXml(null)
      setSelectedId(null)
      setFocusedMeasure(null)
      setScoreSource('working')
      setRestoreCommitRequest({
        message: `Restored to: ${commit.message}`,
        token: Date.now(),
      })
    } catch (err) {
      setAllowCommitAfterRestore(false)
      setRestoreCommitRequest(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [selectedId, timelineCommits, loadWorkingScore])

  const enterCompare = useCallback(() => {
    const baseline = previousCommitId(timelineCommits, selectedId)
    if (!baseline) return
    setPreviewMusicXml(null)
    setPreviewDiff(null)
    setCompareMode(true)
    setFromId(baseline)
    setPicking('to')
    setFocusedMeasure(null)
  }, [timelineCommits, selectedId])

  const exitCompare = useCallback(() => {
    setCompareMode(false)
    setFromId(null)
    setPicking('to')
    setCompareDiff(null)
    setFocusedMeasure(null)
  }, [])

  const setFromCommit = useCallback(
    (id: string) => {
      if (id === selectedId) {
        setPicking('to')
        return
      }
      setFromId(id)
      setPicking('to')
      setFocusedMeasure(null)
    },
    [selectedId],
  )

  const setToCommit = useCallback(
    (id: string) => {
      if (id === fromId) {
        setPicking('from')
        return
      }
      setPreviewMusicXml(null)
      setPreviewDiff(null)
      setSelectedId(id)
      setPicking('to')
      setFocusedMeasure(null)
    },
    [fromId],
  )

  const swapCompare = useCallback(() => {
    if (!fromId || !selectedId) return
    const nextFrom = selectedId
    const nextTo = fromId
    setPreviewMusicXml(null)
    setPreviewDiff(null)
    setFromId(nextFrom)
    setSelectedId(nextTo)
    setPicking('to')
    setFocusedMeasure(null)
  }, [fromId, selectedId])

  const clearHistory = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.allegre.clearHistory()
      if (!result) return
      setSelectedId(null)
      setCommitMusicXml(null)
      setPreviewMusicXml(null)
      setPreviewDiff(null)
      setCompareDiff(null)
      setCompareMode(false)
      setFromId(null)
      setFocusedMeasure(null)
      setAllowCommitAfterRestore(false)
      setRestoreCommitRequest(null)
      setScoreSource('working')
      try {
        await loadWorkingScore()
      } catch {
        // Score may still load via status refresh
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [loadWorkingScore])

  const sourceLabel = previewMusicXml
    ? 'Showing: current score (preview)'
    : selectedCommit
      ? `Showing: ${selectedCommit.message}`
      : workingMusicXml
        ? 'Showing: current score'
        : null

  const needsMuseScore =
    Boolean(status.project) &&
    !status.museScorePath &&
    /\.(mscz|mscx)$/i.test(status.project?.msczPath ?? '')

  const showRestoreTip =
    Boolean(status.project) &&
    timelineCommits.length > 0 &&
    !(status.dismissedTips ?? []).includes('restore-lossy')

  const selectCommitFromScrub = useCallback(
    (id: string) => {
      setPreviewMusicXml(null)
      setPreviewDiff(null)
      setCommitMusicXml(null)
      setSelectedId(id)
      setFocusedMeasure(null)
    },
    [],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return
      }

      if (event.key === 'Escape' && compareMode) {
        event.preventDefault()
        exitCompare()
        return
      }

      if (compareMode || busy || timelineCommits.length < 2) return

      const ordered = chronologicalCommits(timelineCommits)
      const at = ordered.findIndex((c) => c.id === selectedId)
      const index = at >= 0 ? at : ordered.length - 1

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const prev = ordered[index - 1]
        if (prev) selectCommitFromScrub(prev.id)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        const next = ordered[index + 1]
        if (next) selectCommitFromScrub(next.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    busy,
    compareMode,
    exitCompare,
    selectedId,
    selectCommitFromScrub,
    timelineCommits,
  ])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-mark"
            src={appIcon}
            width={28}
            height={28}
            alt=""
          />
          <div>
            <div className="brand-name-row">
              <div className="brand-name">AllegreVCS</div>
              <span className="alpha-badge" title={`v${status.appVersion}`}>
                Alpha
              </span>
            </div>
            <div className="brand-sub" title={status.project?.msczPath}>
              {scoreTitle(status.project)}
            </div>
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
          <SettingsBar
            museScorePath={status.museScorePath}
            busy={busy}
            onPickMuseScore={() => {
              void (async () => {
                setBusy(true)
                try {
                  await window.allegre.pickMuseScore()
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          />
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
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
            {status.project?.msczPath
              ? status.project.msczPath.split(/[/\\]/).pop()
              : 'No score open'}
          </p>
          <Timeline
            key={status.project?.msczPath ?? 'no-project'}
            commits={timelineCommits}
            selectedId={selectedId}
            compareMode={compareMode}
            fromId={fromId}
            picking={picking}
            hasOpenScore={Boolean(status.project)}
            onSelectWorking={() => {
              setPreviewMusicXml(null)
              setPreviewDiff(null)
              setCommitMusicXml(null)
              setSelectedId(null)
              setFocusedMeasure(null)
              setScoreSource('working')
            }}
            onSelect={selectCommitFromScrub}
            onEnterCompare={enterCompare}
            onExitCompare={exitCompare}
            onPickSlot={setPicking}
            onSetFrom={setFromCommit}
            onSetTo={setToCommit}
            onSwap={swapCompare}
            onClearHistory={() => void clearHistory()}
            clearHistoryDisabled={busy}
          />
        </aside>

        <main className="panel panel-score">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '0.75rem',
            }}
          >
            <h2 className="panel-title" style={{ marginBottom: 0 }}>
              Score
            </h2>
            {sourceLabel && (
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {sourceLabel}
              </span>
            )}
          </div>
          {needsMuseScore && (
            <div className="info-banner">
              MuseScore CLI not found. Use <strong>Locate MuseScore…</strong> in
              the top bar so AllegreVCS can convert <code>.mscz</code> files.
            </div>
          )}
          {showRestoreTip && (
            <div className="info-banner tip-banner">
              <div>
                <strong>Restore is lossy for layout.</strong> Musical content is
                preserved via MusicXML, but MuseScore engraving tweaks may change.
                Prefer <em>Export this version…</em> when you want a safe copy.
              </div>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => {
                  void window.allegre.dismissTip('restore-lossy').then(setStatus)
                }}
              >
                Got it
              </button>
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          {!status.project ? (
            <div className="empty-state">
              <strong>Open a MuseScore file to begin</strong>
              <p className="muted" style={{ margin: '0.45rem 0 0.85rem' }}>
                AllegreVCS watches your score, diffs versions, and keeps a local
                timeline — MuseScore stays your editor.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void openProject()}
              >
                Open score…
              </button>
            </div>
          ) : selectedIsForActiveScore && !commitMusicXml && !previewMusicXml ? (
            <div className="empty-state muted">Loading this version…</div>
          ) : !displayMusicXml ? (
            <div className="empty-state muted">
              {needsMuseScore
                ? 'Locate MuseScore to render this score.'
                : 'Loading current score…'}
            </div>
          ) : (
            <ScoreView
              key={`${status.project?.msczPath ?? 'none'}:${selectedId ?? 'working'}`}
              musicXml={displayMusicXml}
              highlights={highlights}
              focusedMeasure={focusedMeasure}
            />
          )}
          {compareMode && (
            <div className="compare-diff-panel">
              {fromId && selectedId && fromId !== selectedId ? (
                compareDiff ? (
                  <DiffView
                    diff={compareDiff}
                    title="From → To"
                    focusedMeasure={focusedMeasure}
                    onMeasureClick={setFocusedMeasure}
                  />
                ) : (
                  <p className="muted">Computing diff…</p>
                )
              ) : (
                <p className="muted">Pick two different commits to see a diff.</p>
              )}
            </div>
          )}
          {selectedId && (
            <div className="restore-block">
              <p className="restore-note muted">
                Overwrite confirms first. Export writes a new file and leaves your
                working score alone.
              </p>
              <div className="restore-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void restoreAndCommit()}
                >
                  Restore &amp; commit…
                </button>
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
                  Restore without committing
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className="panel panel-commit">
          <h2 className="panel-title">Commit</h2>
          <CommitPanel
            canCommit={Boolean(status.canCommit || allowCommitAfterRestore)}
            reminder={status.reminder}
            busy={busy}
            progress={progress}
            focusedMeasure={focusedMeasure}
            workingHash={status.workingHash}
            restoreCommitRequest={restoreCommitRequest}
            onRestoreCommitRequestConsumed={() => setRestoreCommitRequest(null)}
            onRestoreCommitFailed={() => setAllowCommitAfterRestore(false)}
            onPreview={onPreview}
            onConfirm={onConfirm}
            onPreviewDiffChange={onPreviewDiffChange}
            onMeasureClick={setFocusedMeasure}
          />
        </aside>
      </div>

      <footer className="app-footer muted">
        <span>
          AllegreVCS v{status.appVersion} · local MuseScore history (alpha)
        </span>
        <span className="footer-hints">
          ← → scrub · Esc exits compare
        </span>
      </footer>
    </div>
  )
}
