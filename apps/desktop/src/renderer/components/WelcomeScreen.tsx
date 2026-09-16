import appIcon from '../assets/icon.png'

interface WelcomeScreenProps {
  appVersion: string
  museScorePath: string | null
  busy: boolean
  onOpenScore: () => void
  onPickMuseScore: () => void
}

export function WelcomeScreen({
  appVersion,
  museScorePath,
  busy,
  onOpenScore,
  onPickMuseScore,
}: WelcomeScreenProps) {
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <img className="welcome-mark" src={appIcon} width={72} height={72} alt="" />
        <h1 className="welcome-title">AllegreVCS</h1>
        <p className="welcome-tagline">
          Version history for MuseScore — commit, compare, and restore without
          leaving your editor.
        </p>
        <div className="welcome-cta">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={onOpenScore}
          >
            Open score…
          </button>
          {!museScorePath && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onPickMuseScore}
            >
              Locate MuseScore…
            </button>
          )}
        </div>
        <p className="welcome-meta muted">
          v{appVersion} · alpha · local only
          {museScorePath ? ' · MuseScore ready' : ' · MuseScore not detected yet'}
        </p>
      </div>

      <div className="welcome-grid">
        <section className="welcome-card">
          <h2>Start</h2>
          <ul className="welcome-list">
            <li>
              <button
                type="button"
                className="welcome-link"
                disabled={busy}
                onClick={onOpenScore}
              >
                Open a <code>.mscz</code> score…
              </button>
            </li>
            <li>
              <button
                type="button"
                className="welcome-link"
                disabled={busy}
                onClick={onPickMuseScore}
              >
                {museScorePath ? 'Change MuseScore CLI…' : 'Locate MuseScore CLI…'}
              </button>
            </li>
          </ul>
        </section>

        <section className="welcome-card">
          <h2>How it works</h2>
          <ol className="welcome-steps">
            <li>Open your score here (AllegreVCS watches the file).</li>
            <li>Compose and save as usual in MuseScore.</li>
            <li>Preview the diff, then commit a version.</li>
            <li>Browse the timeline, scrub history, or restore.</li>
          </ol>
        </section>

        <section className="welcome-card">
          <h2>Good to know</h2>
          <ul className="welcome-notes">
            <li>Requires MuseScore 4 for <code>.mscz</code> conversion.</li>
            <li>History stays on this Mac — nothing is uploaded.</li>
            <li>
              Restore keeps the music; layout/style tweaks may look different.
            </li>
            <li>Branching and cloud sync are not in this alpha.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
