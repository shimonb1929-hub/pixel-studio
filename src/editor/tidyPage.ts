import type { Rect } from './geometry.ts'
import { slideUnits, unitsOf } from './organize.ts'
import type { EditorDocument } from './types.ts'

// Tidy the whole page (pro: align and distribute cleanup). With nothing picked, finds things that
// are almost lined up (edges or middles a few pixels apart, with each other or with the page) or
// almost evenly spaced, and nudges them exactly into line. Nothing ever moves more than a few
// pixels, and things that already line up exactly with something stay where they are, so a
// careful layout is never undone.

export interface TidyThing {
  rect: Rect
  // Never moves (locked, or so big it is the background), but others can line up with it.
  fixed: boolean
}

export interface TidyShift {
  dx: number
  dy: number
}

type Axis = 'x' | 'y'
// 0: left or top edge, 1: middle, 2: right or bottom edge.
type Kind = 0 | 1 | 2
const KINDS: Kind[] = [0, 1, 2]

// Smaller than this is already lined up (allowing for rounding).
const SAME = 0.5

// How near "almost" is: half a percent of the page's long side, at least 2 pixels. That is 5
// pixels on a 1080 post and under 2 mm on any page.
export function tidyTolerance(width: number, height: number): number {
  return Math.max(2, Math.max(width, height) * 0.005)
}

function edge(rect: Rect, axis: Axis, kind: Kind): number {
  const start = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return start + (size * kind) / 2
}

const area = (r: Rect) => r.width * r.height

// Things beyond this many are not tidied one by one (it would take too long, and such a page is
// a pattern, not a layout).
const MOST_THINGS = 300

interface Target {
  value: number
  kind: Kind
  // The thing it belongs to, or -1 for a line of the page.
  index: number
}

// Shifts along one axis that line up edges and middles that are almost lined up. Null means the
// thing is free to be moved by spacing later; a number (maybe 0) means its place is settled.
function alignAxis(things: TidyThing[], axis: Axis, lines: { value: number; kind: Kind }[], tolerance: number): (number | null)[] {
  const values = things.map((t) => KINDS.map((k) => edge(t.rect, axis, k)))
  // Already exactly in line with another thing or the page: it stays.
  const settled = things.map(
    (t, i) => t.fixed || KINDS.some((k) => lines.some((l) => l.kind === k && Math.abs(l.value - values[i][k]) < SAME) || things.some((_, j) => j !== i && Math.abs(values[j][k] - values[i][k]) < SAME)),
  )
  const shift: (number | null)[] = things.map((_, i) => (settled[i] ? 0 : null))
  if (things.length > MOST_THINGS) return shift
  const at = (i: number, kind: Kind) => values[i][kind] + (shift[i] ?? 0)

  // Each round lines up the most things it can on one edge or middle: on the page's lines first,
  // then on the biggest thing, with the smallest moves. Things that moved keep their new place.
  for (;;) {
    let best: { target: Target; movers: { index: number; d: number }[]; count: number; area: number; cost: number } | null = null
    for (const kind of KINDS) {
      const targets: Target[] = [...lines.filter((l) => l.kind === kind).map((l) => ({ ...l, index: -1 })), ...things.map((_, index) => ({ value: at(index, kind), kind, index }))]
      for (const target of targets) {
        const movers: { index: number; d: number }[] = []
        let count = target.index < 0 ? 1 : 0
        for (let j = 0; j < things.length; j++) {
          const d = target.value - values[j][kind]
          if (shift[j] === null && j !== target.index && Math.abs(d) >= SAME && Math.abs(d) <= tolerance) movers.push({ index: j, d })
          else if ((shift[j] !== null || j === target.index) && Math.abs(target.value - at(j, kind)) < SAME) count++
        }
        if (movers.length === 0) continue
        count += movers.length
        const size = target.index < 0 ? Infinity : area(things[target.index].rect)
        const cost = movers.reduce((sum, m) => sum + Math.abs(m.d), 0)
        if (!best || count > best.count || (count === best.count && (size > best.area || (size === best.area && cost < best.cost)))) best = { target, movers, count, area: size, cost }
      }
    }
    if (!best) break
    for (const m of best.movers) shift[m.index] = m.d
    if (best.target.index >= 0 && shift[best.target.index] === null) shift[best.target.index] = 0
  }
  return shift
}

// Rows (or columns) of three or more things lined up across, with gaps that are almost the same:
// the gaps are made exactly the same, the first and last staying put.
function spaceAxis(things: TidyThing[], rects: Rect[], axis: Axis, moved: (number | null)[], tolerance: number): Map<number, number> {
  const across: Axis = axis === 'x' ? 'y' : 'x'
  const result = new Map<number, number>()
  const seen = new Set<string>()
  for (const kind of KINDS) {
    const rows = new Map<number, number[]>()
    rects.forEach((r, i) => {
      const v = edge(r, across, kind)
      const key = [...rows.keys()].find((k) => Math.abs(k - v) < SAME) ?? v
      rows.set(key, [...(rows.get(key) ?? []), i])
    })
    for (const row of rows.values()) {
      if (row.length < 3) continue
      const sorted = [...row].sort((p, q) => edge(rects[p], axis, 0) - edge(rects[q], axis, 0))
      const key = sorted.join()
      if (seen.has(key)) continue
      seen.add(key)
      const gaps = sorted.slice(1).map((index, n) => edge(rects[index], axis, 0) - edge(rects[sorted[n]], axis, 2))
      // Overlapping things aren't a row with gaps.
      if (gaps.some((g) => g < 0)) continue
      const even = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
      const off = Math.max(...gaps) - Math.min(...gaps)
      if (off < SAME || off > tolerance) continue
      let at = edge(rects[sorted[0]], axis, 2) + even
      const shifts = new Map<number, number>()
      for (const index of sorted.slice(1, -1)) {
        const d = at - edge(rects[index], axis, 0)
        if (Math.abs(d) >= SAME) shifts.set(index, d)
        at += (axis === 'x' ? rects[index].width : rects[index].height) + even
      }
      // Something that can't move, has just been lined up, or is in another row stays put, and so
      // does the whole row.
      const blocked = [...shifts.entries()].some(([i, d]) => things[i].fixed || (moved[i] ?? 0) !== 0 || result.has(i) || Math.abs(d) > tolerance)
      if (!blocked) for (const [i, d] of shifts) result.set(i, d)
    }
  }
  return result
}

// How far each thing moves to be tidy. Most stay where they are.
export function tidyShifts(things: TidyThing[], page: { width: number; height: number; margin?: number }, tolerance = tidyTolerance(page.width, page.height)): TidyShift[] {
  const pageLines = (size: number) => {
    const lines: { value: number; kind: Kind }[] = [
      { value: 0, kind: 0 },
      { value: size / 2, kind: 1 },
      { value: size, kind: 2 },
    ]
    if (page.margin) lines.push({ value: page.margin, kind: 0 }, { value: size - page.margin, kind: 2 })
    return lines
  }
  const sx = alignAxis(things, 'x', pageLines(page.width), tolerance)
  const sy = alignAxis(things, 'y', pageLines(page.height), tolerance)
  const rects = things.map((t, i) => ({ ...t.rect, x: t.rect.x + (sx[i] ?? 0), y: t.rect.y + (sy[i] ?? 0) }))
  const spaceX = spaceAxis(things, rects, 'x', sx, tolerance)
  const spaceY = spaceAxis(things, rects, 'y', sy, tolerance)
  return things.map((t, i) => (t.fixed ? { dx: 0, dy: 0 } : { dx: spaceX.get(i) ?? sx[i] ?? 0, dy: spaceY.get(i) ?? sy[i] ?? 0 }))
}

// Things bigger than this share of the page are backgrounds: others line up with them, but they
// never move.
const BACKGROUND_SHARE = 0.4

// The page with everything that was almost in line nudged exactly into line, and how many things
// moved. Hidden things are left alone; things kept together move as one.
export function tidyPage(doc: EditorDocument): { doc: EditorDocument; moved: number } {
  const ids = doc.layers.filter((l) => l.visible).map((l) => l.id)
  const units = unitsOf(doc, ids)
  const pageArea = doc.width * doc.height
  const locked = new Set(doc.layers.filter((l) => l.locked).map((l) => l.id))
  const things = units.map((u) => ({ rect: u.rect, fixed: u.ids.some((id) => locked.has(id)) || area(u.rect) > pageArea * BACKGROUND_SHARE }))
  const shifts = tidyShifts(things, { width: doc.width, height: doc.height, margin: doc.layout?.margin })
  const moves = units.map((unit, i) => ({ unit, ...shifts[i] })).filter((m) => m.dx !== 0 || m.dy !== 0)
  const next = slideUnits(doc, moves)
  return { doc: next, moved: next === doc ? 0 : moves.length }
}
