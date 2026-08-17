import { useState } from 'react'
import type {
  CommitPreview,
  CommitProgressStage,
  DiffResult,
} from '../../shared/types'
import { DiffView } from './DiffView'

const PROGRESS_COPY: Record<Exclude<CommitProgressStage, 'idle'>, string> = {
  converting: 'Converting score with MuseScore…',
  diffing: 'Comparing with last commit…',
  saving: 'Saving snapshot…',
}

interface CommitPanelProps {
  canCommit: boolean
  reminder: string
  busy: boolean
  progress: CommitProgressStage
  focusedMeasure: number | null
  onPreview: () => Promise<CommitPreview>
  onConfirm: (message: string, preview: CommitPreview) => Promise<void>
  onPreviewDiffChange: (diff: DiffResult | null) => void
  onMeasureClick: (measureNumber: number) => void
}

export function CommitPanel({
  canCommit,
  reminder,
  busy,
  progress,
  focusedMeasure,
  onPreview,
  onConfirm,
  onPreviewDiffChange,
  onMeasureClick,
}: CommitPanelProps) {
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<CommitPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePreview(): Promise<void> {
    setError(null)
    try {
      const next = await onPreview()
      setPreview(next)
      onPreviewDiffChange({
        summary: next.summary,
        measures: next.measures,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!preview) return
    setError(null)
    try {
      await onConfirm(message, preview)
      setMessage('')
      setPreview(null)
      onPreviewDiffChange(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const stageCopy =
    progress !== 'idle' ? PROGRESS_COPY[progress] : busy ? 'Working…' : null
  const firstSnapshot =
    preview &&
    preview.measures.length === 0 &&
    preview.summary.additions <= 1 &&
    preview.summary.deletions === 0

  return (
    <div className="commit-panel">
      {stageCopy && (
        <div className="commit-progress" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>{stageCopy}</strong>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              This can take a few seconds on large scores.
            </div>
          </div>
        </div>
      )}

      <div className="reminder">{reminder}</div>

      <div className="field">
        <label htmlFor="commit-message">Commit message</label>
        <textarea
          id="commit-message"
          rows={3}
          placeholder="What changed in this version?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          disabled={!canCommit || busy}
          onClick={() => void handlePreview()}
        >
          Preview diff
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!preview || busy}
          onClick={() => void handleConfirm()}
        >
          Commit
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {preview && (
        <div className="commit-ready">
          <h3 className="panel-title" style={{ marginBottom: '0.35rem' }}>
            Ready to commit
          </h3>
          {firstSnapshot ? (
            <p className="muted" style={{ marginTop: 0 }}>
              First snapshot of this score.
            </p>
          ) : (
            <div className="diff-summary">
              <div className="diff-stat">
                <strong>{preview.summary.additions}</strong>
                <span className="muted">additions</span>
              </div>
              <div className="diff-stat">
                <strong>{preview.summary.deletions}</strong>
                <span className="muted">deletions</span>
              </div>
              <div className="diff-stat">
                <strong>{preview.summary.changes}</strong>
                <span className="muted">changes</span>
              </div>
            </div>
          )}
          <DiffView
            diff={{ summary: preview.summary, measures: preview.measures }}
            title="Changed measures"
            hideSummary
            focusedMeasure={focusedMeasure}
            onMeasureClick={onMeasureClick}
          />
        </div>
      )}
    </div>
  )
}
