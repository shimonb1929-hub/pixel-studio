import { arrangeBox, slideLayer } from './arrange.ts'
import { polygonBounds, unionRect, type Rect } from './geometry.ts'
import { groupMembers } from './layers.ts'
import { boxCorners } from './transform.ts'
import type { EditorDocument, Layer } from './types.ts'

// Lining several things up and spacing them evenly. Things kept together count as one thing, and
// one thing on its own lines up with the page.

export type LineUpEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

// Things that move as one: a whole group, or a single layer, with the upright box around it.
interface Unit {
  ids: string[]
  rect: Rect
  // Plain pictures move by whole pixels, so they stay crisp.
  whole: boolean
}

function boundsOf(layer: Layer): Rect | null {
  const box = arrangeBox(layer)
  return box && polygonBounds(boxCorners(box))
}

// The chosen layers as things that move as one. Empty ones are left out.
function unitsOf(doc: EditorDocument, ids: string[]): Unit[] {
  const chosen = new Set(ids)
  const units = new Map<string, Layer[]>()
  for (const layer of doc.layers) {
    if (!chosen.has(layer.id)) continue
    const group = layer.group?.id
    const whole = group !== undefined && groupMembers(doc, group).every((m) => chosen.has(m.id))
    const key = whole ? `group:${group}` : `layer:${layer.id}`
    units.set(key, [...(units.get(key) ?? []), layer])
  }
  const result: Unit[] = []
  for (const layers of units.values()) {
    const rect = layers.reduce<Rect | null>((all, l) => {
      const bounds = boundsOf(l)
      return bounds ? unionRect(all, bounds) : all
    }, null)
    if (rect) result.push({ ids: layers.map((l) => l.id), rect, whole: layers.some((l) => l.kind === 'raster' && !l.box) })
  }
  return result
}

// Slides each unit by its own amount. Returns the same design when nothing moves.
function slideUnits(doc: EditorDocument, moves: { unit: Unit; dx: number; dy: number }[]): EditorDocument {
  const by = new Map<string, { dx: number; dy: number }>()
  for (const { unit, dx, dy } of moves) {
    const x = unit.whole ? Math.round(dx) : dx
    const y = unit.whole ? Math.round(dy) : dy
    if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) continue
    for (const id of unit.ids) by.set(id, { dx: x, dy: y })
  }
  if (by.size === 0) return doc
  return { ...doc, layers: doc.layers.map((l) => (by.has(l.id) ? slideLayer(l, by.get(l.id)!.dx, by.get(l.id)!.dy) : l)) }
}

const pageRect = (doc: EditorDocument): Rect => ({ x: 0, y: 0, width: doc.width, height: doc.height })
const frameRect = (units: Unit[]): Rect => units.reduce<Rect | null>((all, u) => unionRect(all, u.rect), null)!

// How far a box moves so the chosen edge or middle meets the same one of `target`.
function lineUpShift(rect: Rect, target: Rect, edge: LineUpEdge): { dx: number; dy: number } {
  switch (edge) {
    case 'left':
      return { dx: target.x - rect.x, dy: 0 }
    case 'center':
      return { dx: target.x + target.width / 2 - (rect.x + rect.width / 2), dy: 0 }
    case 'right':
      return { dx: target.x + target.width - (rect.x + rect.width), dy: 0 }
    case 'top':
      return { dx: 0, dy: target.y - rect.y }
    case 'middle':
      return { dx: 0, dy: target.y + target.height / 2 - (rect.y + rect.height / 2) }
    case 'bottom':
      return { dx: 0, dy: target.y + target.height - (rect.y + rect.height) }
  }
}

// Lines the chosen things up by one edge or middle: with each other when there are several, or
// with the page when it's one thing.
export function lineUp(doc: EditorDocument, ids: string[], edge: LineUpEdge): EditorDocument {
  const units = unitsOf(doc, ids)
  if (units.length === 0) return doc
  const target = units.length > 1 ? frameRect(units) : pageRect(doc)
  return slideUnits(
    doc,
    units.map((unit) => ({ unit, ...lineUpShift(unit.rect, target, edge) })),
  )
}

// How many things the chosen layers make, counting things kept together as one.
export function thingCount(doc: EditorDocument, ids: string[]): number {
  return unitsOf(doc, ids).length
}

// Spaces three or more things evenly across ('x') or down ('y'): the first and last stay put,
// and the gaps between all of them become the same.
export function spreadOut(doc: EditorDocument, ids: string[], axis: 'x' | 'y'): EditorDocument {
  return slideUnits(doc, spreadMoves(unitsOf(doc, ids), axis))
}

function spreadMoves(units: Unit[], axis: 'x' | 'y') {
  if (units.length < 3) return []
  const start = (r: Rect) => (axis === 'x' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'x' ? r.width : r.height)
  const sorted = [...units].sort((a, b) => start(a.rect) + size(a.rect) / 2 - (start(b.rect) + size(b.rect) / 2))
  const first = start(sorted[0].rect)
  const last = sorted[sorted.length - 1].rect
  const sizes = sorted.reduce((sum, u) => sum + size(u.rect), 0)
  const gap = (start(last) + size(last) - first - sizes) / (sorted.length - 1)
  let at = first
  return sorted.map((unit) => {
    const shift = at - start(unit.rect)
    at += size(unit.rect) + gap
    return { unit, dx: axis === 'x' ? shift : 0, dy: axis === 'y' ? shift : 0 }
  })
}

// Makes a neat row or column (whichever they are closer to already): even gaps between them, and
// lined up through their middles.
export function tidyUp(doc: EditorDocument, ids: string[]): EditorDocument {
  const units = unitsOf(doc, ids)
  if (units.length < 2) return doc
  const centers = units.map((u) => ({ x: u.rect.x + u.rect.width / 2, y: u.rect.y + u.rect.height / 2 }))
  const range = (values: number[]) => Math.max(...values) - Math.min(...values)
  const axis = range(centers.map((c) => c.x)) >= range(centers.map((c) => c.y)) ? 'x' : 'y'
  const frame = frameRect(units)
  const spread = new Map(spreadMoves(units, axis).map((m) => [m.unit, m]))
  return slideUnits(
    doc,
    units.map((unit) => {
      const along = spread.get(unit) ?? { dx: 0, dy: 0 }
      const across = lineUpShift(unit.rect, frame, axis === 'x' ? 'middle' : 'center')
      return { unit, dx: along.dx + across.dx, dy: along.dy + across.dy }
    }),
  )
}

// Moves the chosen layers together by dx, dy (whole pixels when there's a plain picture among them).
export function moveTogether(doc: EditorDocument, ids: string[], dx: number, dy: number): EditorDocument {
  const units = unitsOf(doc, ids)
  if (units.length === 0) return doc
  const whole = units.some((u) => u.whole)
  return slideUnits(doc, [{ unit: { ids: units.flatMap((u) => u.ids), rect: frameRect(units), whole }, dx, dy }])
}

// Moves the chosen layers together so they sit in the middle of the page.
export function centerTogether(doc: EditorDocument, ids: string[]): EditorDocument {
  const units = unitsOf(doc, ids)
  if (units.length === 0) return doc
  const frame = frameRect(units)
  const shift = lineUpShift(frame, pageRect(doc), 'center')
  return moveTogether(doc, ids, shift.dx, lineUpShift(frame, pageRect(doc), 'middle').dy)
}
