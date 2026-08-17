import type { DiffResult } from '../../shared/types'

interface DiffViewProps {
  diff: DiffResult | null
  title?: string
  focusedMeasure?: number | null
  onMeasureClick?: (measureNumber: number) => void
  hideSummary?: boolean
}

export function DiffView({
  diff,
  title = 'Diff',
  focusedMeasure = null,
  onMeasureClick,
  hideSummary = false,
}: DiffViewProps) {
  if (!diff) {
    return <p className="muted">No diff to show.</p>
  }

  return (
    <div>
      <h3 className="panel-title">{title}</h3>
      {!hideSummary && (
        <div className="diff-summary">
          <div className="diff-stat">
            <strong>{diff.summary.additions}</strong>
            <span className="muted">additions</span>
          </div>
          <div className="diff-stat">
            <strong>{diff.summary.deletions}</strong>
            <span className="muted">deletions</span>
          </div>
          <div className="diff-stat">
            <strong>{diff.summary.changes}</strong>
            <span className="muted">changes</span>
          </div>
        </div>
      )}
      {diff.measures.length === 0 ? (
        <p className="muted">No measure-level changes detected.</p>
      ) : (
        <ul className="diff-measures">
          {diff.measures.map((m) => {
            const active = focusedMeasure === m.number
            return (
              <li key={`${m.part}-${m.number}`}>
                <button
                  type="button"
                  className={`diff-measure${active ? ' active' : ''}${
                    onMeasureClick ? ' clickable' : ''
                  }`}
                  onClick={() => onMeasureClick?.(m.number)}
                  disabled={!onMeasureClick}
                >
                  <strong>
                    {m.part} · m.{m.number}
                  </strong>
                  <div className="muted">
                    {m.changes.map((c) => c.type).join(', ')}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
