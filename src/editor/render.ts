import type { EditorDocument, Viewport } from './types.ts'

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

export function renderScene(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  doc: EditorDocument,
  viewport: Viewport,
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

  ctx.save()
  ctx.setTransform(width / doc.width, 0, 0, height / doc.height, left, top)
  // Smooth when shrinking; show crisp square pixels when zoomed in.
  ctx.imageSmoothingEnabled = width < doc.width
  ctx.imageSmoothingQuality = 'high'
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(layer.canvas, 0, 0)
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(16, 24, 40, 0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(left - 0.5, top - 0.5, width + 1, height + 1)
}
