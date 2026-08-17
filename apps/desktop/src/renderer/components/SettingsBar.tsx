interface SettingsBarProps {
  museScorePath: string | null
  busy: boolean
  onPickMuseScore: () => void
}

export function SettingsBar({
  museScorePath,
  busy,
  onPickMuseScore,
}: SettingsBarProps) {
  const missing = !museScorePath
  return (
    <div className="settings-bar">
      <span
        className={`status-chip ${missing ? 'dirty' : 'clean'}`}
        title={museScorePath ?? 'MuseScore CLI not found'}
      >
        {missing ? 'MuseScore CLI missing' : 'MuseScore CLI ready'}
      </span>
      <button
        type="button"
        className="btn btn-quiet"
        disabled={busy}
        onClick={onPickMuseScore}
      >
        {missing ? 'Locate MuseScore…' : 'Change…'}
      </button>
    </div>
  )
}
