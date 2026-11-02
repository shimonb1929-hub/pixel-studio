import { isNeutral } from './adjust.ts'
import { adjustArea, renderAdjusted } from './adjustSession.ts'
import { createCanvas, getContext2d, layerFromCanvas, MAX_LAYER_SIDE } from './document.ts'
import { unionRect, type Rect } from './geometry.ts'
import { tidyGroups } from './layers.ts'
import { drawWithEffects, effectsReach, type DrawOptions, type LayerEffects } from './effects.ts'
import { drawLayerContent, layerBounds, layerPixels } from './objects.ts'
import { layerVersion } from './pixelVersion.ts'
import type { EditorDocument, Layer } from './types.ts'
import { paintPage } from './gradient.ts'

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
  paintPage(ctx, doc, doc.width, doc.height, undefined, seeThroughColor)
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
    ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale)
    paintPage(ctx, doc, doc.width, doc.height, area)
    drawLayer(ctx, doc, { ...base, effects }, { blend: false })
    return canvas
  })
}

// Joins layers into one picture layer, as they look on the design (adjustments, effects, softly
// hidden parts, how solid and how they mix included), where the highest of them was. Hidden layers
// are left as they are. Returns null when fewer than two of them show.
export function mergeLayers(doc: EditorDocument, ids: string[], name: string): EditorDocument | null {
  const chosen = new Set(ids)
  const joined = doc.layers.filter((l) => chosen.has(l.id) && l.visible)
  if (joined.length < 2) return null
  let area: Rect | null = null
  for (const l of joined) {
    const bounds = layerBounds(l)
    const reach = effectsReach(l.effects)
    area = unionRect(area, { x: bounds.x - reach, y: bounds.y - reach, width: bounds.width + 2 * reach, height: bounds.height + 2 * reach })
  }
  if (!area) return null
  const x = Math.floor(area.x)
  const y = Math.floor(area.y)
  const width = Math.max(1, Math.min(MAX_LAYER_SIDE, Math.ceil(area.x + area.width) - x))
  const height = Math.max(1, Math.min(MAX_LAYER_SIDE, Math.ceil(area.y + area.height) - y))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(-x, -y)
  for (const layer of joined) {
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  const top = joined[joined.length - 1]
  const merged = layerFromCanvas(name, canvas, x, y)
  const gone = new Set(joined.map((l) => l.id))
  const layers: Layer[] = []
  for (const layer of doc.layers) {
    if (layer === top) layers.push(merged)
    else if (!gone.has(layer.id)) layers.push(layer)
  }
  return tidyGroups({ ...doc, layers, activeLayerId: merged.id })
}
