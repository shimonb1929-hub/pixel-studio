import type { Rect } from './geometry.ts'

// Lining things up while they're dragged: an edge or middle that comes close to the page's or
// another object's edge or middle clicks into place, and so does a spot that would make the gaps
// between things even. Guides show what lined up.

// A line where edges or middles line up. `axis` 'x' is a vertical line at x = at, drawn from y =
// from to y = to; 'y' is a horizontal one.
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

// Even gaps: each gap runs from `start` to `end` along the axis, drawn at `across`.
export interface SpacingGuide {
  axis: 'x' | 'y'
  across: number
  gaps: { start: number; end: number }[]
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
  spacing: SpacingGuide[]
}

interface Span {
  start: number
  size: number
}

// One axis of a rectangle: x and width, or y and height.
const along = (rect: Rect, axis: 'x' | 'y'): Span => (axis === 'x' ? { start: rect.x, size: rect.width } : { start: rect.y, size: rect.height })
const across = (rect: Rect, axis: 'x' | 'y'): Span => along(rect, axis === 'x' ? 'y' : 'x')
const lines = (span: Span) => [span.start, span.start + span.size / 2, span.start + span.size]
const overlaps = (a: Span, b: Span) => a.start < b.start + b.size && b.start < a.start + a.size

interface Candidate {
  shift: number
  spacing: SpacingGuide | null
}

// Spots along one axis where the moving thing would sit at an even distance: halfway between two
// neighbors, or one more step in a row of evenly spaced things.
function spacingCandidates(moving: Rect, others: Rect[], axis: 'x' | 'y'): Candidate[] {
  const me = along(moving, axis)
  const myAcross = across(moving, axis)
  // Only things in the same row (or column) count.
  const row = others.filter((o) => overlaps(across(o, axis), myAcross)).sort((a, b) => along(a, axis).start - along(b, axis).start)
  const centerOf = (span: Span) => span.start + span.size / 2
  const mid = centerOf(me)
  const acrossAt = (rects: Rect[]) => {
    const top = Math.max(myAcross.start, ...rects.map((r) => across(r, axis).start))
    const bottom = Math.min(myAcross.start + myAcross.size, ...rects.map((r) => across(r, axis).start + across(r, axis).size))
    return top <= bottom ? (top + bottom) / 2 : myAcross.start + myAcross.size / 2
  }
  const candidates: Candidate[] = []

  // Halfway between the nearest neighbors on each side.
  const before = row.filter((o) => along(o, axis).start + along(o, axis).size <= mid).at(-1)
  const after = row.find((o) => along(o, axis).start >= mid)
  if (before && after) {
    const end = along(before, axis).start + along(before, axis).size
    const start = along(after, axis).start
    const gap = (start - end - me.size) / 2
    if (gap > 0) {
      const at = end + gap
      candidates.push({
        shift: at - me.start,
        spacing: { axis, across: acrossAt([before, after]), gaps: [{ start: end, end: at }, { start: at + me.size, end: start }] },
      })
    }
  }

  // One more step after (or before) two evenly spaced neighbors.
  for (let i = 0; i + 1 < row.length; i++) {
    const a = along(row[i], axis)
    const b = along(row[i + 1], axis)
    const gap = b.start - (a.start + a.size)
    if (gap <= 0) continue
    if (mid > b.start + b.size) {
      const at = b.start + b.size + gap
      candidates.push({
        shift: at - me.start,
        spacing: { axis, across: acrossAt([row[i], row[i + 1]]), gaps: [{ start: a.start + a.size, end: b.start }, { start: b.start + b.size, end: at }] },
      })
    } else if (mid < a.start) {
      const at = a.start - gap - me.size
      candidates.push({
        shift: at - me.start,
        spacing: { axis, across: acrossAt([row[i], row[i + 1]]), gaps: [{ start: at + me.size, end: a.start }, { start: a.start + a.size, end: b.start }] },
      })
    }
  }
  return candidates
}

// The smallest shift (within `tolerance`) that lines an edge or middle up, or evens out gaps.
function bestShift(moving: Rect, others: Rect[], frames: Rect[], axis: 'x' | 'y', tolerance: number): Candidate | null {
  let best: Candidate | null = null
  const consider = (candidate: Candidate) => {
    if (Math.abs(candidate.shift) > tolerance) return
    if (!best || Math.abs(candidate.shift) < Math.abs(best.shift) - 1e-9) best = candidate
  }
  const mine = lines(along(moving, axis))
  for (const target of [...frames, ...others]) {
    for (const t of lines(along(target, axis))) for (const m of mine) consider({ shift: t - m, spacing: null })
  }
  for (const candidate of spacingCandidates(moving, others, axis)) consider(candidate)
  return best
}

// Where edges or middles of the moved thing now line up with the page or other things.
function guidesFor(moving: Rect, others: Rect[], frames: Rect[], axis: 'x' | 'y'): Guide[] {
  const found = new Map<number, Guide>()
  const mine = lines(along(moving, axis))
  const myAcross = across(moving, axis)
  const add = (at: number, from: number, to: number) => {
    const key = Math.round(at * 100)
    const known = found.get(key)
    if (known) {
      known.from = Math.min(known.from, from)
      known.to = Math.max(known.to, to)
    } else {
      found.set(key, { axis, at, from, to })
    }
  }
  for (const frame of frames) {
    const frameAcross = across(frame, axis)
    for (const t of lines(along(frame, axis))) {
      if (mine.some((m) => Math.abs(m - t) < 0.5)) add(t, frameAcross.start, frameAcross.start + frameAcross.size)
    }
  }
  for (const other of others) {
    const otherAcross = across(other, axis)
    for (const t of lines(along(other, axis))) {
      if (!mine.some((m) => Math.abs(m - t) < 0.5)) continue
      add(t, Math.min(myAcross.start, otherAcross.start), Math.max(myAcross.start + myAcross.size, otherAcross.start + otherAcross.size))
    }
  }
  return [...found.values()]
}

// Snaps a move of `moving` by dx, dy. `tolerance` is how close counts (in design pixels); `whole`
// keeps moves to whole pixels, for pictures.
export function snapMove(moving: Rect, dx: number, dy: number, others: Rect[], page: Rect | Rect[], tolerance: number, whole: boolean): SnapResult {
  // The page, and the margins and columns on it, whose edges and middles things line up with.
  const frames = Array.isArray(page) ? page : [page]
  const round = (n: number) => (whole ? Math.round(n) : n)
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy }
  const snapX = bestShift(moved, others, frames, 'x', tolerance)
  const snapY = bestShift(moved, others, frames, 'y', tolerance)
  const finalDx = round(dx + (snapX?.shift ?? 0))
  const finalDy = round(dy + (snapY?.shift ?? 0))
  const final = { ...moving, x: moving.x + finalDx, y: moving.y + finalDy }
  const spacing: SpacingGuide[] = []
  if (snapX?.spacing && Math.abs(final.x - moved.x - snapX.shift) < 0.5) spacing.push(snapX.spacing)
  if (snapY?.spacing && Math.abs(final.y - moved.y - snapY.shift) < 0.5) spacing.push(snapY.spacing)
  return { dx: finalDx, dy: finalDy, guides: [...guidesFor(final, others, frames, 'x'), ...guidesFor(final, others, frames, 'y')], spacing }
}

// The smallest shift (within `tolerance`) that puts `at` onto an edge or middle of the page or of
// another thing, or null when none is that close.
function nearestLine(at: number, targets: Rect[], axis: 'x' | 'y', tolerance: number): number | null {
  let best: number | null = null
  for (const target of targets) {
    for (const t of lines(along(target, axis))) {
      const shift = t - at
      if (Math.abs(shift) <= tolerance && (best === null || Math.abs(shift) < Math.abs(best) - 1e-9)) best = shift
    }
  }
  return best
}

// Snaps a point (a corner being dragged out or pulled) onto the lines of the page and other things.
// `x` or `y` left out doesn't snap on that axis. Returns how far to shift it on each axis.
export function snapLines(x: number | null, y: number | null, others: Rect[], page: Rect | Rect[], tolerance: number): { dx: number | null; dy: number | null } {
  const targets = [...(Array.isArray(page) ? page : [page]), ...others]
  return {
    dx: x === null ? null : nearestLine(x, targets, 'x', tolerance),
    dy: y === null ? null : nearestLine(y, targets, 'y', tolerance),
  }
}

// What a resized or newly drawn rectangle lines up with now, as guides to show.
export function linedUp(rect: Rect, others: Rect[], page: Rect | Rect[]): SnapResult {
  const frames = Array.isArray(page) ? page : [page]
  return { dx: 0, dy: 0, guides: [...guidesFor(rect, others, frames, 'x'), ...guidesFor(rect, others, frames, 'y')], spacing: [] }
}
