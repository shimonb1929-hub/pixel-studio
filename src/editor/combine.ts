import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import { canFill, photoPlacement, polygonPoints } from './objects.ts'
import { cornerNode, geometryToPath, isStraight, pathInDesign, pointOnSegment, segmentAt, segmentCount, type ShapePath } from './path.ts'
import type { TransformBox } from './transform.ts'
import type { PhotoFill, Point, ShapeLayer } from './types.ts'

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

// How far a point may sit from a straight line before it's needed to follow the outline.
const TIDY_TOLERANCE = 0.05

// Leaves out points that lie on a straight line from the last point kept to the next one, so a
// straight side is two points while a curve keeps every point that bends it (a curve's points are
// close together, so each is nearly in line with its neighbors; the last kept point stays put).
function tidy(ring: Ring): Point[] {
  const points = ring.map(([x, y]) => ({ x, y }))
  const first = points[0]
  const last = points[points.length - 1]
  if (points.length > 1 && first.x === last.x && first.y === last.y) points.pop()
  const kept: Point[] = []
  points.forEach((p, i) => {
    const a = kept[kept.length - 1] ?? points[points.length - 1]
    const b = points[(i + 1) % points.length]
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)
    if (Math.abs(cross) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) > TIDY_TOLERANCE) kept.push(p)
  })
  return kept
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
// bottom shape: its fill, outline and effects). The box is turned and flipped like the look's, so a
// gradient keeps its direction and a photo inside stays exactly where it was.
export function combinedShape(look: ShapeLayer, outlines: Point[][], id: string, name: string): ShapeLayer | null {
  const all = outlines.flat()
  if (all.length < 3) return null
  const { cx, cy, rotation } = look.box
  const flipX = look.box.width < 0 ? -1 : 1
  const flipY = look.box.height < 0 ? -1 : 1
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  // Into the look's own directions (unturned, unflipped, around its middle), and back.
  const toLocal = (p: Point): Point => ({ x: ((p.x - cx) * cos + (p.y - cy) * sin) * flipX, y: (-(p.x - cx) * sin + (p.y - cy) * cos) * flipY })
  const local = outlines.map((ring) => ring.map(toLocal))
  const flat = local.flat()
  const minX = Math.min(...flat.map((p) => p.x))
  const maxX = Math.max(...flat.map((p) => p.x))
  const minY = Math.min(...flat.map((p) => p.y))
  const maxY = Math.max(...flat.map((p) => p.y))
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const middle = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const mx = middle.x * flipX
  const my = middle.y * flipY
  const box: TransformBox = { cx: cx + mx * cos - my * sin, cy: cy + mx * sin + my * cos, width: width * flipX, height: height * flipY, rotation }
  const [main, ...parts] = local.map(
    (ring): ShapePath => ({ closed: true, nodes: ring.map((p) => cornerNode({ x: (p.x - middle.x) / width, y: (p.y - middle.y) / height })) }),
  )
  const fill = look.fill.kind === 'photo' ? { ...look.fill, ...keepPhoto(look.fill, Math.abs(look.box.width), Math.abs(look.box.height), width, height, middle) } : look.fill
  return {
    ...look,
    id,
    name,
    box,
    fill,
    geometry: { type: 'path', corners: 0, sides: look.geometry.sides, arrow: false, path: main, ...(parts.length ? { parts } : {}) },
  }
}

// How a photo inside a w × h shape is placed so it stays where it was once the shape is
// `width` × `height` with its middle moved by `shift`. A bigger shape that the photo no longer
// covers gets the photo enlarged just enough, around the same middle.
export function keepPhoto(photo: PhotoFill, w: number, h: number, width: number, height: number, shift: Point): Pick<PhotoFill, 'zoom' | 'x' | 'y'> {
  const place = photoPlacement(photo, w, h)
  const cover = Math.max(width / photo.canvas.width, height / photo.canvas.height)
  const scale = place.width / photo.canvas.width
  const zoom = Math.max(1, scale / cover)
  const grow = (zoom * cover) / scale
  const pw = place.width * grow
  const ph = place.height * grow
  // The photo's middle, relative to the new shape's middle.
  const midX = place.x + place.width / 2 - shift.x
  const midY = place.y + place.height / 2 - shift.y
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  // photoPlacement puts the middle at fill.x * (pw - width) / 2.
  const x = pw - width > 1e-9 ? clamp((2 * midX) / (pw - width)) : 0
  const y = ph - height > 1e-9 ? clamp((2 * midY) / (ph - height)) : 0
  return { zoom, x, y }
}
