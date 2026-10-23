import type { TransformBox } from './transform.ts'
import type { Point, ShapeGeometry } from './types.ts'

// Shapes drawn with the Pen: points joined by straight lines or smooth curves. Each point has two
// handles that pull the curve on either side of it; a handle sitting on its point makes no curve.

export interface PathNode {
  x: number
  y: number
  // The handle that shapes the curve coming in to this point, and the one going out of it.
  in: Point
  out: Point
  // A smooth point keeps its two handles in one straight line, so the curve flows through it.
  smooth: boolean
}

export interface ShapePath {
  nodes: PathNode[]
  // A closed path joins its last point back to the first and can be filled.
  closed: boolean
}

// The handle length that makes a quarter circle out of a cubic curve.
const KAPPA = 0.5522847498

export function cornerNode(p: Point): PathNode {
  return { x: p.x, y: p.y, in: { ...p }, out: { ...p }, smooth: false }
}

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
}

// The segments of a path: each from one point to the next (and back to the first when closed).
export function segmentCount(path: ShapePath): number {
  const n = path.nodes.length
  if (n < 2) return 0
  return path.closed ? n : n - 1
}

export interface Segment {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

export function segmentAt(path: ShapePath, i: number): Segment {
  const a = path.nodes[i]
  const b = path.nodes[(i + 1) % path.nodes.length]
  return { p0: a, p1: a.out, p2: b.in, p3: b }
}

export function isStraight(s: Segment): boolean {
  return same(s.p0, s.p1) && same(s.p2, s.p3)
}

export function pointOnSegment(s: Segment, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return { x: a * s.p0.x + b * s.p1.x + c * s.p2.x + d * s.p3.x, y: a * s.p0.y + b * s.p1.y + c * s.p2.y + d * s.p3.y }
}

// Splits a curve at t into two that together draw exactly the same line.
export function splitSegment(s: Segment, t: number): [Segment, Segment] {
  const lerp = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const ab = lerp(s.p0, s.p1)
  const bc = lerp(s.p1, s.p2)
  const cd = lerp(s.p2, s.p3)
  const abc = lerp(ab, bc)
  const bcd = lerp(bc, cd)
  const mid = lerp(abc, bcd)
  return [
    { p0: s.p0, p1: ab, p2: abc, p3: mid },
    { p0: mid, p1: bcd, p2: cd, p3: s.p3 },
  ]
}

// Every point of a path, mapped through `map` (to scale it, or to move it into the design).
export function mapPath(path: ShapePath, map: (p: Point) => Point): ShapePath {
  return {
    closed: path.closed,
    nodes: path.nodes.map((n) => {
      const p = map(n)
      return { x: p.x, y: p.y, in: map(n.in), out: map(n.out), smooth: n.smooth }
    }),
  }
}

// Adds the path to a canvas path. `trimEnd` (0 to 1) stops the last curve early, for arrow heads.
export function tracePath(target: Pick<Path2D, 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'closePath'>, path: ShapePath, trimEnd = 1): void {
  const { nodes } = path
  if (nodes.length === 0) return
  target.moveTo(nodes[0].x, nodes[0].y)
  const count = segmentCount(path)
  for (let i = 0; i < count; i++) {
    let s = segmentAt(path, i)
    if (i === count - 1 && trimEnd < 1) s = splitSegment(s, trimEnd)[0]
    if (isStraight(s)) target.lineTo(s.p3.x, s.p3.y)
    else target.bezierCurveTo(s.p1.x, s.p1.y, s.p2.x, s.p2.y, s.p3.x, s.p3.y)
  }
  if (path.closed && nodes.length > 2) target.closePath()
}

// Where a curve goes furthest along one direction: the values of t where its slope is flat.
function extremes(a: number, b: number, c: number, d: number): number[] {
  // The derivative is a quadratic: qa·t² + qb·t + qc.
  const qa = 3 * (-a + 3 * b - 3 * c + d)
  const qb = 6 * (a - 2 * b + c)
  const qc = 3 * (b - a)
  const found: number[] = []
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) > 1e-12) found.push(-qc / qb)
  } else {
    const disc = qb * qb - 4 * qa * qc
    if (disc >= 0) {
      const root = Math.sqrt(disc)
      found.push((-qb + root) / (2 * qa), (-qb - root) / (2 * qa))
    }
  }
  return found.filter((t) => t > 0 && t < 1)
}

// The smallest straight box around the drawn path (not its handles).
export function pathBounds(path: ShapePath): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (path.nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (p: Point) => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  path.nodes.forEach(add)
  for (let i = 0; i < segmentCount(path); i++) {
    const s = segmentAt(path, i)
    if (isStraight(s)) continue
    for (const t of [...extremes(s.p0.x, s.p1.x, s.p2.x, s.p3.x), ...extremes(s.p0.y, s.p1.y, s.p2.y, s.p3.y)]) add(pointOnSegment(s, t))
  }
  return { minX, minY, maxX, maxY }
}

// Shapes keep their path relative to their box: -0.5 to 0.5 across its width and height. This puts
// a path drawn in the design into a box (keeping the box's turn and flips), so the box fits it.
export function fitPathToBox(designPath: ShapePath, rotation = 0, flipX = false, flipY = false): { box: TransformBox; path: ShapePath } {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  // Into the box's own directions (unturned).
  const local = mapPath(designPath, (p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }))
  const b = pathBounds(local) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const lcx = (b.minX + b.maxX) / 2
  const lcy = (b.minY + b.maxY) / 2
  // A flat path (a straight line across) still gets a box that can be measured.
  const w = Math.max(b.maxX - b.minX, 1)
  const h = Math.max(b.maxY - b.minY, 1)
  const width = flipX ? -w : w
  const height = flipY ? -h : h
  const box: TransformBox = { cx: lcx * cos - lcy * sin, cy: lcx * sin + lcy * cos, width, height, rotation }
  const path = mapPath(local, (p) => ({ x: (p.x - lcx) / width, y: (p.y - lcy) / height }))
  return { box, path }
}

// A shape's path in the design, from its box.
export function pathInDesign(path: ShapePath, box: TransformBox): ShapePath {
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  return mapPath(path, (p) => {
    const x = p.x * box.width
    const y = p.y * box.height
    return { x: box.cx + x * cos - y * sin, y: box.cy + x * sin + y * cos }
  })
}

// Handles for a smooth point that make the curve flow evenly between its neighbors.
export function smoothHandles(prev: Point | null, node: Point, next: Point | null): { in: Point; out: Point } {
  if (!prev && !next) return { in: { ...node }, out: { ...node } }
  const a = prev ?? node
  const b = next ?? node
  let dx = b.x - a.x
  let dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  dx /= length
  dy /= length
  const before = prev ? Math.hypot(node.x - prev.x, node.y - prev.y) / 3 : 0
  const after = next ? Math.hypot(next.x - node.x, next.y - node.y) / 3 : 0
  return { in: { x: node.x - dx * before, y: node.y - dy * before }, out: { x: node.x + dx * after, y: node.y + dy * after } }
}

// Turns a point into a sharp corner (no handles) or a smooth curve.
export function setSmooth(path: ShapePath, index: number, smooth: boolean): ShapePath {
  const { nodes } = path
  const n = nodes.length
  const node = nodes[index]
  const prev = index > 0 ? nodes[index - 1] : path.closed ? nodes[n - 1] : null
  const next = index < n - 1 ? nodes[index + 1] : path.closed ? nodes[0] : null
  const handles = smooth ? smoothHandles(prev, node, next) : { in: { x: node.x, y: node.y }, out: { x: node.x, y: node.y } }
  return { ...path, nodes: nodes.map((p, i) => (i === index ? { ...p, ...handles, smooth } : p)) }
}

// Adds a point on a segment at t without changing how the path looks.
export function insertNode(path: ShapePath, segment: number, t: number): ShapePath {
  const [left, right] = splitSegment(segmentAt(path, segment), t)
  const nodes = path.nodes.map((n) => ({ ...n }))
  const a = nodes[segment]
  const bIndex = (segment + 1) % nodes.length
  const b = nodes[bIndex]
  a.out = left.p1
  b.in = right.p2
  const straight = isStraight(left) && isStraight(right)
  const added: PathNode = { x: left.p3.x, y: left.p3.y, in: left.p2, out: right.p1, smooth: !straight }
  nodes.splice(segment + 1, 0, added)
  return { ...path, nodes }
}

export function removeNode(path: ShapePath, index: number): ShapePath {
  const nodes = path.nodes.filter((_, i) => i !== index)
  return { nodes, closed: path.closed && nodes.length > 2 }
}

// Where on the path is closest to a point: the segment, how far along it, and how far away.
export function nearestOnPath(path: ShapePath, point: Point): { segment: number; t: number; distance: number } | null {
  let best: { segment: number; t: number; distance: number } | null = null
  const steps = 48
  for (let i = 0; i < segmentCount(path); i++) {
    const s = segmentAt(path, i)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const p = pointOnSegment(s, t)
      const distance = Math.hypot(p.x - point.x, p.y - point.y)
      if (!best || distance < best.distance) best = { segment: i, t, distance }
    }
  }
  if (!best) return null
  // Narrow it down around the closest sample.
  const s = segmentAt(path, best.segment)
  let lo = Math.max(0, best.t - 1 / steps)
  let hi = Math.min(1, best.t + 1 / steps)
  for (let k = 0; k < 20; k++) {
    const a = lo + (hi - lo) / 3
    const b = hi - (hi - lo) / 3
    const pa = pointOnSegment(s, a)
    const pb = pointOnSegment(s, b)
    if (Math.hypot(pa.x - point.x, pa.y - point.y) < Math.hypot(pb.x - point.x, pb.y - point.y)) hi = b
    else lo = a
  }
  const t = (lo + hi) / 2
  const p = pointOnSegment(s, t)
  return { segment: best.segment, t, distance: Math.hypot(p.x - point.x, p.y - point.y) }
}

// Bends a segment so the point at t goes where it was dragged, keeping its two ends in place.
export function bendSegment(path: ShapePath, segment: number, t: number, dx: number, dy: number): ShapePath {
  const weight = 3 * t * (1 - t)
  if (weight < 0.05) return path
  const kx = dx / weight
  const ky = dy / weight
  const nodes = path.nodes.map((n) => ({ ...n }))
  const a = nodes[segment]
  const b = nodes[(segment + 1) % nodes.length]
  a.out = { x: a.out.x + kx, y: a.out.y + ky }
  b.in = { x: b.in.x + kx, y: b.in.y + ky }
  // Bending a curve through a point makes that point a corner unless its handles still line up.
  a.smooth = a.smooth && handlesLineUp(a)
  b.smooth = b.smooth && handlesLineUp(b)
  return { ...path, nodes }
}

function handlesLineUp(n: PathNode): boolean {
  const ax = n.in.x - n.x
  const ay = n.in.y - n.y
  const bx = n.out.x - n.x
  const by = n.out.y - n.y
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(bx, by)
  if (la < 1e-9 || lb < 1e-9) return true
  return (ax * bx + ay * by) / (la * lb) < -0.999
}

// The direction a path ends in, for an arrow head.
export function endDirection(path: ShapePath): Point {
  const s = segmentAt(path, segmentCount(path) - 1)
  for (const from of [s.p2, s.p1, s.p0]) {
    const dx = s.p3.x - from.x
    const dy = s.p3.y - from.y
    const length = Math.hypot(dx, dy)
    if (length > 1e-9) return { x: dx / length, y: dy / length }
  }
  return { x: 1, y: 0 }
}

// How far along the last curve to stop so it ends `distance` before the path's end.
export function trimForArrow(path: ShapePath, distance: number): number {
  const s = segmentAt(path, segmentCount(path) - 1)
  const end = s.p3
  let lo = 0
  let hi = 1
  if (Math.hypot(s.p0.x - end.x, s.p0.y - end.y) <= distance) return 0
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    const p = pointOnSegment(s, mid)
    if (Math.hypot(p.x - end.x, p.y - end.y) > distance) lo = mid
    else hi = mid
  }
  return lo
}

// Any shape as a pen path (in its box, -0.5 to 0.5), so its points can be changed one by one.
export function geometryToPath(geometry: ShapeGeometry, w: number, h: number, polygonPoints: Point[]): ShapePath {
  const scale = (p: Point) => ({ x: p.x / w, y: p.y / h })
  if (geometry.type === 'path' && geometry.path) return geometry.path
  if (geometry.type === 'line') return { closed: false, nodes: [cornerNode({ x: -0.5, y: 0 }), cornerNode({ x: 0.5, y: 0 })] }
  if (geometry.type === 'ellipse') {
    const rx = w / 2
    const ry = h / 2
    const k = KAPPA
    const nodes: PathNode[] = [
      { x: 0, y: -ry, in: { x: -rx * k, y: -ry }, out: { x: rx * k, y: -ry }, smooth: true },
      { x: rx, y: 0, in: { x: rx, y: -ry * k }, out: { x: rx, y: ry * k }, smooth: true },
      { x: 0, y: ry, in: { x: rx * k, y: ry }, out: { x: -rx * k, y: ry }, smooth: true },
      { x: -rx, y: 0, in: { x: -rx, y: ry * k }, out: { x: -rx, y: -ry * k }, smooth: true },
    ]
    return mapPath({ closed: true, nodes }, scale)
  }
  if (geometry.type === 'rectangle') {
    const r = Math.min((geometry.corners * Math.min(w, h)) / 2, w / 2, h / 2)
    const x0 = -w / 2
    const x1 = w / 2
    const y0 = -h / 2
    const y1 = h / 2
    if (r < 0.5) return mapPath({ closed: true, nodes: [cornerNode({ x: x0, y: y0 }), cornerNode({ x: x1, y: y0 }), cornerNode({ x: x1, y: y1 }), cornerNode({ x: x0, y: y1 })] }, scale)
    const k = r * KAPPA
    // Each round corner is a curve between two points; the sides between them are straight.
    const arc = (a: Point, aOut: Point, b: Point, bIn: Point): PathNode[] => [
      { x: a.x, y: a.y, in: { ...a }, out: aOut, smooth: false },
      { x: b.x, y: b.y, in: bIn, out: { ...b }, smooth: false },
    ]
    const nodes: PathNode[] = [
      ...arc({ x: x0, y: y0 + r }, { x: x0, y: y0 + r - k }, { x: x0 + r, y: y0 }, { x: x0 + r - k, y: y0 }),
      ...arc({ x: x1 - r, y: y0 }, { x: x1 - r + k, y: y0 }, { x: x1, y: y0 + r }, { x: x1, y: y0 + r - k }),
      ...arc({ x: x1, y: y1 - r }, { x: x1, y: y1 - r + k }, { x: x1 - r, y: y1 }, { x: x1 - r + k, y: y1 }),
      ...arc({ x: x0 + r, y: y1 }, { x: x0 + r - k, y: y1 }, { x: x0, y: y1 - r }, { x: x0, y: y1 - r + k }),
    ]
    return mapPath({ closed: true, nodes }, scale)
  }
  return mapPath({ closed: true, nodes: polygonPoints.map(cornerNode) }, scale)
}
