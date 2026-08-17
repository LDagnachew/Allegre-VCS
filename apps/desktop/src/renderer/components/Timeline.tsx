import type { Commit } from '../../shared/types'

export type CompareSlot = 'from' | 'to'

interface TimelineProps {
  commits: Commit[]
  selectedId: string | null
  compareMode: boolean
  fromId: string | null
  picking: CompareSlot
  hasOpenScore: boolean
  onSelectWorking: () => void
  onSelect: (id: string) => void
  onEnterCompare: () => void
  onExitCompare: () => void
  onPickSlot: (slot: CompareSlot) => void
  onSetFrom: (id: string) => void
  onSetTo: (id: string) => void
  onSwap: () => void
}

export function commitShortLabel(commit: Commit): string {
  const when = new Date(commit.timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const msg =
    commit.message.length > 28
      ? `${commit.message.slice(0, 25)}…`
      : commit.message
  return `${msg} · ${when}`
}

export function previousCommitId(
  commits: Commit[],
  selectedId: string | null,
): string | null {
  if (commits.length < 2) return null
  const toId =
    selectedId && commits.some((c) => c.id === selectedId)
      ? selectedId
      : commits[0].id
  const index = commits.findIndex((c) => c.id === toId)
  const older = commits[index + 1]
  if (older) return older.id
  return commits.find((c) => c.id !== toId)?.id ?? null
}

export function Timeline({
  commits,
  selectedId,
  compareMode,
  fromId,
  picking,
  hasOpenScore,
  onSelectWorking,
  onSelect,
  onEnterCompare,
  onExitCompare,
  onPickSlot,
  onSetFrom,
  onSetTo,
  onSwap,
}: TimelineProps) {
  const workingSelected = hasOpenScore && selectedId === null && !compareMode
  const fromCommit = commits.find((c) => c.id === fromId) ?? null
  const toCommit = commits.find((c) => c.id === selectedId) ?? null
  const canCompare = commits.length >= 2

  function handleItemClick(id: string): void {
    if (!compareMode) {
      onSelect(id)
      return
    }
    if (picking === 'from') {
      onSetFrom(id)
    } else {
      onSetTo(id)
    }
  }

  if (!hasOpenScore) {
    return (
      <div className="empty-state muted">
        Open a score to see its timeline.
      </div>
    )
  }

  return (
    <div className="timeline">
      <div className="compare-bar">
        {compareMode ? (
          <>
            <div className="compare-bar-header">
              <span className="compare-bar-title">Compare</span>
              <button type="button" className="btn btn-quiet" onClick={onExitCompare}>
                Done
              </button>
            </div>
            <p className="compare-hint muted">
              {picking === 'from'
                ? 'Click a commit to set the baseline (From).'
                : 'Click a commit to set the version to inspect (To).'}
            </p>
            <div className="compare-slots">
              <button
                type="button"
                className={`compare-slot${picking === 'from' ? ' picking' : ''}`}
                onClick={() => onPickSlot('from')}
              >
                <span className="compare-slot-label">From</span>
                <span className="compare-slot-value">
                  {fromCommit ? commitShortLabel(fromCommit) : 'Select baseline'}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-quiet compare-swap"
                onClick={onSwap}
                disabled={!fromId || !selectedId || fromId === selectedId}
                title="Swap From and To"
              >
                ⇄
              </button>
              <button
                type="button"
                className={`compare-slot${picking === 'to' ? ' picking' : ''}`}
                onClick={() => onPickSlot('to')}
              >
                <span className="compare-slot-label">To</span>
                <span className="compare-slot-value">
                  {toCommit ? commitShortLabel(toCommit) : 'Select version'}
                </span>
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            style={{ width: '100%' }}
            disabled={!canCompare}
            onClick={onEnterCompare}
            title={
              canCompare
                ? 'Compare two commits'
                : 'Need at least two commits to compare'
            }
          >
            Compare versions
          </button>
        )}
      </div>

      <ul className="timeline-list">
        <li>
          <button
            type="button"
            className={`timeline-item${workingSelected ? ' active' : ''}`}
            onClick={onSelectWorking}
            disabled={compareMode}
          >
            <div className="timeline-item-top">
              <div className="timeline-msg">Current score</div>
              <span className="role-badge to">Live</span>
            </div>
            <div className="timeline-meta">
              What’s on disk right now — not a commit
            </div>
          </button>
        </li>
        {commits.length === 0 ? (
          <li>
            <div className="empty-state muted" style={{ marginTop: 4 }}>
              No commits yet for this score.
            </div>
          </li>
        ) : (
          commits.map((commit) => {
            const isTo = commit.id === selectedId
            const isFrom = commit.id === fromId
            const active = compareMode ? isTo || isFrom : isTo
            return (
              <li key={commit.id}>
                <button
                  type="button"
                  className={`timeline-item${active ? ' active' : ''}${
                    isFrom && compareMode ? ' is-from' : ''
                  }${isTo && compareMode ? ' is-to' : ''}`}
                  onClick={() => handleItemClick(commit.id)}
                >
                  <div className="timeline-item-top">
                    <div className="timeline-msg">{commit.message}</div>
                    {compareMode && (isFrom || isTo) && (
                      <span
                        className={`role-badge ${isFrom && isTo ? 'both' : isFrom ? 'from' : 'to'}`}
                      >
                        {isFrom && isTo ? 'From & To' : isFrom ? 'From' : 'To'}
                      </span>
                    )}
                  </div>
                  <div className="timeline-meta">
                    {new Date(commit.timestamp).toLocaleString()}
                  </div>
                  <div className="timeline-meta mono">
                    {commit.blobHash.slice(0, 10)}
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
