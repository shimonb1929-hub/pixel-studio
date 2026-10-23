import { isNeutral } from './adjust.ts'
import { previewParts } from './adjustSession.ts'
import { drawWithEffects } from './effects.ts'
import { polygonBounds, unionRect, type Rect } from './geometry.ts'
import { drawHidden, drawLayerContent, layerBounds, layerPixels } from './objects.ts'
import { layerVersion } from './pixelVersion.ts'
import { applyAffine, type Affine } from './transform.ts'
import type { EditorDocument, Layer, Viewport } from './types.ts'
import { paintPage } from './gradient.ts'

export const WORKSPACE_COLOR = '#e7e9ee'

const CHECKER_SQUARE = 8
const checkerTiles = new Map<number, HTMLCanvasElement>()

const DOT_SPACING = 24
const dotTiles = new Map<number, HTMLCanvasElement>()

// A faint dot grid behind the design, so moving around feels like sliding over a table.
function dotTile(dpr: number): HTMLCanvasElement {
  let tile = dotTiles.get(dpr)
  if (!tile) {
    const size = Math.round(DOT_SPACING * dpr)
    tile = document.createElement('canvas')
    tile.width = tile.height = size
    const ctx = tile.getContext('2d')!
    ctx.fillStyle = 'rgba(27, 33, 48, 0.13)'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, Math.max(0.75, dpr * 0.85), 0, Math.PI * 2)
    ctx.fill()
    dotTiles.set(dpr, tile)
  }
  return tile
}

// Gray-and-white squares that show where the image is see-through.
function checkerTile(dpr: number): HTMLCanvasElement {
  let tile = checkerTiles.get(dpr)
  if (!tile) {
    const square = Math.round(CHECKER_SQUARE * dpr)
    tile = document.createElement('canvas')
    tile.width = tile.height = square * 2
    const ctx = tile.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, square * 2, square * 2)
    ctx.fillStyle = '#e8eaee'
    ctx.fillRect(square, 0, square, square)
    ctx.fillRect(0, square, square, square)
    checkerTiles.set(dpr, tile)
  }
  return tile
}

export interface Surface {
  // Size in CSS pixels; the canvas itself is width * dpr by height * dpr.
  width: number
  height: number
  dpr: number
}

export interface RenderPart {
  canvas: HTMLCanvasElement
  x: number
  y: number
  // When set, places the canvas through this transform instead of at x, y.
  transform?: Affine
}

// Shown in place of a layer while it's being painted on, moved, resized or adjusted: either
// pictures to draw, or a changed copy of the layer, or changed copies of several layers.
export type LayerOverride = { layerId: string; parts: RenderPart[] } | { layerId: string; layer: Layer } | { layers: Map<string, Layer> }

// Adjusted layers are shown with just the detail the screen needs, worked out again only when the
// layer, its pixels, the zoom or the design's size change.
const adjustedParts = new WeakMap<Layer, { key: string; parts: RenderPart[] }>()

function adjustedOnScreen(doc: EditorDocument, layer: Layer, screenScale: number): RenderPart[] | null {
  if (!layer.adjust || isNeutral(layer.adjust)) return null
  const key = `${doc.width}x${doc.height}:${screenScale.toFixed(3)}:${layerVersion(layer)}`
  const cached = adjustedParts.get(layer)
  if (cached && cached.key === key) return cached.parts
  const parts = previewParts({ ...doc, selection: null }, layerPixels(layer), layer.adjust, screenScale)
  adjustedParts.set(layer, { key, parts })
  return parts
}

// The area pictures cover, in design pixels.
function partsBounds(parts: RenderPart[]): Rect {
  let bounds: Rect | null = null
  for (const part of parts) {
    const w = part.canvas.width
    const h = part.canvas.height
    if (!part.transform) {
      bounds = unionRect(bounds, { x: part.x, y: part.y, width: w, height: h })
      continue
    }
    const corners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: 0, y: h },
      { x: w, y: h },
    ].map((p) => applyAffine(part.transform!, p))
    bounds = unionRect(bounds, polygonBounds(corners)!)
  }
  return bounds ?? { x: 0, y: 0, width: 0, height: 0 }
}

// The design's layers, put together on their own, at screen size.
let pageBuffer: HTMLCanvasElement | null = null
function pageCanvas(width: number, height: number): HTMLCanvasElement {
  if (!pageBuffer) pageBuffer = document.createElement('canvas')
  if (pageBuffer.width !== width || pageBuffer.height !== height) {
    pageBuffer.width = width
    pageBuffer.height = height
  } else {
    pageBuffer.getContext('2d')!.clearRect(0, 0, width, height)
  }
  return pageBuffer
}

function drawParts(ctx: CanvasRenderingContext2D, parts: RenderPart[]) {
  for (const part of parts) {
    if (!part.transform) {
      ctx.drawImage(part.canvas, part.x, part.y)
      continue
    }
    const { a, b, c, d, e, f } = part.transform
    ctx.save()
    ctx.transform(a, b, c, d, e, f)
    // Turned or resized pictures always need smoothing, whatever the zoom.
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(part.canvas, 0, 0)
    ctx.restore()
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  doc: EditorDocument,
  viewport: Viewport,
  override?: LayerOverride | null,
): void {
  const { dpr } = surface
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = WORKSPACE_COLOR
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // The document's rectangle in device pixels, snapped so its edges stay sharp.
  const left = Math.round(viewport.panX * dpr)
  const top = Math.round(viewport.panY * dpr)
  const width = Math.max(1, Math.round((viewport.panX + doc.width * viewport.zoom) * dpr) - left)
  const height = Math.max(1, Math.round((viewport.panY + doc.height * viewport.zoom) * dpr) - top)

  const dots = ctx.createPattern(dotTile(dpr), 'repeat')
  if (dots) {
    dots.setTransform(new DOMMatrix([1, 0, 0, 1, left, top]))
    ctx.fillStyle = dots
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }

  // Two soft shadows lift the design off the table.
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(16, 24, 40, 0.08)'
  ctx.shadowBlur = 4 * dpr
  ctx.shadowOffsetY = 1 * dpr
  ctx.fillRect(left, top, width, height)
  ctx.shadowColor = 'rgba(16, 24, 40, 0.10)'
  ctx.shadowBlur = 28 * dpr
  ctx.shadowOffsetY = 10 * dpr
  ctx.fillRect(left, top, width, height)
  ctx.restore()

  const pattern = ctx.createPattern(checkerTile(dpr), 'repeat')
  if (pattern) {
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, left, top]))
    ctx.fillStyle = pattern
    ctx.fillRect(left, top, width, height)
  }

  if (doc.background) {
    ctx.save()
    ctx.translate(left, top)
    ctx.scale(width / doc.width, height / doc.height)
    paintPage(ctx, doc, doc.width, doc.height)
    ctx.restore()
  }

  // Layers that mix with what's below need something real below them: on a see-through page they
  // are put together on their own first, so they never mix with the gray-and-white squares.
  const mixing = !doc.background && doc.layers.some((l) => l.visible && l.blend && l.blend !== 'normal')
  const page = mixing ? pageCanvas(width, height) : null
  const target = page ? page.getContext('2d')! : ctx
  target.save()
  target.setTransform(width / doc.width, 0, 0, height / doc.height, page ? 0 : left, page ? 0 : top)
  // Smooth when shrinking; show crisp square pixels when zoomed in.
  target.imageSmoothingEnabled = width < doc.width
  target.imageSmoothingQuality = 'high'
  const screenScale = width / doc.width
  for (const original of doc.layers) {
    let layer = original
    if (override && 'layers' in override) {
      layer = override.layers.get(original.id) ?? original
    } else if (override?.layerId === original.id) {
      if ('parts' in override) {
        if (original.visible && original.opacity > 0) {
          target.globalAlpha = original.opacity
          const parts = override.parts
          drawWithEffects(target, original.effects, original.blend, partsBounds(parts), (c) => drawHidden(c, original, partsBounds(parts), (h) => drawParts(h, parts)), parts, 0)
        }
        continue
      }
      layer = override.layer
    }
    if (!layer.visible || layer.opacity <= 0) continue
    target.globalAlpha = layer.opacity
    const adjusted = adjustedOnScreen(doc, layer, screenScale)
    if (adjusted) drawWithEffects(target, layer.effects, layer.blend, partsBounds(adjusted), (c) => drawParts(c, adjusted), adjusted, 0)
    else drawWithEffects(target, layer.effects, layer.blend, layerBounds(layer), (c) => drawLayerContent(c, layer), layer, layerVersion(layer))
  }
  target.restore()
  if (page) ctx.drawImage(page, left, top)

  ctx.strokeStyle = 'rgba(16, 24, 40, 0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(left - 0.5, top - 0.5, width + 1, height + 1)
}
