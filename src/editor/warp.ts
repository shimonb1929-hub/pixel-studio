import { geometryToPath, mapPath, pathBounds, segmentAt, segmentCount, splitSegment, type PathNode, type Segment, type ShapePath } from './path.ts'
import type { Point, ShapeGeometry } from './types.ts'

// Bend a shape (pro: Envelope Distort, Warp): an arch, a bulge, a wave, a flag or a twist, more
// or less strong. The shape itself stays as it was, so the bend can be changed or taken off any
// time; it is applied each time the shape is drawn, and stays inside the shape's box.

export type WarpKind = 'arch' | 'bulge' | 'wave' | 'flag' | 'twist'

export const WARP_KINDS: WarpKind[] = ['arch', 'bulge', 'wave', 'flag', 'twist']

export interface Warp {
  kind: WarpKind
  // -1 to 1: how strong, and which way (an arch up or down, a bulge out or in).
  amount: number
}

export function isWarped(geometry: ShapeGeometry): boolean {
  return !!geometry.warp && Math.abs(geometry.warp.amount) > 0.001
}

// Where a point of the box (-0.5 to 0.5 both ways) goes.
function warpPoint(warp: Warp, p: Point): Point {
  const a = warp.amount
  const u = p.x
  const v = p.y
  if (warp.kind === 'arch') {
    // Up in the middle like a rainbow; the bottom follows the top.
    return { x: u, y: v - a * 0.5 * (1 - 4 * u * u) }
  }
  if (warp.kind === 'bulge') {
    // Swells out in the middle (or pinches in, below 0).
    return { x: u * (1 + a * 0.5 * (1 - 4 * v * v)), y: v * (1 + a * (1 - 4 * u * u)) }
  }
  if (warp.kind === 'wave') return { x: u, y: v + a * 0.18 * Math.sin(2 * Math.PI * u) }
  if (warp.kind === 'flag') {
    // Waves more and more toward the free end, like a flag on a pole.
    return { x: u, y: v + a * 0.25 * (u + 0.5) * Math.sin(2 * Math.PI * (u + 0.5)) }
  }
  // Twist: turns more toward the middle.
  const r = Math.min(1, Math.hypot(u, v) / 0.7071)
  const turn = a * Math.PI * 0.6 * (1 - r) * (1 - r)
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return { x: u * cos - v * sin, y: u * sin + v * cos }
}

// Each curve cut into smaller pieces, so the bent shape follows the bend smoothly.
const PIECES = 8

function finer(path: ShapePath): ShapePath {
  const count = segmentCount(path)
  if (count === 0) return path
  const pieces: Segment[] = []
  for (let i = 0; i < count; i++) {
    let rest = segmentAt(path, i)
    for (let k = 0; k < PIECES - 1; k++) {
      const [piece, after] = splitSegment(rest, 1 / (PIECES - k))
      pieces.push(piece)
      rest = after
    }
    pieces.push(rest)
  }
  const n = pieces.length
  const at = (i: number) => pieces[(i + n) % n]
  if (path.closed) {
    return { closed: true, nodes: pieces.map((piece, i) => ({ x: piece.p0.x, y: piece.p0.y, in: at(i - 1).p2, out: piece.p1, smooth: false })) }
  }
  const first = path.nodes[0]
  const last = path.nodes[path.nodes.length - 1]
  const nodes: PathNode[] = [{ x: first.x, y: first.y, in: first.in, out: pieces[0].p1, smooth: false }]
  pieces.forEach((piece, i) => nodes.push({ x: piece.p3.x, y: piece.p3.y, in: piece.p2, out: i < n - 1 ? pieces[i + 1].p1 : last.out, smooth: false }))
  return { closed: false, nodes }
}

// The shape's outlines bent, in its box (-0.5 to 0.5), fitted back inside the box.
const kept = new WeakMap<ShapeGeometry, { w: number; h: number; paths: ShapePath[] }>()

export function warpedPaths(geometry: ShapeGeometry, w: number, h: number, polygon: Point[]): ShapePath[] {
  const was = kept.get(geometry)
  if (was && was.w === w && was.h === h) return was.paths
  const paths = bendPaths(geometry, w, h, polygon)
  kept.set(geometry, { w, h, paths })
  return paths
}

function bendPaths(geometry: ShapeGeometry, w: number, h: number, polygon: Point[]): ShapePath[] {
  const base = [geometryToPath(geometry, w, h, polygon), ...(geometry.parts ?? [])]
  if (!geometry.warp || !isWarped(geometry)) return base
  const warp = geometry.warp
  const bend = (p: Point) => warpPoint(warp, p)
  const bent = base.map((path) => {
    const fine = finer(path)
    return { closed: fine.closed, nodes: fine.nodes.map((n) => ({ ...n, ...bend(n), in: bend(n.in), out: bend(n.out) })) }
  })
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const path of bent) {
    const b = pathBounds(path)
    if (!b) continue
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  if (!Number.isFinite(minX)) return bent
  // The bent shape fills its box the way the straight one did.
  const straight = pathBounds(base[0]) ?? { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }
  const sx = (straight.maxX - straight.minX) / Math.max(1e-6, maxX - minX)
  const sy = (straight.maxY - straight.minY) / Math.max(1e-6, maxY - minY)
  const fit = (p: Point) => ({ x: straight.minX + (p.x - minX) * sx, y: straight.minY + (p.y - minY) * sy })
  return bent.map((path) => mapPath(path, fit))
}
