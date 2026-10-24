import { NO_ADJUSTMENTS } from './adjust.ts'
import { lookThumbnails } from './adjustSession.ts'
import { createCanvas, getContext2d } from './document.ts'
import { layerPixels } from './objects.ts'
import { layerVersion } from './pixelVersion.ts'
import { isBlank } from './pixels.ts'
import type { EditorDocument, Layer } from './types.ts'

// The other photos on a design that "Match another photo" can copy light and colors from: pictures
// on their own layer (as they look, adjustments included) and photos inside shapes.

export interface MatchPhoto {
  // The layer it's on.
  id: string
  name: string
  // A small copy of the photo itself, for its tile and for measuring its colors.
  picture: HTMLCanvasElement
}

// Plenty to measure light and colors from, and sharp enough for a small tile.
const PICTURE_SIDE = 160

const pictures = new WeakMap<Layer, { key: string; picture: HTMLCanvasElement | null }>()

function shrink(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(1, PICTURE_SIDE / Math.max(canvas.width, canvas.height))
  const out = createCanvas(Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale)))
  const ctx = getContext2d(out)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

// The small copy of a layer's photo, or null when it has none.
function pictureOf(doc: EditorDocument, layer: Layer): HTMLCanvasElement | null {
  if (layer.kind === 'shape') return layer.fill.kind === 'photo' ? shrink(layer.fill.canvas) : null
  if (layer.kind !== 'raster') return null
  const pixels = layerPixels(layer)
  if (isBlank(pixels.canvas)) return null
  const whole = { ...doc, selection: null }
  return lookThumbnails(whole, pixels, [layer.adjust ?? NO_ADJUSTMENTS], PICTURE_SIDE)?.[0] ?? null
}

// Every photo on the design except the one on layer `exceptId`, top layer first.
export function photosToMatch(doc: EditorDocument, exceptId: string): MatchPhoto[] {
  const found: MatchPhoto[] = []
  for (const layer of [...doc.layers].reverse()) {
    if (layer.id === exceptId || !layer.visible) continue
    // Remembered until the layer's pixels, adjustments or the design's size change.
    const key = `${doc.width}x${doc.height}:${layerVersion(layer)}:${JSON.stringify(layer.adjust)}`
    let cached = pictures.get(layer)
    if (!cached || cached.key !== key) {
      cached = { key, picture: pictureOf(doc, layer) }
      pictures.set(layer, cached)
    }
    if (cached.picture) found.push({ id: layer.id, name: layer.name, picture: cached.picture })
  }
  return found
}

// A picture's pixels (RGBA), for measuring.
export function picturePixels(picture: HTMLCanvasElement): Uint8ClampedArray {
  return picture.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, picture.width, picture.height).data
}
