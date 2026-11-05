import { flattenDocument } from './compose.ts'
import type { EditorDocument } from './types.ts'
import { floodRegion } from './flood.ts'

// Selecting by color (the professional "magic wand"): a click picks every pixel of a similar
// color in what you see, either only the ones touching the click or everywhere on the design.

// 1 for each picked pixel of the design. `tolerance` is how far apart (0–255) red, green, blue or
// see-through may be and still count as similar. Null if the point is off the design.
export function colorMask(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, tolerance: number, touching: boolean): Uint8Array | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  if (touching) return floodRegion(pixels, width, height, x, y, tolerance)?.mask ?? null
  const start = (y * width + x) * 4
  const [r, g, b, a] = [pixels[start], pixels[start + 1], pixels[start + 2], pixels[start + 3]]
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4
    if (
      Math.abs(pixels[p] - r) <= tolerance &&
      Math.abs(pixels[p + 1] - g) <= tolerance &&
      Math.abs(pixels[p + 2] - b) <= tolerance &&
      Math.abs(pixels[p + 3] - a) <= tolerance
    ) {
      mask[i] = 1
    }
  }
  return mask
}

// The pixels of similar color around a click in everything that shows on the design.
export function colorMaskAt(doc: EditorDocument, point: { x: number; y: number }, tolerance: number, touching: boolean): Uint8Array | null {
  const flat = flattenDocument(doc)
  const pixels = flat.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, doc.width, doc.height).data
  return colorMask(pixels, doc.width, doc.height, Math.floor(point.x), Math.floor(point.y), tolerance, touching)
}

// The most different colors kept from under a painted stroke. More would be slower and rarely
// changes what is found.
const MAX_STROKE_COLORS = 48

// Painting to select (the professional "quick selection"): every pixel the brush touched is
// picked, then the selection spreads out from them to the pixels around that look like the colors
// painted over, and stops at edges where the color jumps. `points` is the brush's path and
// `radius` its half-width, in pixels of the design. Null if the stroke missed the design.
export function paintedMask(pixels: Uint8ClampedArray, width: number, height: number, points: { x: number; y: number }[], radius: number, tolerance: number): Uint8Array | null {
  const mask = new Uint8Array(width * height)
  const queue: number[] = []
  const r = Math.max(1, radius)
  const dab = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(width - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(height - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x
        if (mask[i] || (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue
        mask[i] = 1
        queue.push(i)
      }
    }
  }
  if (points.length === 0) return null
  dab(points[0].x, points[0].y)
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, r / 2)))
    for (let s = 1; s <= steps; s++) dab(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps)
  }
  if (queue.length === 0) return null

  // The colors painted over, grouped into a few kinds and averaged.
  const groups = new Map<number, { n: number; r: number; g: number; b: number; a: number }>()
  for (const i of queue) {
    const p = i * 4
    const key = ((pixels[p] >> 4) << 12) | ((pixels[p + 1] >> 4) << 8) | ((pixels[p + 2] >> 4) << 4) | (pixels[p + 3] >> 4)
    const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0, a: 0 }
    group.n++
    group.r += pixels[p]
    group.g += pixels[p + 1]
    group.b += pixels[p + 2]
    group.a += pixels[p + 3]
    groups.set(key, group)
  }
  const colors = [...groups.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, MAX_STROKE_COLORS)
    .flatMap((g) => [g.r / g.n, g.g / g.n, g.b / g.n, g.a / g.n])
  const looksPainted = (p: number) => {
    for (let c = 0; c < colors.length; c += 4) {
      if (
        Math.abs(pixels[p] - colors[c]) <= tolerance &&
        Math.abs(pixels[p + 1] - colors[c + 1]) <= tolerance &&
        Math.abs(pixels[p + 2] - colors[c + 2]) <= tolerance &&
        Math.abs(pixels[p + 3] - colors[c + 3]) <= tolerance
      ) {
        return true
      }
    }
    return false
  }
  // A jump between two neighbors bigger than this is an edge the selection does not cross.
  const edge = Math.max(8, tolerance / 2)
  const smallStep = (p: number, q: number) =>
    Math.abs(pixels[p] - pixels[q]) <= edge && Math.abs(pixels[p + 1] - pixels[q + 1]) <= edge && Math.abs(pixels[p + 2] - pixels[q + 2]) <= edge && Math.abs(pixels[p + 3] - pixels[q + 3]) <= edge

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const x = i % width
    const p = i * 4
    const visit = (j: number) => {
      if (mask[j]) return
      const q = j * 4
      if (!smallStep(p, q) || !looksPainted(q)) return
      mask[j] = 1
      queue.push(j)
    }
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (i >= width) visit(i - width)
    if (i < width * (height - 1)) visit(i + width)
  }
  return mask
}

// Painting to select, in everything that shows on the design.
export function paintedMaskAt(doc: EditorDocument, points: { x: number; y: number }[], radius: number, tolerance: number): Uint8Array | null {
  const flat = flattenDocument(doc)
  const pixels = flat.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, doc.width, doc.height).data
  return paintedMask(pixels, doc.width, doc.height, points, radius, tolerance)
}
