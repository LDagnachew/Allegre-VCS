import type { Commit } from '../../shared/types'

interface TimelineProps {
  commits: Commit[]
  selectedId: string | null
  compareId: string | null
  onSelect: (id: string) => void
  onToggleCompare: (id: string) => void
}

export function Timeline({
  commits,
  selectedId,
  compareId,
  onSelect,
  onToggleCompare,
}: TimelineProps) {
  if (commits.length === 0) {
    return (
      <div className="empty-state muted">
        No commits yet. Open a score and make your first commit.
      </div>
    )
  }

  return (
    <ul className="timeline-list">
      {commits.map((commit) => {
        const active = commit.id === selectedId
        const comparing = commit.id === compareId
        return (
          <li key={commit.id}>
            <button
              type="button"
              className={`timeline-item${active ? ' active' : ''}`}
              onClick={() => onSelect(commit.id)}
            >
              <div className="timeline-msg">{commit.message}</div>
              <div className="timeline-meta">
                {new Date(commit.timestamp).toLocaleString()}
                {comparing ? ' · compare' : ''}
              </div>
              <div className="timeline-meta mono">
                {commit.blobHash.slice(0, 10)}
              </div>
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4, width: '100%' }}
              onClick={() => onToggleCompare(commit.id)}
            >
              {comparing ? 'Clear compare' : 'Compare with selected'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
