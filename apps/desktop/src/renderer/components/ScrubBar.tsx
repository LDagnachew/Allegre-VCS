import { useEffect, useMemo, useRef, useState } from 'react'
import type { Commit } from '../../shared/types'
import { commitShortLabel } from './Timeline'

interface ScrubBarProps {
  commits: Commit[]
  selectedId: string | null
  disabled?: boolean
  onSelect: (id: string) => void
}

/** Chronological order: oldest → newest for Flat.io-style scrubbing. */
export function chronologicalCommits(commits: Commit[]): Commit[] {
  return [...commits].reverse()
}

export function ScrubBar({
  commits,
  selectedId,
  disabled = false,
  onSelect,
}: ScrubBarProps) {
  const ordered = useMemo(() => chronologicalCommits(commits), [commits])
  const [playing, setPlaying] = useState(false)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const index = ordered.findIndex((c) => c.id === selectedId)
  const activeIndex =
    selectedId && index >= 0 ? index : Math.max(0, ordered.length - 1)
  const current = ordered[activeIndex] ?? null

  useEffect(() => {
    if (!playing || disabled || ordered.length < 2) return

    const timer = window.setInterval(() => {
      const orderedNow = ordered
      const at = orderedNow.findIndex((c) => c.id === selectedIdRef.current)
      const next = (at >= 0 ? at : -1) + 1
      if (next >= orderedNow.length) {
        setPlaying(false)
        return
      }
      onSelectRef.current(orderedNow[next].id)
    }, 900)

    return () => window.clearInterval(timer)
  }, [playing, disabled, ordered])

  useEffect(() => {
    if (disabled || ordered.length < 2) setPlaying(false)
  }, [disabled, ordered.length])

  if (ordered.length < 2) return null

  return (
    <div className={`scrub-bar${disabled ? ' disabled' : ''}`}>
      <div className="scrub-bar-header">
        <span className="scrub-bar-title">Scrub history</span>
        <div className="scrub-controls">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled || activeIndex <= 0}
            title="Previous version (←)"
            onClick={() => {
              setPlaying(false)
              const prev = ordered[activeIndex - 1]
              if (prev) onSelect(prev.id)
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled}
            onClick={() => {
              if (playing) {
                setPlaying(false)
                return
              }
              const at = ordered.findIndex((c) => c.id === selectedId)
              if (at < 0 || at >= ordered.length - 1) {
                onSelect(ordered[0].id)
              }
              setPlaying(true)
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled || activeIndex >= ordered.length - 1}
            title="Next version (→)"
            onClick={() => {
              setPlaying(false)
              const next = ordered[activeIndex + 1]
              if (next) onSelect(next.id)
            }}
          >
            →
          </button>
        </div>
      </div>
      <input
        type="range"
        className="scrub-slider"
        min={0}
        max={ordered.length - 1}
        step={1}
        value={activeIndex}
        disabled={disabled}
        aria-label="Scrub through commits"
        onChange={(e) => {
          setPlaying(false)
          const next = ordered[Number(e.target.value)]
          if (next) onSelect(next.id)
        }}
      />
      <div className="scrub-meta muted">
        {current
          ? `${activeIndex + 1} / ${ordered.length} · ${commitShortLabel(current)}`
          : `${ordered.length} versions`}
      </div>
    </div>
  )
}
