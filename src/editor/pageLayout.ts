import type { Rect } from './geometry.ts'
import type { EditorDocument, PageLayout } from './types.ts'

// Margins and columns: faint lines on the page that things click to while they're moved, so a
// layout stays neat. They only help while designing; downloads never show them.

export type MarginSize = 'none' | 'small' | 'medium' | 'large'

// Each size is a share of the page's shorter side, so it looks right on a phone story or a poster.
const MARGIN_SHARE: Record<MarginSize, number> = { none: 0, small: 0.04, medium: 0.07, large: 0.1 }
const GAP_SHARE = 0.03

export function marginFor(size: MarginSize, width: number, height: number): number {
  return Math.round(Math.min(width, height) * MARGIN_SHARE[size])
}

export function defaultGap(width: number, height: number): number {
  return Math.round(Math.min(width, height) * GAP_SHARE)
}

// Which named size a margin is, if it's one of them.
export function marginSize(margin: number, width: number, height: number): MarginSize | null {
  return (Object.keys(MARGIN_SHARE) as MarginSize[]).find((size) => marginFor(size, width, height) === margin) ?? null
}

export function hasLayout(layout: PageLayout | undefined): layout is PageLayout {
  return !!layout && (layout.margin > 0 || layout.columns > 1)
}

// The area inside the margins, and each column in it. Null when there's nothing to show.
export function layoutFrames(doc: Pick<EditorDocument, 'width' | 'height' | 'layout'>): { inside: Rect; columns: Rect[] } | null {
  const layout = doc.layout
  if (!hasLayout(layout)) return null
  const margin = Math.max(0, Math.min(layout.margin, doc.width / 2 - 1, doc.height / 2 - 1))
  const inside = { x: margin, y: margin, width: doc.width - 2 * margin, height: doc.height - 2 * margin }
  const columns: Rect[] = []
  const count = Math.max(1, Math.round(layout.columns))
  if (count > 1) {
    const gap = Math.max(0, Math.min(layout.gap, inside.width / (count - 1) - 1))
    const width = (inside.width - gap * (count - 1)) / count
    for (let i = 0; i < count; i++) columns.push({ x: inside.x + i * (width + gap), y: inside.y, width, height: inside.height })
  }
  return { inside, columns }
}
