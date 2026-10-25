import type { Point } from './types.ts'

// Moving a photo's four corners (pro: Distort, Perspective, Perspective Crop). The math behind it:
// the perspective map between a square and any four-cornered shape, and filling new pixels from a
// photo through such a map, with smooth sampling and soft edges.

// A perspective map, row by row: x' = (a·x + b·y + c) / (g·x + h·y + 1) and the same for y' with
// d, e, f. The ninth number is kept so maps can be turned around and combined.
export type Perspective = [number, number, number, number, number, number, number, number, number]

// Corners in order: top left, top right, bottom right, bottom left.
export type Quad = [Point, Point, Point, Point]

// The map from the square 0..1 × 0..1 onto `quad`: (0, 0) lands on its first corner, (1, 0) on the
// second, (1, 1) on the third and (0, 1) on the fourth (Heckbert's square-to-quad).
export function squareToQuad(quad: Quad): Perspective {
  const [p0, p1, p2, p3] = quad
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // A parallelogram: no perspective, just stretching and slanting.
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1]
  }
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const h = (dx1 * dy3 - dx3 * dy1) / det
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1]
}

export function invertPerspective(m: Perspective): Perspective {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = c * h - b * i
  const C = b * f - c * e
  const D = f * g - d * i
  const E = a * i - c * g
  const F = c * d - a * f
  const G = d * h - e * g
  const H = b * g - a * h
  const I = a * e - b * d
  const det = a * A + b * D + c * G
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det]
}

// First `second`, then `first`.
export function combinePerspective(first: Perspective, second: Perspective): Perspective {
  const out = new Array<number>(9)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] = first[row * 3] * second[col] + first[row * 3 + 1] * second[3 + col] + first[row * 3 + 2] * second[6 + col]
    }
  }
  return out as Perspective
}

// The same map, with its numbers' signs chosen so `inside` (a point the map really shows) is on
// the near side: points behind, which a perspective map also reaches, then stay empty.
export function facing(m: Perspective, inside: Point): Perspective {
  return m[6] * inside.x + m[7] * inside.y + m[8] < 0 ? (m.map((v) => -v) as Perspective) : m
}

export function applyPerspective(m: Perspective, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8]
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w }
}

// A plain stretch and move as a perspective map: x' = sx·x + dx, y' = sy·y + dy.
export function scaleMove(sx: number, sy: number, dx: number, dy: number): Perspective {
  return [sx, 0, dx, 0, sy, dy, 0, 0, 1]
}

// True when the four corners make a shape with no dents and no crossed sides. Only such shapes can
// show a flat picture seen at an angle, so a corner can't be dragged past that.
export function isConvex(quad: Quad, minArea = 1): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const c = quad[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return quadArea(quad) >= minArea
}

export function quadArea(quad: Quad): number {
  let sum = 0
  for (let i = 0; i < 4; i++) sum += quad[i].x * quad[(i + 1) % 4].y - quad[(i + 1) % 4].x * quad[i].y
  return Math.abs(sum) / 2
}

const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

// How wide and tall the thing inside `quad` is once it faces front: the average of its top and
// bottom sides, and of its left and right sides.
export function frontSize(quad: Quad): { width: number; height: number } {
  return {
    width: (length(quad[0], quad[1]) + length(quad[3], quad[2])) / 2,
    height: (length(quad[0], quad[3]) + length(quad[1], quad[2])) / 2,
  }
}

interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

// New pixels (width × height) filled from `source`: `map` takes a new pixel's middle to the point
// in the source it shows (in source pixels), and new pixels behind it (see facing) show nothing. Colors are read smoothly between source pixels, and
// along the source's edge they fade out within one pixel, so the edges come out smooth. Parts that
// show nothing stay see-through.
export function warpPixels(source: Pixels, map: Perspective, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  const sw = source.width
  const sh = source.height
  const src = source.data
  const [a, b, c, d, e, f, g, h, i] = map
  for (let y = 0; y < height; y++) {
    const py = y + 0.5
    for (let x = 0; x < width; x++) {
      const px = x + 0.5
      const w = g * px + h * py + i
      if (w <= 1e-12) continue
      const u = (a * px + b * py + c) / w
      const v = (d * px + e * py + f) / w
      // How much of this pixel the source covers: full inside, fading out over its last half pixel.
      const across = Math.min(u + 0.5, sw + 0.5 - u, 1)
      const down = Math.min(v + 0.5, sh + 0.5 - v, 1)
      if (across <= 0 || down <= 0) continue
      const cover = across * down
      const fx = Math.min(Math.max(u - 0.5, 0), sw - 1)
      const fy = Math.min(Math.max(v - 0.5, 0), sh - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const tx = fx - x0
      const ty = fy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty
      // Colors are mixed weighted by how solid they are, so see-through pixels never darken edges.
      const a00 = src[i00 + 3] * w00
      const a10 = src[i10 + 3] * w10
      const a01 = src[i01 + 3] * w01
      const a11 = src[i11 + 3] * w11
      const alpha = a00 + a10 + a01 + a11
      if (alpha <= 0) continue
      const o = (y * width + x) * 4
      out[o] = (src[i00] * a00 + src[i10] * a10 + src[i01] * a01 + src[i11] * a11) / alpha
      out[o + 1] = (src[i00 + 1] * a00 + src[i10 + 1] * a10 + src[i01 + 1] * a01 + src[i11 + 1] * a11) / alpha
      out[o + 2] = (src[i00 + 2] * a00 + src[i10 + 2] * a10 + src[i01 + 2] * a01 + src[i11 + 2] * a11) / alpha
      out[o + 3] = alpha * Math.min(1, cover)
    }
  }
  return out
}
