import { useEffect, useRef, useState } from 'react'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'

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
  highlightMeasures?: number[]
}

export function ScoreView({ musicXml, highlightMeasures = [] }: ScoreViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render(): Promise<void> {
      if (!musicXml || !hostRef.current) {
        if (hostRef.current) hostRef.current.innerHTML = ''
        return
      }

      try {
        const tk = await getToolkit()
        if (cancelled) return

        tk.setOptions({
          scale: 40,
          pageWidth: 1800,
          pageHeight: 2400,
          footer: 'none',
          header: 'none',
          breaks: 'encoded',
          inputFrom: 'musicxml',
        })
        tk.loadData(musicXml)
        const pageCount = tk.getPageCount()
        const pages: string[] = []
        for (let page = 1; page <= pageCount; page += 1) {
          pages.push(tk.renderToSVG(page))
        }
        if (cancelled || !hostRef.current) return
        hostRef.current.innerHTML = pages.join('\n')

        for (const n of highlightMeasures) {
          const nodes = hostRef.current.querySelectorAll(
            `[data-id*="measure-${n}"], .measure[id*="${n}"]`,
          )
          nodes.forEach((node) => {
            ;(node as SVGElement).style.outline = '2px solid #0f6a6a'
            ;(node as SVGElement).style.outlineOffset = '2px'
          })
        }
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [musicXml, highlightMeasures])

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
      <div className="score-frame" ref={hostRef} />
    </>
  )
}
