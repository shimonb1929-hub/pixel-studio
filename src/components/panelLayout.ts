// How someone has set up the panels beside the design: which ones show, in what order, and how wide
// the column is. Kept in the browser so it's the same next time; "Put back how it was" forgets it.

// The panels that can be moved and hidden. `settings` is whatever fits the picked thing (Text,
// Shape, Page, Table, Adjust…); the others are always the same panel.
export type PanelId = 'settings' | 'color' | 'effects' | 'layers'

export interface PanelLayout {
  // Top to bottom. Layers is always first or last, as it takes the room left over.
  order: PanelId[]
  hidden: PanelId[]
  width: number
}

export const PANEL_WIDTHS = { narrow: 288, wide: 352, widest: 432 } as const
export const MIN_WIDTH = PANEL_WIDTHS.narrow
export const MAX_WIDTH = 480

export const DEFAULT_LAYOUT: PanelLayout = {
  order: ['settings', 'color', 'effects', 'layers'],
  hidden: [],
  width: PANEL_WIDTHS.narrow,
}

const ALL: PanelId[] = DEFAULT_LAYOUT.order

export const LAYOUT_KEY = 'pixel-studio-panel-layout'

export function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)))
}

// Any kept layout, even an old or broken one, becomes a whole one: every panel once, Layers at an
// end, and a width that fits.
export function tidyLayout(value: unknown): PanelLayout {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof PanelLayout, unknown>>
  const known = (list: unknown): PanelId[] =>
    Array.isArray(list) ? list.filter((id, i): id is PanelId => ALL.includes(id as PanelId) && list.indexOf(id) === i) : []
  let order = known(raw.order)
  order = [...order, ...ALL.filter((id) => !order.includes(id))]
  if (order[0] !== 'layers') order = [...order.filter((id) => id !== 'layers'), 'layers']
  const width = typeof raw.width === 'number' && Number.isFinite(raw.width) ? clampWidth(raw.width) : DEFAULT_LAYOUT.width
  return { order, hidden: known(raw.hidden), width }
}

export function isDefaultLayout(layout: PanelLayout): boolean {
  return (
    layout.width === DEFAULT_LAYOUT.width &&
    layout.hidden.length === 0 &&
    layout.order.every((id, i) => id === DEFAULT_LAYOUT.order[i])
  )
}

// Moves a panel one place up (-1) or down (1). Layers jumps between the top and the bottom.
export function movePanel(layout: PanelLayout, id: PanelId, step: -1 | 1): PanelLayout {
  const order = layout.order.filter((other) => other !== id)
  if (id === 'layers') {
    const onTop = layout.order[0] === 'layers'
    if (onTop === (step === -1)) return layout
    return { ...layout, order: step === -1 ? ['layers', ...order] : [...order, 'layers'] }
  }
  // The other panels change places among themselves; Layers stays at its end.
  const others = layout.order.filter((other) => other !== 'layers')
  const from = others.indexOf(id)
  const to = from + step
  if (to < 0 || to >= others.length) return layout
  ;[others[from], others[to]] = [others[to], others[from]]
  return { ...layout, order: layout.order[0] === 'layers' ? ['layers', ...others] : [...others, 'layers'] }
}

export function canMove(layout: PanelLayout, id: PanelId, step: -1 | 1): boolean {
  return movePanel(layout, id, step) !== layout
}

export function setShown(layout: PanelLayout, id: PanelId, shown: boolean): PanelLayout {
  const hidden = layout.hidden.filter((other) => other !== id)
  return { ...layout, hidden: shown ? hidden : [...hidden, id] }
}

export function loadLayout(): PanelLayout {
  try {
    const kept = localStorage.getItem(LAYOUT_KEY)
    return tidyLayout(kept ? JSON.parse(kept) : null)
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function keepLayout(layout: PanelLayout) {
  try {
    if (isDefaultLayout(layout)) localStorage.removeItem(LAYOUT_KEY)
    else localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Not kept, but the layout still holds until the page is closed.
  }
}
