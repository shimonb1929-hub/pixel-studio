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
