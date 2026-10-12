import { isNeutral } from './adjust.ts'
import { adjustArea, renderAdjusted } from './adjustSession.ts'
import { createCanvas, getContext2d } from './document.ts'
import { drawWithEffects, effectsReach, type DrawOptions, type LayerEffects } from './effects.ts'
import { drawLayerContent, layerBounds, layerPixels } from './objects.ts'
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

// Draws a layer as it looks in the design: adjustments, effects and blend mode included, opacity
// left to the caller.
export function drawLayer(ctx: CanvasRenderingContext2D, doc: EditorDocument, layer: Layer, options?: DrawOptions): void {
  const adjusted = adjustedLayer(doc, layer)
  if (adjusted) {
    const { canvas, x, y } = adjusted
    const bounds = { x, y, width: canvas.width, height: canvas.height }
    drawWithEffects(ctx, layer.effects, layer.blend, bounds, (c) => c.drawImage(canvas, x, y), canvas, 0, options)
  } else {
    drawWithEffects(ctx, layer.effects, layer.blend, layerBounds(layer), (c) => drawLayerContent(c, layer), layer, layerVersion(layer), options)
  }
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

// Small pictures of a layer with each set of effects, on the page's color, for the ready-made
// effects. `aspect` is the pictures' width divided by their height.
export function effectThumbnails(doc: EditorDocument, layer: Layer, looks: LayerEffects[], maxSide: number, aspect: number): HTMLCanvasElement[] {
  // Adjustments are worked out once, not for every picture.
  const adjusted = adjustedLayer(doc, layer)
  const base: Layer = adjusted ? { ...layerPixels(layer), canvas: adjusted.canvas, x: adjusted.x, y: adjusted.y, adjust: null } : layer
  const reach = Math.max(0, ...looks.map(effectsReach))
  const bounds = layerBounds(base)
  let area = { x: bounds.x - reach, y: bounds.y - reach, width: bounds.width + 2 * reach, height: bounds.height + 2 * reach }
  // Long things (a line of text) show their middle part, big enough to see the effect.
  if (area.width > area.height * aspect) area = { ...area, x: area.x + (area.width - area.height * aspect) / 2, width: area.height * aspect }
  else if (area.height > area.width / aspect) area = { ...area, y: area.y + (area.height - area.width / aspect) / 2, height: area.width / aspect }
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height, 1))
  const width = Math.max(1, Math.round(area.width * scale))
  const height = Math.max(1, Math.round(area.height * scale))
  return looks.map((effects) => {
    const canvas = createCanvas(width, height)
    const ctx = getContext2d(canvas)
    if (doc.background) {
      ctx.fillStyle = doc.background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale)
    drawLayer(ctx, doc, { ...base, effects }, { blend: false })
    return canvas
  })
}
