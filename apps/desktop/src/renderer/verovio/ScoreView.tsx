import { useEffect, useMemo, useRef, useState } from 'react'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import {
  applyMeasureHighlights,
  scrollToMeasure,
  type MeasureHighlight,
} from './highlightMeasures'

let toolkitPromise: Promise<VerovioToolkit> | null = null

function getToolkit(): Promise<VerovioToolkit> {
  if (!toolkitPromise) {
    toolkitPromise = createVerovioModule().then(
      (VerovioModule: unknown) => new VerovioToolkit(VerovioModule),
    )
  }
  return toolkitPromise
}

interface ScoreViewProps {
  musicXml: string | null
  highlights?: MeasureHighlight[]
  focusedMeasure?: number | null
}

export function ScoreView({
  musicXml,
  highlights = [],
  focusedMeasure = null,
}: ScoreViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const toolkitRef = useRef<VerovioToolkit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(0)

  const highlightKey = useMemo(
    () =>
      highlights.map((h) => `${h.number}:${h.tone ?? 'changed'}`).join(','),
    [highlights],
  )

  useEffect(() => {
    let cancelled = false

    async function render(): Promise<void> {
      if (!musicXml || !hostRef.current) {
        if (hostRef.current) hostRef.current.innerHTML = ''
        setRendered((n) => n + 1)
        return
      }

      try {
        const tk = await getToolkit()
        toolkitRef.current = tk
        if (cancelled) return

        tk.setOptions({
          scale: 40,
          pageWidth: 1800,
          pageHeight: 2400,
          footer: 'none',
          header: 'none',
          breaks: 'encoded',
          inputFrom: 'musicxml',
          svgViewBox: true,
          // Expose measure numbers via getElementAttr when available
          svgAdditionalAttribute: ['measure@n', 'measure@label'],
        })
        tk.loadData(musicXml)
        const pageCount = tk.getPageCount()
        const pages: string[] = []
        for (let page = 1; page <= pageCount; page += 1) {
          pages.push(tk.renderToSVG(page))
        }
        if (cancelled || !hostRef.current) return
        hostRef.current.innerHTML = pages.join('\n')
        setError(null)
        setRendered((n) => n + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [musicXml])

  useEffect(() => {
    const host = hostRef.current
    const tk = toolkitRef.current
    if (!host || !tk || !musicXml) return

    applyMeasureHighlights(host, tk, highlights, focusedMeasure)

    if (focusedMeasure != null) {
      // Defer until rects exist in layout
      requestAnimationFrame(() => scrollToMeasure(host, focusedMeasure))
    }
  }, [highlightKey, highlights, focusedMeasure, rendered, musicXml])

  if (!musicXml) {
    return (
      <div className="empty-state muted">
        Select a commit or create one to render the score.
      </div>
    )
  }

  return (
    <>
      {error && <div className="error-banner">Verovio: {error}</div>}
      {highlights.length > 0 && (
        <div className="highlight-legend" aria-live="polite">
          <span>
            Highlighting <strong>{highlights.length}</strong> changed measure
            {highlights.length === 1 ? '' : 's'}
          </span>
          <span className="legend-swatches">
            <span className="swatch swatch-added">add</span>
            <span className="swatch swatch-removed">remove</span>
            <span className="swatch swatch-changed">change</span>
            <span className="swatch swatch-mixed">mixed</span>
          </span>
        </div>
      )}
      <div className="score-frame" ref={hostRef} />
    </>
  )
}
