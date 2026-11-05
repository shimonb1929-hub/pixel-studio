import { isNeutral } from './adjust.ts'
import { previewParts } from './adjustSession.ts'
import { drawWithEffects } from './effects.ts'
import { polygonBounds, unionRect, type Rect } from './geometry.ts'
import { drawHidden, drawLayerContent, layerBounds, layerPixels } from './objects.ts'
import { layerVersion } from './pixelVersion.ts'
import { drawingScreen, sharpVersion } from './sharp.ts'
import { applyAffine, type Affine } from './transform.ts'
import type { EditorDocument, Layer, Viewport } from './types.ts'
import { paintPage } from './gradient.ts'
import { wrapLayers } from '../text/wrapAround.ts'

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

// Two soft shadows lift the design off the table, under a white page.
function paintPageWithShadow(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number, dpr: number) {
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
}

// Blurring a shadow is slow, and the screen is drawn again many times a second while painting,
// zooming and scrolling. So the shadowed page is drawn once, small, and stretched to any size:
// its corners are copied as they are and its middle parts, which are the same all along, are
// stretched.
const shadowTiles = new Map<number, { canvas: HTMLCanvasElement; edge: number }>()

function shadowTile(dpr: number) {
  let tile = shadowTiles.get(dpr)
  if (!tile) {
    // How far the softest shadow reaches past the page, and then as far again inside it, so the
    // corners have faded out by the stretched middle.
    const reach = Math.ceil((28 * 1.5 + 10 + 2) * dpr)
    const edge = reach * 2
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = edge * 2 + 1
    paintPageWithShadow(canvas.getContext('2d')!, reach, reach, canvas.width - reach * 2, canvas.height - reach * 2, dpr)
    tile = { canvas, edge }
    shadowTiles.set(dpr, tile)
  }
  return tile
}

function drawPageShadow(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number, dpr: number) {
  const { canvas, edge } = shadowTile(dpr)
  const reach = edge / 2
  // A page smaller than the corners is quick to shadow directly.
  if (width < edge * 2 || height < edge * 2) {
    paintPageWithShadow(ctx, left, top, width, height, dpr)
    return
  }
  const x0 = left - reach
  const y0 = top - reach
  const w = width + reach * 2
  const h = height + reach * 2
  // Source and screen positions of the three columns and three rows.
  const src = [0, edge, edge + 1, canvas.width]
  const xs = [x0, x0 + edge, x0 + w - edge, x0 + w]
  const ys = [y0, y0 + edge, y0 + h - edge, y0 + h]
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.drawImage(canvas, src[col], src[row], src[col + 1] - src[col], src[row + 1] - src[row], xs[col], ys[row], xs[col + 1] - xs[col], ys[row + 1] - ys[row])
    }
  }
  ctx.restore()
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
// `copy`: the changed layers are new copies, shown just above the originals, which stay as they are
// (while dragging out a copy).
export type LayerOverride = { layerId: string; parts: RenderPart[] } | { layerId: string; layer: Layer; copy?: boolean } | { layers: Map<string, Layer>; copy?: boolean }

// Adjusted layers are shown with just the detail the screen needs, worked out again only when the
// layer, its pixels, the zoom or the design's size change.
const adjustedParts = new WeakMap<Layer, { key: string; parts: RenderPart[] }>()

function adjustedOnScreen(doc: EditorDocument, layer: Layer, screenScale: number): RenderPart[] | null {
  if (!layer.adjust || isNeutral(layer.adjust)) return null
  const key = `${doc.width}x${doc.height}:${screenScale.toFixed(3)}:${layerVersion(layer)}:${sharpVersion()}`
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

// The layers as they look right now, with the ones being changed shown changed. While something
// text flows around is moved or resized (or the text is), the text flows around it as it goes.
function shownLayers(layers: Layer[], override: LayerOverride | null | undefined): Layer[] {
  if (!override || 'parts' in override) return layers
  const changedOf = (l: Layer) => ('layers' in override ? override.layers.get(l.id) : override.layerId === l.id ? override.layer : undefined)
  const changed = override.copy
    ? layers.flatMap((l) => {
        const copy = changedOf(l)
        return copy ? [l, copy] : [l]
      })
    : layers.map((l) => changedOf(l) ?? l)
  return changed.some((l) => l.textWrap) ? wrapLayers(changed) : changed
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

  drawPageShadow(ctx, left, top, width, height, dpr)

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
  // Pictures shown bigger get their sharp copies in the background (see sharp.ts).
  drawingScreen(() => {
    for (const layer of shownLayers(doc.layers, override)) {
      if (override && 'parts' in override && override.layerId === layer.id) {
        if (layer.visible && layer.opacity > 0) {
          target.globalAlpha = layer.opacity
          const parts = override.parts
          drawWithEffects(target, layer.effects, layer.blend, partsBounds(parts), (c) => drawHidden(c, layer, partsBounds(parts), (h) => drawParts(h, parts)), parts, 0)
        }
        continue
      }
      if (!layer.visible || layer.opacity <= 0) continue
      target.globalAlpha = layer.opacity
      const adjusted = adjustedOnScreen(doc, layer, screenScale)
      if (adjusted) drawWithEffects(target, layer.effects, layer.blend, partsBounds(adjusted), (c) => drawParts(c, adjusted), adjusted, 0)
      // Effects are worked out again once a sharp copy is ready. (The screen's count never matches
      // a download's, so a download never reuses what the screen drew before the copy was ready.)
      else drawWithEffects(target, layer.effects, layer.blend, layerBounds(layer), (c) => drawLayerContent(c, layer), layer, layerVersion(layer) + (sharpVersion() + 1) * 1e6)
    }
  })
  target.restore()
  if (page) ctx.drawImage(page, left, top)

  ctx.strokeStyle = 'rgba(16, 24, 40, 0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(left - 0.5, top - 0.5, width + 1, height + 1)
}
