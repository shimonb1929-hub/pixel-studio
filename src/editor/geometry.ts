import type { Point } from './types.ts'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

// Grows a rectangle outward to whole pixels.
export function snapRect(rect: Rect): Rect {
  const x0 = Math.floor(rect.x)
  const y0 = Math.floor(rect.y)
  return { x: x0, y: y0, width: Math.ceil(rect.x + rect.width) - x0, height: Math.ceil(rect.y + rect.height) - y0 }
}

// Snaps a rectangle outward to whole pixels and trims it to a width × height area at 0, 0.
// Null if nothing is left.
export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  return intersectRect(snapRect(rect), { x: 0, y: 0, width, height })
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height
}

// The rectangle spanned by two corners, in any order.
export function rectFromCorners(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

// Like rectFromCorners, but square, growing from the first corner toward the second.
export function squareFromCorners(a: Point, b: Point): Rect {
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  return rectFromCorners(a, { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side })
}

export function rectPolygon({ x, y, width, height }: Rect): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
}

// An ellipse as a polygon with enough corners that it looks perfectly round.
export function ellipsePolygon({ x, y, width, height }: Rect): Point[] {
  const rx = width / 2
  const ry = height / 2
  const cx = x + rx
  const cy = y + ry
  // A multiple of 4 puts corners exactly on the left, right, top and bottom edges.
  const steps = Math.min(720, Math.max(48, Math.ceil((Math.PI * (rx + ry)) / 24) * 4))
  const points: Point[] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry })
  }
  return points
}

export function polygonBounds(points: Point[]): Rect | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}
