import type { Rect } from './geometry.ts'
import type { Point } from './types.ts'

// A box that can be moved, resized, flipped and turned. Width and height are negative when the
// box is flipped. The source picture always fills the box exactly.
export interface TransformBox {
  cx: number
  cy: number
  width: number
  height: number
  // In radians, clockwise on screen.
  rotation: number
}

// A 2D transform: x' = a·x + c·y + e, y' = b·x + d·y + f (the same order canvas uses).
export interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export type Handle = 'move' | 'rotate' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// Where each handle sits on the box, as -1, 0 or 1 along its width and height.
export const HANDLE_SIGNS: Record<Exclude<Handle, 'move' | 'rotate'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}

const MIN_SIZE = 1
const SNAP_ANGLE = Math.PI / 12

export function boxFromRect(rect: Rect): TransformBox {
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }
}

function rotate(x: number, y: number, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

// A point given relative to the box (signs × half the size) in design coordinates.
export function boxPoint(box: TransformBox, sx: number, sy: number): Point {
  const p = rotate((sx * box.width) / 2, (sy * box.height) / 2, box.rotation)
  return { x: box.cx + p.x, y: box.cy + p.y }
}

// The four corners, clockwise from the top-left of the source picture.
export function boxCorners(box: TransformBox): Point[] {
  return [boxPoint(box, -1, -1), boxPoint(box, 1, -1), boxPoint(box, 1, 1), boxPoint(box, -1, 1)]
}

// Maps the source picture (sourceWidth × sourceHeight, top-left at 0, 0) onto the box.
export function boxMatrix(box: TransformBox, sourceWidth: number, sourceHeight: number): Affine {
  const sx = box.width / sourceWidth
  const sy = box.height / sourceHeight
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  const a = cos * sx
  const b = sin * sx
  const c = -sin * sy
  const d = cos * sy
  // The source's center lands on the box's center.
  const e = box.cx - (a * sourceWidth) / 2 - (c * sourceHeight) / 2
  const f = box.cy - (b * sourceWidth) / 2 - (d * sourceHeight) / 2
  return { a, b, c, d, e, f }
}

export function applyAffine(m: Affine, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
}

// m1 after m2: first apply m2, then m1.
export function multiplyAffine(m1: Affine, m2: Affine): Affine {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

export function translateAffine(dx: number, dy: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }
}

export interface DragOptions {
  // Corners keep the width-to-height shape.
  keepProportions: boolean
  // Rotation jumps in 15° steps.
  snapAngle: boolean
}

// The box after dragging one of its handles from `start` to `pointer` (both in design coordinates).
export function dragHandle(box: TransformBox, handle: Handle, start: Point, pointer: Point, options: DragOptions): TransformBox {
  if (handle === 'move') return { ...box, cx: box.cx + pointer.x - start.x, cy: box.cy + pointer.y - start.y }

  if (handle === 'rotate') {
    const startAngle = Math.atan2(start.y - box.cy, start.x - box.cx)
    const angle = Math.atan2(pointer.y - box.cy, pointer.x - box.cx)
    let rotation = box.rotation + angle - startAngle
    if (options.snapAngle) rotation = Math.round(rotation / SNAP_ANGLE) * SNAP_ANGLE
    return { ...box, rotation: normalizeAngle(rotation) }
  }

  const [hx, hy] = HANDLE_SIGNS[handle]
  // The opposite handle stays put while this one follows the pointer.
  const fixed = boxPoint(box, -hx, -hy)
  const local = rotate(pointer.x - fixed.x, pointer.y - fixed.y, -box.rotation)
  let width = hx !== 0 ? local.x / hx : box.width
  let height = hy !== 0 ? local.y / hy : box.height

  if (options.keepProportions && hx !== 0 && hy !== 0) {
    // Project the drag onto the box's diagonal, so the shape stays the same.
    const scale = (local.x * hx * box.width + local.y * hy * box.height) / (box.width ** 2 + box.height ** 2)
    width = box.width * scale
    height = box.height * scale
  }
  width = atLeast(width, MIN_SIZE)
  height = atLeast(height, MIN_SIZE)

  // The center sits halfway between the fixed handle and the dragged one.
  const offset = rotate((hx * width) / 2, (hy * height) / 2, box.rotation)
  return { ...box, width, height, cx: fixed.x + offset.x, cy: fixed.y + offset.y }
}

// Keeps a signed size at least `min` away from zero, without changing its direction.
function atLeast(value: number, min: number): number {
  if (Math.abs(value) >= min) return value
  return value < 0 ? -min : min
}

export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a <= -Math.PI) a += Math.PI * 2
  // Tiny leftovers from adding and subtracting angles count as straight.
  return Math.abs(a) < 1e-9 ? 0 : a
}

export function flipBox(box: TransformBox, axis: 'horizontal' | 'vertical'): TransformBox {
  return axis === 'horizontal' ? { ...box, width: -box.width } : { ...box, height: -box.height }
}

export function rotateBox90(box: TransformBox, direction: 1 | -1): TransformBox {
  return { ...box, rotation: normalizeAngle(box.rotation + (direction * Math.PI) / 2) }
}

// Which handle (if any) is under a design point. Sizes are in screen pixels, turned into design
// pixels with the zoom, so handles are just as easy to grab at any zoom.
export function hitHandle(box: TransformBox, point: Point, zoom: number, options: { rotate: boolean; edges?: boolean }): Handle | null {
  const grab = 9 / zoom
  if (options.rotate) {
    const knob = rotationKnob(box, zoom)
    if (Math.hypot(point.x - knob.x, point.y - knob.y) <= grab) return 'rotate'
  }
  for (const [name, [sx, sy]] of Object.entries(HANDLE_SIGNS) as [Handle, [number, number]][]) {
    // With a fixed shape (like a square crop), only the corners can resize.
    if (options.edges === false && (sx === 0 || sy === 0)) continue
    const p = boxPoint(box, sx, sy)
    if (Math.hypot(point.x - p.x, point.y - p.y) <= grab) return name
  }
  const local = rotate(point.x - box.cx, point.y - box.cy, -box.rotation)
  if (Math.abs(local.x) <= Math.abs(box.width) / 2 && Math.abs(local.y) <= Math.abs(box.height) / 2) return 'move'
  // Just outside a corner, dragging turns the box, like in most design programs.
  if (options.rotate) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = boxPoint(box, sx, sy)
      if (Math.hypot(point.x - p.x, point.y - p.y) <= grab * 3) return 'rotate'
    }
  }
  return null
}

// The round handle above the top edge that turns the box.
export function rotationKnob(box: TransformBox, zoom: number): Point {
  const stem = 28 / zoom
  const up = rotate(0, -(Math.abs(box.height) / 2 + stem), box.rotation)
  return { x: box.cx + up.x, y: box.cy + up.y }
}

export function isIdentity(box: TransformBox, original: TransformBox): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  return (
    near(box.cx, original.cx) &&
    near(box.cy, original.cy) &&
    near(box.width, original.width) &&
    near(box.height, original.height) &&
    near(box.rotation, original.rotation)
  )
}

// A plain-words name for what changed, used for the undo button.
export function describeChange(box: TransformBox, original: TransformBox): string {
  const flipped = Math.sign(box.width) !== Math.sign(original.width) || Math.sign(box.height) !== Math.sign(original.height)
  const resized =
    Math.abs(Math.abs(box.width) - Math.abs(original.width)) > 1e-6 || Math.abs(Math.abs(box.height) - Math.abs(original.height)) > 1e-6
  const rotated = Math.abs(normalizeAngle(box.rotation - original.rotation)) > 1e-6
  const parts = [resized && 'Resize', rotated && 'Rotate', flipped && 'Flip'].filter(Boolean) as string[]
  if (parts.length === 0) return 'Move'
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1].toLowerCase()}`
}
