import type { VerovioToolkit } from 'verovio/esm'

export type MeasureTone = 'changed' | 'added' | 'removed' | 'mixed'

export interface MeasureHighlight {
  number: number
  tone?: MeasureTone
}

const TONE_FILL: Record<MeasureTone, string> = {
  changed: 'rgba(15, 106, 106, 0.18)',
  added: 'rgba(31, 107, 58, 0.20)',
  removed: 'rgba(155, 44, 44, 0.18)',
  mixed: 'rgba(180, 110, 20, 0.20)',
}

const TONE_STROKE: Record<MeasureTone, string> = {
  changed: 'rgba(15, 106, 106, 0.85)',
  added: 'rgba(31, 107, 58, 0.9)',
  removed: 'rgba(155, 44, 44, 0.9)',
  mixed: 'rgba(150, 90, 20, 0.9)',
}

/**
 * Classify a measure from its change types for tinting.
 */
export function toneForChangeTypes(types: string[]): MeasureTone {
  const hasNoteAdd = types.includes('note_added')
  const hasNoteDel = types.includes('note_removed')
  if (hasNoteAdd && hasNoteDel) return 'mixed'
  if (hasNoteAdd) return 'added'
  if (hasNoteDel) return 'removed'

  const hasAdd = types.some((t) => t.endsWith('_added'))
  const hasDel = types.some((t) => t.endsWith('_removed'))
  if (hasAdd && hasDel) return 'mixed'
  if (hasAdd) return 'added'
  if (hasDel) return 'removed'
  return 'changed'
}

function measureNumberFromElement(
  tk: VerovioToolkit,
  el: Element,
): number | null {
  const id = el.getAttribute('id')
  if (id) {
    try {
      const attrs = tk.getElementAttr(id) as { n?: string | number }
      if (attrs?.n !== undefined && attrs.n !== '') {
        const n = Number(attrs.n)
        if (Number.isFinite(n)) return n
      }
    } catch {
      // fall through to heuristics
    }
  }

  // Fallback: mNum text inside the measure group
  const mNum = el.querySelector('.mNum, text.mNum')
  if (mNum?.textContent) {
    const n = Number(mNum.textContent.trim())
    if (Number.isFinite(n)) return n
  }

  // Last resort: parse ids like measure-12 / measure-00000012
  if (id) {
    const match = id.match(/measure[_-]?0*(\d+)/i)
    if (match) return Number(match[1])
  }

  return null
}

/**
 * Draw translucent highlight rects behind changed measures in rendered Verovio SVG.
 */
export function applyMeasureHighlights(
  host: HTMLElement,
  tk: VerovioToolkit,
  highlights: MeasureHighlight[],
  focusedMeasure?: number | null,
): void {
  host.querySelectorAll('.allegre-measure-hl').forEach((n) => n.remove())

  if (highlights.length === 0) return

  const byNumber = new Map(
    highlights.map((h) => [h.number, h.tone ?? 'changed'] as const),
  )

  const measureEls = host.querySelectorAll('g.measure')
  measureEls.forEach((el) => {
    const num = measureNumberFromElement(tk, el)
    if (num === null || !byNumber.has(num)) return

    const tone = byNumber.get(num)!
    const svgEl = el as SVGGElement
    let bbox: DOMRect
    try {
      bbox = svgEl.getBBox()
    } catch {
      return
    }
    if (!bbox.width || !bbox.height) return

    const ns = 'http://www.w3.org/2000/svg'
    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('class', 'allegre-measure-hl')
    rect.setAttribute('x', String(bbox.x - 4))
    rect.setAttribute('y', String(bbox.y - 4))
    rect.setAttribute('width', String(bbox.width + 8))
    rect.setAttribute('height', String(bbox.height + 8))
    rect.setAttribute('rx', '6')
    rect.setAttribute('fill', TONE_FILL[tone])
    rect.setAttribute('stroke', TONE_STROKE[tone])
    rect.setAttribute(
      'stroke-width',
      focusedMeasure === num ? '2.5' : '1.25',
    )
    rect.setAttribute('pointer-events', 'none')
    rect.dataset.measure = String(num)

    // Insert behind staff content so notes stay readable
    el.insertBefore(rect, el.firstChild)

    if (focusedMeasure === num) {
      el.classList.add('allegre-measure-focused')
    }
  })
}

export function scrollToMeasure(
  host: HTMLElement,
  measureNumber: number,
): void {
  const hl = host.querySelector(
    `.allegre-measure-hl[data-measure="${measureNumber}"]`,
  )
  if (hl) {
    hl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }
}
