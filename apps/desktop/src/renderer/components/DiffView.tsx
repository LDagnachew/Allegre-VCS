import { useMemo, useState } from 'react'
import type { DiffResult } from '../../shared/types'

interface DiffViewProps {
  diff: DiffResult | null
  title?: string
  focusedMeasure?: number | null
  onMeasureClick?: (measureNumber: number) => void
  hideSummary?: boolean
}

interface GroupedMeasure {
  number: number
  parts: string[]
  types: string[]
}

const INITIAL_ROWS = 60

function groupByMeasure(
  measures: DiffResult['measures'],
): GroupedMeasure[] {
  const map = new Map<number, { parts: string[]; types: Set<string> }>()
  for (const m of measures) {
    let group = map.get(m.number)
    if (!group) {
      group = { parts: [], types: new Set() }
      map.set(m.number, group)
    }
    if (!group.parts.includes(m.part)) group.parts.push(m.part)
    for (const change of m.changes) group.types.add(change.type)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, g]) => ({
      number,
      parts: g.parts,
      types: [...g.types],
    }))
}

function partsLabel(parts: string[]): string {
  if (parts.length <= 2) return parts.join(', ')
  return `${parts.slice(0, 2).join(', ')} +${parts.length - 2}`
}

export function DiffView({
  diff,
  title = 'Diff',
  focusedMeasure = null,
  onMeasureClick,
  hideSummary = false,
}: DiffViewProps) {
  const [showAll, setShowAll] = useState(false)

  const grouped = useMemo(
    () => (diff ? groupByMeasure(diff.measures) : []),
    [diff],
  )

  if (!diff) {
    return <p className="muted">No diff to show.</p>
  }

  const visible = showAll ? grouped : grouped.slice(0, INITIAL_ROWS)
  const hiddenCount = grouped.length - visible.length

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
      {grouped.length === 0 ? (
        <p className="muted">No measure-level changes detected.</p>
      ) : (
        <>
          <p className="muted diff-group-meta">
            {grouped.length} measure{grouped.length === 1 ? '' : 's'}
            {diff.measures.length > grouped.length
              ? ` · ${diff.measures.length} part rows collapsed`
              : ''}
          </p>
          <ul className="diff-measures">
            {visible.map((m) => {
              const active = focusedMeasure === m.number
              return (
                <li key={m.number}>
                  <button
                    type="button"
                    className={`diff-measure${active ? ' active' : ''}${
                      onMeasureClick ? ' clickable' : ''
                    }`}
                    onClick={() => onMeasureClick?.(m.number)}
                    disabled={!onMeasureClick}
                  >
                    <strong>
                      m.{m.number}
                      {m.parts.length > 0 ? ` · ${partsLabel(m.parts)}` : ''}
                    </strong>
                    <div className="muted">{m.types.join(', ')}</div>
                  </button>
                </li>
              )
            })}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn diff-show-more"
              onClick={() => setShowAll(true)}
            >
              Show {hiddenCount} more…
            </button>
          )}
          {showAll && grouped.length > INITIAL_ROWS && (
            <button
              type="button"
              className="btn diff-show-more"
              onClick={() => setShowAll(false)}
            >
              Show fewer
            </button>
          )}
        </>
      )}
    </div>
  )
}
