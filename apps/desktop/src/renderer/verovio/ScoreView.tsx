import { useEffect, useMemo, useRef, useState } from 'react'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import {
  applyMeasureHighlights,
  buildMeasureIndex,
  scrollToMeasure,
  type MeasureHighlight,
  type MeasureIndex,
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

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/**
 * Verovio page SVGs ship a clipPath sized to the page box. After adjustPageHeight
 * / viewBox fixes, that clip often eats the first measure (empty percussion staves
 * look blank until the next barline). Drop clipping and size from the ink bbox.
 */
function normalizeSvgRoot(svg: SVGSVGElement): void {
  svg.querySelectorAll('clipPath').forEach((node) => node.remove())
  svg.querySelectorAll('[clip-path]').forEach((el) => {
    el.removeAttribute('clip-path')
  })

  let bbox: DOMRect
  try {
    bbox = svg.getBBox()
  } catch {
    return
  }
  if (!bbox.width || !bbox.height) return

  const pad = 12
  const minX = bbox.x - pad
  const minY = bbox.y - pad
  const width = Math.ceil(bbox.width + pad * 2)
  const height = Math.ceil(bbox.height + pad * 2)
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
  svg.removeAttribute('height')
  svg.setAttribute('width', '100%')
  svg.style.height = 'auto'
  svg.style.overflow = 'visible'
}

function appendSvgPage(host: HTMLElement, svgMarkup: string): void {
  host.insertAdjacentHTML('beforeend', svgMarkup)
  const svg = host.lastElementChild
  if (svg instanceof SVGSVGElement) normalizeSvgRoot(svg)
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
  const indexRef = useRef<MeasureIndex>(new Map())
  const loadedXmlRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(0)
  const [renderProgress, setRenderProgress] = useState<{
    page: number
    total: number
  } | null>(null)

  const highlightKey = useMemo(
    () =>
      highlights.map((h) => `${h.number}:${h.tone ?? 'changed'}`).join(','),
    [highlights],
  )

  useEffect(() => {
    let cancelled = false

    async function render(): Promise<void> {
      const host = hostRef.current
      if (!musicXml || !host) {
        if (host) host.innerHTML = ''
        loadedXmlRef.current = null
        indexRef.current = new Map()
        setRenderProgress(null)
        setRendered((n) => n + 1)
        return
      }

      // Preview often re-sends XML already on screen — skip Verovio reload.
      if (loadedXmlRef.current === musicXml && host.childElementCount > 0) {
        setRenderProgress(null)
        setRendered((n) => n + 1)
        return
      }

      try {
        const tk = await getToolkit()
        toolkitRef.current = tk
        if (cancelled || !hostRef.current) return

        setRenderProgress({ page: 0, total: 0 })
        // Screen preview: auto breaks (not MuseScore page breaks) — encoded
        // breaks often blank the first measure of a page on percussion staves.
        tk.setOptions({
          scale: 40,
          pageWidth: 2200,
          pageHeight: 12000,
          adjustPageHeight: true,
          justifyVertically: false,
          spacingStaff: 16,
          spacingSystem: 12,
          condense: 'none',
          footer: 'none',
          header: 'none',
          breaks: 'auto',
          inputFrom: 'musicxml',
          svgViewBox: true,
          svgAdditionalAttribute: ['measure@n', 'measure@label'],
        })
        tk.loadData(musicXml)
        if (cancelled || !hostRef.current) return

        const pageCount = tk.getPageCount()
        hostRef.current.innerHTML = ''
        indexRef.current = new Map()
        setRenderProgress({ page: 0, total: pageCount })

        // First page immediately so the UI isn't blank during long scores.
        if (pageCount >= 1) {
          appendSvgPage(hostRef.current, tk.renderToSVG(1))
          indexRef.current = buildMeasureIndex(hostRef.current, tk)
          setRenderProgress({ page: 1, total: pageCount })
          setRendered((n) => n + 1)
        }

        for (let page = 2; page <= pageCount; page += 1) {
          await yieldToUi()
          if (cancelled || !hostRef.current) return
          appendSvgPage(hostRef.current, tk.renderToSVG(page))
          // Rebuild index periodically so early highlights stay useful.
          if (page === pageCount || page % 4 === 0) {
            indexRef.current = buildMeasureIndex(hostRef.current, tk)
            setRendered((n) => n + 1)
          }
          setRenderProgress({ page, total: pageCount })
        }

        if (cancelled || !hostRef.current) return
        indexRef.current = buildMeasureIndex(hostRef.current, tk)
        loadedXmlRef.current = musicXml
        setError(null)
        setRenderProgress(null)
        setRendered((n) => n + 1)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setRenderProgress(null)
        }
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [musicXml])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !musicXml) return

    applyMeasureHighlights(
      host,
      indexRef.current,
      highlights,
      focusedMeasure,
    )

    if (focusedMeasure != null) {
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
      {renderProgress && renderProgress.total > 1 && (
        <div className="score-render-progress" role="status" aria-live="polite">
          Rendering page {renderProgress.page} of {renderProgress.total}…
        </div>
      )}
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
