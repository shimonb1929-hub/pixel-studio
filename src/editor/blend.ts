import { hexToRgb, normalizeHex, rgbToHex } from './color.ts'
import { createId } from './document.ts'
import { keepTogether } from './layers.ts'
import { polygonPoints } from './objects.ts'
import { geometryToPath, insertNode, pointOnSegment, segmentAt, segmentCount, type PathNode, type ShapePath } from './path.ts'
import type { EditorDocument, LayerGroup, Point, ShapeFill, ShapeGeometry, ShapeLayer, ShapeOutline } from './types.ts'

// Steps between two shapes (pro: Blend tool): shapes in between that slowly turn one into the
// other: its place, size, turn, color and outline, and even its outline's shape (a circle slowly
// becoming a star). Good for soft color ramps, rainbows and 3D-looking letters.

export const MAX_STEPS = 60

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mixColor(a: string, b: string, t: number): string {
  const x = normalizeHex(a)
  const y = normalizeHex(b)
  if (!x || !y) return t < 0.5 ? a : b
  const p = hexToRgb(x)
  const q = hexToRgb(y)
  return rgbToHex({ r: Math.round(lerp(p.r, q.r, t)), g: Math.round(lerp(p.g, q.g, t)), b: Math.round(lerp(p.b, q.b, t)) })
}

// The shortest way round from one turn to the other.
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function mixFill(a: ShapeFill, b: ShapeFill, t: number): ShapeFill {
  if (a.kind === 'color' && b.kind === 'color') return { kind: 'color', color: mixColor(a.color, b.color, t) }
  return t < 0.5 ? a : b
}

function mixOutline(a: ShapeOutline | null, b: ShapeOutline | null, t: number): ShapeOutline | null {
  if (a && b) return { ...(t < 0.5 ? a : b), color: mixColor(a.color, b.color, t), width: lerp(a.width, b.width, t) }
  // One has none: the line thins away toward the one without.
  const one = a ?? b
  if (!one) return null
  const share = a ? 1 - t : t
  return share < 0.02 ? null : { ...one, width: one.width * share }
}

// How long a curve is, about.
function segmentLength(path: ShapePath, i: number): number {
  const s = segmentAt(path, i)
  let length = 0
  let last = s.p0
  for (let k = 1; k <= 8; k++) {
    const p = pointOnSegment(s, k / 8)
    length += Math.hypot(p.x - last.x, p.y - last.y)
    last = p
  }
  return length
}

// The path with more points, split along its longest curves, until it has `count`.
function withPoints(path: ShapePath, count: number): ShapePath {
  let next = path
  while (next.nodes.length < count && segmentCount(next) > 0) {
    let longest = 0
    for (let i = 1; i < segmentCount(next); i++) if (segmentLength(next, i) > segmentLength(next, longest)) longest = i
    next = insertNode(next, longest, 0.5)
  }
  return next
}

// The closed path started at the point that lines up best with the other's points, so the steps
// don't twist round.
function lineUp(path: ShapePath, other: ShapePath): ShapePath {
  if (!path.closed) return path
  const n = path.nodes.length
  let best = 0
  let bestCost = Infinity
  for (let shift = 0; shift < n; shift++) {
    let cost = 0
    for (let i = 0; i < n; i++) {
      const p = path.nodes[(i + shift) % n]
      const q = other.nodes[i]
      cost += (p.x - q.x) ** 2 + (p.y - q.y) ** 2
    }
    if (cost < bestCost) {
      bestCost = cost
      best = shift
    }
  }
  return { ...path, nodes: path.nodes.map((_, i) => path.nodes[(i + best) % n]) }
}

const lerpPoint = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })

function asPath(layer: ShapeLayer): ShapePath {
  const w = Math.max(Math.abs(layer.box.width), 1e-6)
  const h = Math.max(Math.abs(layer.box.height), 1e-6)
  return geometryToPath(layer.geometry, w, h, polygonPoints(layer.geometry, w, h))
}

// What the shape's outline is like at `t`, for every step: worked out once.
function geometryMixer(a: ShapeLayer, b: ShapeLayer): (t: number) => ShapeGeometry {
  const ga = a.geometry
  const gb = b.geometry
  const plain = (g: ShapeGeometry) => g.type !== 'path' && !g.parts && !g.warp
  if (ga.type === gb.type && plain(ga) && plain(gb)) {
    return (t) => ({ ...ga, corners: lerp(ga.corners, gb.corners, t), sides: Math.round(lerp(ga.sides, gb.sides, t)) })
  }
  let pa = asPath(a)
  let pb = asPath(b)
  if (pa.closed !== pb.closed) return (t) => (t < 0.5 ? ga : gb)
  const count = Math.max(pa.nodes.length, pb.nodes.length)
  pa = withPoints(pa, count)
  pb = lineUp(withPoints(pb, count), pa)
  return (t) => {
    const nodes: PathNode[] = pa.nodes.map((p, i) => {
      const q = pb.nodes[i]
      return { ...lerpPoint(p, q, t), in: lerpPoint(p.in, q.in, t), out: lerpPoint(p.out, q.out, t), smooth: p.smooth && q.smooth }
    })
    return { type: 'path', corners: 0, sides: 5, arrow: false, path: { closed: pa.closed, nodes } }
  }
}

// The shapes in between, from just after `a` to just before `b`.
export function stepShapes(a: ShapeLayer, b: ShapeLayer, steps: number, name: string): ShapeLayer[] {
  const count = Math.max(1, Math.min(MAX_STEPS, Math.round(steps)))
  const shape = geometryMixer(a, b)
  return Array.from({ length: count }, (__, i): ShapeLayer => {
    const t = (i + 1) / (count + 1)
    const { group: _g, linked: _l, everyPage: _e, ...rest } = t < 0.5 ? a : b
    return {
      ...rest,
      id: createId('layer'),
      name,
      locked: false,
      opacity: lerp(a.opacity, b.opacity, t),
      box: {
        cx: lerp(a.box.cx, b.box.cx, t),
        cy: lerp(a.box.cy, b.box.cy, t),
        width: lerp(a.box.width, b.box.width, t),
        height: lerp(a.box.height, b.box.height, t),
        rotation: lerpAngle(a.box.rotation, b.box.rotation, t),
      },
      geometry: shape(t),
      fill: mixFill(a.fill, b.fill, t),
      outline: mixOutline(a.outline, b.outline, t),
    }
  })
}

// The design with the steps between two shapes: they go between them, lowest first, and are kept
// together with both. The same design when the two aren't both shapes.
export function addSteps(doc: EditorDocument, ids: [string, string], steps: number, name: string, groupName: string): EditorDocument {
  const [first, second] = ids.map((id) => doc.layers.find((l) => l.id === id))
  if (first?.kind !== 'shape' || second?.kind !== 'shape') return doc
  // From the lower one to the upper one, so each step sits on the one before.
  const low = doc.layers.indexOf(first) < doc.layers.indexOf(second) ? first : second
  const high = low === first ? second : first
  const made = stepShapes(low, high, steps, name)
  const layers = doc.layers.filter((l) => l.id !== high.id)
  const at = layers.indexOf(low) + 1
  layers.splice(at, 0, ...made, high)
  const group: LayerGroup = { id: createId('group'), name: groupName }
  const placed: EditorDocument = { ...doc, layers, activeLayerId: high.id }
  return keepTogether(placed, [low.id, ...made.map((l) => l.id), high.id], group)
}

// The two shapes to step between, when exactly two shapes are picked.
export function stepPair(doc: EditorDocument, ids: string[]): [string, string] | null {
  const shapes = doc.layers.filter((l) => ids.includes(l.id))
  if (shapes.length !== 2 || shapes.some((l) => l.kind !== 'shape')) return null
  return [shapes[0].id, shapes[1].id]
}
