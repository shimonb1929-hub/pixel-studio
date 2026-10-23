import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import { canFill, polygonPoints } from './objects.ts'
import { cornerNode, geometryToPath, isStraight, pathInDesign, pointOnSegment, segmentAt, segmentCount, type ShapePath } from './path.ts'
import type { TransformBox } from './transform.ts'
import type { Point, ShapeLayer } from './types.ts'

// Making one shape out of several, as in Illustrator's Pathfinder, in plain words:
// join (all of them together), cut out (the ones on top cut holes in the bottom one), overlap (only
// where they all overlap), and apart (everywhere but where they overlap).
export type CombineMode = 'join' | 'cut' | 'overlap' | 'apart'

// Curves are followed closely enough that no one can see the corners, even printed large.
const CURVE_STEP = 2

// A closed shape's outlines in the design, as rings of points.
function rings(layer: ShapeLayer): Ring[] {
  const { geometry, box } = layer
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const main = geometryToPath(geometry, Math.max(w, 1e-6), Math.max(h, 1e-6), polygonPoints(geometry, w, h))
  return [main, ...(geometry.parts ?? [])].map((path) => flatten(pathInDesign(path, box)))
}

function flatten(path: ShapePath): Ring {
  const points: Pair[] = []
  for (let i = 0; i < segmentCount(path); i++) {
    const s = segmentAt(path, i)
    points.push([s.p0.x, s.p0.y])
    if (isStraight(s)) continue
    const length = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) + Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) + Math.hypot(s.p3.x - s.p2.x, s.p3.y - s.p2.y)
    const steps = Math.max(4, Math.min(400, Math.ceil(length / CURVE_STEP)))
    for (let k = 1; k < steps; k++) {
      const p = pointOnSegment(s, k / steps)
      points.push([p.x, p.y])
    }
  }
  return points
}
type Pair = [number, number]

// One shape's area: its outlines, filled where an odd number of them go around (so holes stay holes).
function area(layer: ShapeLayer): MultiPolygon {
  const [first, ...rest] = rings(layer).map((ring): Polygon => [ring])
  return rest.length ? polygonClipping.xor(first, ...rest) : [first]
}

// Leaves out points that lie on a straight line between their neighbors.
function tidy(ring: Ring): Point[] {
  const points = ring.slice(0, -1).map(([x, y]) => ({ x, y }))
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length]
    const b = points[(i + 1) % points.length]
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)
    return Math.abs(cross) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) > 0.05
  })
}

// Which shapes can be combined: closed ones that can be filled, not lines.
export function combinable(layer: ShapeLayer): boolean {
  return canFill(layer.geometry)
}

// The outlines of the combined shape, in the design. Shapes come bottom first. Empty when nothing
// is left (shapes that don't overlap have no overlap).
export function combineAreas(shapes: ShapeLayer[], mode: CombineMode): Point[][] {
  const [bottom, ...others] = shapes.map(area)
  if (!bottom) return []
  const result =
    others.length === 0
      ? bottom
      : mode === 'join'
        ? polygonClipping.union(bottom, ...others)
        : mode === 'cut'
          ? polygonClipping.difference(bottom, ...others)
          : mode === 'overlap'
            ? polygonClipping.intersection(bottom, ...others)
            : polygonClipping.xor(bottom, ...others)
  return result.flatMap((polygon) => polygon.map(tidy)).filter((ring) => ring.length >= 3)
}

// A shape made from outlines in the design: its box fits them all, and it looks like `look` (the
// bottom shape: its fill, outline and effects).
export function combinedShape(look: ShapeLayer, outlines: Point[][], id: string, name: string): ShapeLayer | null {
  const all = outlines.flat()
  if (all.length < 3) return null
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxY = Math.max(...all.map((p) => p.y))
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const box: TransformBox = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width, height, rotation: 0 }
  const [main, ...parts] = outlines.map(
    (ring): ShapePath => ({ closed: true, nodes: ring.map((p) => cornerNode({ x: (p.x - box.cx) / width, y: (p.y - box.cy) / height })) }),
  )
  return {
    ...look,
    id,
    name,
    box,
    geometry: { type: 'path', corners: 0, sides: look.geometry.sides, arrow: false, path: main, ...(parts.length ? { parts } : {}) },
  }
}
