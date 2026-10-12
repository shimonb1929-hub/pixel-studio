import { traceOutline } from '../editor/outline.ts'
import type { SelectionMode, SelectionOp, Selection } from '../editor/selection.ts'
import type { Point } from '../editor/types.ts'

// Turns what the AI found (a grid of yes/no pixels) into a selection: smooth outlines around each
// part, with holes taken out, so it works with everything else a selection does.

function signedArea(loop: Point[]): number {
  let sum = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

// Drops points that hardly change the outline (Douglas–Peucker), so pixel steps become smooth lines.
export function simplifyLoop(loop: Point[], tolerance: number): Point[] {
  if (loop.length <= 4) return loop
  const keep = new Uint8Array(loop.length)
  // A closed loop is split at its first point and the point farthest from it.
  let far = 0
  let farDistance = -1
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i].x - loop[0].x) ** 2 + (loop[i].y - loop[0].y) ** 2
    if (d > farDistance) {
      farDistance = d
      far = i
    }
  }
  keep[0] = 1
  keep[far] = 1
  const stack: [number, number][] = [
    [0, far],
    [far, loop.length],
  ]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    const a = loop[start]
    const b = loop[end % loop.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    let index = -1
    let worst = tolerance
    for (let i = start + 1; i < end; i++) {
      const p = loop[i]
      const d = Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / length
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }
  return loop.filter((_, i) => keep[i])
}

function insideLoop(point: Point, loop: Point[]): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]
    const b = loop[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// Selection steps for a mask that's `width` × `height`, stretched by `scaleX`, `scaleY` onto the design.
export function maskToOps(mask: Uint8Array, width: number, height: number, scaleX: number, scaleY: number): SelectionOp[] {
  const grid = new Uint8Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? 1 : 0
  const { loops } = traceOutline(grid, width, height)
  // Specks of a few pixels are left out: they're almost always mistakes.
  const minArea = Math.max(4, width * height * 0.0002)
  const parts = loops
    .map((loop) => ({ loop: simplifyLoop(loop, 0.75), area: signedArea(loop) }))
    .filter((p) => Math.abs(p.area) >= minArea && p.loop.length >= 3)
  // Outer edges first, then the holes in them, then anything inside the holes, and so on.
  const depth = parts.map((p) => parts.filter((q) => q !== p && Math.abs(q.area) > Math.abs(p.area) && insideLoop(p.loop[0], q.loop)).length)
  return parts
    .map((p, i) => ({ ...p, depth: depth[i] }))
    .sort((a, b) => a.depth - b.depth)
    .map(
      (p): SelectionOp => ({
        kind: 'polygon',
        // The tracer walks around outer edges one way and holes the other way.
        subtract: p.area < 0,
        points: p.loop.map((pt) => ({ x: pt.x * scaleX, y: pt.y * scaleY })),
      }),
    )
}

// Combines what was found with the current selection, like a drawn shape.
export function combineFound(current: Selection | null, ops: SelectionOp[], mode: SelectionMode): Selection | null {
  if (ops.length === 0) return mode === 'replace' ? null : current
  if (mode === 'subtract') {
    if (!current) return null
    return { ops: [...current.ops, ...ops.map((op) => (op.kind === 'polygon' ? { ...op, subtract: !op.subtract } : op))] }
  }
  if (mode === 'add' && current) return { ops: [...current.ops, ...ops] }
  return { ops }
}
