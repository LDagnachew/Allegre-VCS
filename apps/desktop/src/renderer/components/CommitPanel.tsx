import { useState } from 'react'
import type { CommitPreview, DiffResult } from '../../shared/types'
import { DiffView } from './DiffView'

interface CommitPanelProps {
  canCommit: boolean
  reminder: string
  busy: boolean
  onPreview: () => Promise<CommitPreview>
  onConfirm: (message: string, preview: CommitPreview) => Promise<void>
  compareDiff: DiffResult | null
}

export function CommitPanel({
  canCommit,
  reminder,
  busy,
  onPreview,
  onConfirm,
  compareDiff,
}: CommitPanelProps) {
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<CommitPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePreview(): Promise<void> {
    setError(null)
    try {
      const next = await onPreview()
      setPreview(next)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
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
        <div style={{ marginTop: '1rem' }}>
          <DiffView
            diff={{ summary: preview.summary, measures: preview.measures }}
            title="Working tree diff"
          />
        </div>
      )}

      {compareDiff && (
        <div style={{ marginTop: '1.25rem' }}>
          <DiffView diff={compareDiff} title="Commit compare" />
        </div>
      )}
    </div>
  )
}
