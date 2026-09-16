import type { VerovioToolkit } from 'verovio/esm'

export type MeasureTone = 'changed' | 'added' | 'removed' | 'mixed'

export interface MeasureHighlight {
  number: number
  tone?: MeasureTone
}

/** measure number → Verovio measure groups (may span systems/pages) */
export type MeasureIndex = Map<number, SVGGElement[]>

const TONE_FILL: Record<MeasureTone, string> = {
  changed: 'rgba(120, 56, 32, 0.16)',
  added: 'rgba(61, 107, 69, 0.18)',
  removed: 'rgba(155, 44, 44, 0.16)',
  mixed: 'rgba(152, 96, 72, 0.20)',
}

const TONE_STROKE: Record<MeasureTone, string> = {
  changed: 'rgba(120, 56, 32, 0.88)',
  added: 'rgba(61, 107, 69, 0.9)',
  removed: 'rgba(155, 44, 44, 0.9)',
  mixed: 'rgba(120, 56, 32, 0.75)',
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

  const mNum = el.querySelector('.mNum, text.mNum')
  if (mNum?.textContent) {
    const n = Number(mNum.textContent.trim())
    if (Number.isFinite(n)) return n
  }

  if (id) {
    const match = id.match(/measure[_-]?0*(\d+)/i)
    if (match) return Number(match[1])
  }

  return null
}

/**
 * Resolve measure numbers once after SVG is in the DOM so highlight updates
 * stay O(changed measures) instead of scanning every `g.measure` via WASM.
 */
export function buildMeasureIndex(
  host: HTMLElement,
  tk: VerovioToolkit,
): MeasureIndex {
  const index: MeasureIndex = new Map()
  const measureEls = host.querySelectorAll('g.measure')
  measureEls.forEach((el) => {
    const num = measureNumberFromElement(tk, el)
    if (num === null) return
    const list = index.get(num)
    if (list) list.push(el as SVGGElement)
    else index.set(num, [el as SVGGElement])
  })
  return index
}

function clearHighlights(host: HTMLElement): void {
  host.querySelectorAll('.allegre-measure-hl').forEach((n) => n.remove())
  host
    .querySelectorAll('.allegre-measure-focused')
    .forEach((n) => n.classList.remove('allegre-measure-focused'))
}

/**
 * Draw translucent highlight rects behind changed measures in rendered Verovio SVG.
 */
export function applyMeasureHighlights(
  host: HTMLElement,
  index: MeasureIndex,
  highlights: MeasureHighlight[],
  focusedMeasure?: number | null,
): void {
  clearHighlights(host)

  if (highlights.length === 0) return

  const ns = 'http://www.w3.org/2000/svg'

  for (const h of highlights) {
    const els = index.get(h.number)
    if (!els?.length) continue
    const tone = h.tone ?? 'changed'

    for (const el of els) {
      let bbox: DOMRect
      try {
        bbox = el.getBBox()
      } catch {
        continue
      }
      if (!bbox.width || !bbox.height) continue

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
        focusedMeasure === h.number ? '2.5' : '1.25',
      )
      rect.setAttribute('pointer-events', 'none')
      rect.dataset.measure = String(h.number)
      el.insertBefore(rect, el.firstChild)

      if (focusedMeasure === h.number) {
        el.classList.add('allegre-measure-focused')
      }
    }
  }
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
