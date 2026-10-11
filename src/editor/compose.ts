import { isNeutral } from './adjust.ts'
import { adjustArea, renderAdjusted } from './adjustSession.ts'
import { createCanvas, getContext2d } from './document.ts'
import { drawLayerContent, layerPixels } from './objects.ts'
import { layerVersion } from './pixelVersion.ts'
import type { EditorDocument, Layer } from './types.ts'

// Putting the design together at full detail: for downloads, previews, the fill bucket and the
// color picker.

interface Adjusted {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

// Working out adjustments at full detail takes a moment, so the result is kept until the layer,
// its pixels or the design's size change.
const adjustedCache = new WeakMap<Layer, { key: string; result: Adjusted | null }>()

// A layer with its adjustments, as pixels at full detail: the canvas and where it sits. Null when
// the layer has no adjustments.
export function adjustedLayer(doc: EditorDocument, layer: Layer): Adjusted | null {
  if (!layer.adjust || isNeutral(layer.adjust)) return null
  const key = `${doc.width}x${doc.height}:${layerVersion(layer)}`
  const cached = adjustedCache.get(layer)
  if (cached && cached.key === key) return cached.result
  const pixels = layerPixels(layer)
  const whole = { ...doc, selection: null }
  const area = adjustArea(whole, pixels, layer.adjust)
  const result = area && { canvas: renderAdjusted(whole, pixels, layer.adjust, area, 1), x: area.x, y: area.y }
  adjustedCache.set(layer, { key, result })
  return result
}

// Draws a layer as it looks in the design (adjustments included, opacity left to the caller).
export function drawLayer(ctx: CanvasRenderingContext2D, doc: EditorDocument, layer: Layer): void {
  const adjusted = adjustedLayer(doc, layer)
  if (adjusted) ctx.drawImage(adjusted.canvas, adjusted.x, adjusted.y)
  else drawLayerContent(ctx, layer)
}

// Merges the page and all visible layers into a single canvas. A see-through page stays
// see-through unless a color is given for it (JPG has no see-through).
export function flattenDocument(doc: EditorDocument, seeThroughColor?: string): HTMLCanvasElement {
  const canvas = createCanvas(doc.width, doc.height)
  const ctx = getContext2d(canvas)
  const page = doc.background ?? seeThroughColor
  if (page) {
    ctx.fillStyle = page
    ctx.fillRect(0, 0, doc.width, doc.height)
  }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  return canvas
}
