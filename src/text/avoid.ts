import type { AvoidArea, Point } from '../editor/types.ts'
import type { LineSlot, RowSlots } from './layout.ts'

// The room each row of a paragraph box has when the text flows around pictures and shapes. Rows are
// one line tall, from the top of the box. Each thing takes the part of a row between the leftmost
// and rightmost points of its outline there (plus the space kept around it), and the text runs down
// the side it was given. A row left too narrow for a word or two gets no text at all, so letters
// never end up stranded in a sliver.

// How far something reaches across a row (from `top` to `bottom`), or null when it isn't in it.
export function reachInRow(area: AvoidArea, top: number, bottom: number): [number, number] | null {
  const from = top - area.gap
  const to = bottom + area.gap
  let min = Infinity
  let max = -Infinity
  const take = (x: number) => {
    if (x < min) min = x
    if (x > max) max = x
  }
  for (const outline of area.outlines) {
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i]
      const q = outline[(i + 1) % outline.length]
      if (Math.max(p.y, q.y) <= from || Math.min(p.y, q.y) >= to) continue
      if (p.y === q.y) {
        take(p.x)
        take(q.x)
        continue
      }
      // The part of the edge inside the row.
      const a = (from - p.y) / (q.y - p.y)
      const b = (to - p.y) / (q.y - p.y)
      const t0 = Math.max(0, Math.min(a, b))
      const t1 = Math.min(1, Math.max(a, b))
      if (t0 > t1) continue
      take(p.x + (q.x - p.x) * t0)
      take(p.x + (q.x - p.x) * t1)
    }
  }
  return min <= max ? [min - area.gap, max + area.gap] : null
}

// Browsers place things in steps of 1/64 of a pixel; the room is rounded inward to those steps,
// so the typing box has exactly the same room.
const STEP = 64
const inward = (x: number) => Math.ceil(x * STEP - 1e-6) / STEP + 0

// The narrowest room a row with something beside it still gets text in.
function narrowest(width: number, size: number): number {
  return Math.min(size * 3, width / 2)
}

// The room in each row of a box `width` wide with lines `lineHeight` tall.
export function avoidSlots(areas: AvoidArea[], width: number, lineHeight: number, size: number): RowSlots {
  const whole: LineSlot = { x: 0, width, narrowed: false }
  const known = new Map<number, LineSlot | null>()
  const last = lastRow(areas, lineHeight)
  return (row) => {
    if (row > last) return whole
    const cached = known.get(row)
    if (cached !== undefined) return cached
    let left = 0
    let right = width
    let narrowed = false
    let blocked = false
    for (const area of areas) {
      const reach = reachInRow(area, row * lineHeight, (row + 1) * lineHeight)
      if (!reach || reach[1] <= 0 || reach[0] >= width) continue
      narrowed = true
      if (area.side === 'none') blocked = true
      else if (area.side === 'right') left = Math.max(left, reach[1])
      else right = Math.min(right, reach[0])
    }
    let slot: LineSlot | null = whole
    if (narrowed) {
      const x = inward(Math.max(0, left))
      const end = width - inward(Math.max(0, width - right))
      slot = blocked || end - x < narrowest(width, size) ? null : { x, width: end - x, narrowed: true }
    }
    known.set(row, slot)
    return slot
  }
}

// The last row anything reaches into (rows after it have the whole width).
export function lastRow(areas: AvoidArea[], lineHeight: number): number {
  let bottom = -Infinity
  for (const area of areas) for (const outline of area.outlines) for (const p of outline) bottom = Math.max(bottom, p.y + area.gap)
  return bottom === -Infinity ? -1 : Math.ceil(bottom / lineHeight)
}

// What each row leaves free on the left and on the right, down to the last row anything reaches
// into: for the typing box, which keeps the same room free with floating blocks.
export function avoidMargins(areas: AvoidArea[], width: number, lineHeight: number, size: number): { left: number; right: number }[] {
  const slots = avoidSlots(areas, width, lineHeight, size)
  const rows: { left: number; right: number }[] = []
  for (let row = 0; row <= lastRow(areas, lineHeight); row++) {
    const slot = slots(row)
    rows.push(slot ? { left: slot.x, right: width - slot.x - slot.width } : { left: width, right: 0 })
  }
  return rows
}

// The bounds of some outlines.
export function outlineBounds(outlines: Point[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const outline of outlines) {
    for (const p of outline) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  return { minX, minY, maxX, maxY }
}
