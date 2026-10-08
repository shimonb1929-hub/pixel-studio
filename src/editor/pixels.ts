import { hexToRgb } from './color.ts'
import { createCanvas, flattenDocument, getContext2d } from './document.ts'
import { floodRegion, growRegion } from './flood.ts'
import type { Rect } from './geometry.ts'
import { selectionInfo } from './selection.ts'
import type { EditorDocument, Layer } from './types.ts'

// A piece of a layer, placed somewhere in the design.
export interface Piece {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

// The selected part of a layer, or the whole layer when nothing is selected.
// Null if the selection is empty.
export function copySelected(layer: Layer, doc: EditorDocument): Piece | null {
  if (!doc.selection) {
    const canvas = createCanvas(layer.canvas.width, layer.canvas.height)
    getContext2d(canvas).drawImage(layer.canvas, 0, 0)
    return { canvas, x: layer.x, y: layer.y }
  }
  const { mask, bounds } = selectionInfo(doc.selection, doc.width, doc.height)
  if (!bounds) return null
  const canvas = createCanvas(bounds.width, bounds.height)
  const ctx = getContext2d(canvas)
  ctx.drawImage(layer.canvas, layer.x - bounds.x, layer.y - bounds.y)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, -bounds.x, -bounds.y)
  return { canvas, x: bounds.x, y: bounds.y }
}

// The area an edit of the selection (or of the whole design, with no selection) can touch.
export function editArea(doc: EditorDocument): Rect | null {
  const design = { x: 0, y: 0, width: doc.width, height: doc.height }
  return doc.selection ? selectionInfo(doc.selection, doc.width, doc.height).bounds : design
}

// Painters for editor.paint: `ctx` belongs to the layer's canvas, in the layer's own coordinates.

export function clearSelected(ctx: CanvasRenderingContext2D, layer: Layer, doc: EditorDocument): void {
  ctx.globalCompositeOperation = 'destination-out'
  if (doc.selection) ctx.drawImage(selectionInfo(doc.selection, doc.width, doc.height).mask, -layer.x, -layer.y)
  else ctx.fillRect(-layer.x, -layer.y, doc.width, doc.height)
}

export function fillSelected(ctx: CanvasRenderingContext2D, layer: Layer, doc: EditorDocument, color: string): void {
  if (!doc.selection) {
    ctx.fillStyle = color
    ctx.fillRect(-layer.x, -layer.y, doc.width, doc.height)
    return
  }
  const { mask, bounds } = selectionInfo(doc.selection, doc.width, doc.height)
  if (!bounds) return
  // Color shaped like the selection, soft edges included, laid over the layer.
  const paint = createCanvas(bounds.width, bounds.height)
  const pctx = getContext2d(paint)
  pctx.drawImage(mask, -bounds.x, -bounds.y)
  pctx.globalCompositeOperation = 'source-in'
  pctx.fillStyle = color
  pctx.fillRect(0, 0, bounds.width, bounds.height)
  ctx.drawImage(paint, bounds.x - layer.x, bounds.y - layer.y)
}

// True if a canvas has no visible pixels at all.
export function isBlank(canvas: HTMLCanvasElement): boolean {
  const probe = createCanvas(Math.min(canvas.width, 256), Math.min(canvas.height, 256))
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  // A shrunken copy keeps any visible pixel visible enough to notice.
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
  const data = ctx.getImageData(0, 0, probe.width, probe.height).data
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false
  return true
}

// The smallest rectangle around a layer's visible pixels, in design coordinates. Null if blank.
export function contentBounds(layer: Layer): Rect | null {
  const { width, height } = layer.canvas
  const probe = createCanvas(width, height)
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(layer.canvas, 0, 0)
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX + layer.x, y: minY + layer.y, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export interface FillPieces {
  // The area itself, painted over what's there.
  core: Piece
  // A one-pixel rim around it, slipped underneath what's already on the layer, so outlines keep
  // their soft edges and no pale gap is left along them.
  rim: Piece
}

// Works out the fill for a click at `point`: the connected area of similar color in what you see
// (all visible layers), kept inside the selection if there is one. Null if there's nothing to fill.
export function fillArea(doc: EditorDocument, point: { x: number; y: number }, color: string, tolerance: number): FillPieces | null {
  const px = Math.floor(point.x)
  const py = Math.floor(point.y)
  if (px < 0 || py < 0 || px >= doc.width || py >= doc.height) return null
  const flat = flattenDocument(doc)
  const pixels = flat.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, doc.width, doc.height).data
  const region = floodRegion(pixels, doc.width, doc.height, px, py, tolerance)
  if (!region) return null
  const grown = growRegion(region, doc.width, doc.height)
  const { x, y, width, height } = grown.bounds

  // How much of each pixel the selection allows, 0–255; everything when nothing is selected.
  let allowed: Uint8ClampedArray | null = null
  if (doc.selection) {
    const { mask } = selectionInfo(doc.selection, doc.width, doc.height)
    allowed = mask.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, width, height).data
  }

  const { r, g, b } = hexToRgb(color)
  const core = new ImageData(width, height)
  const rim = new ImageData(width, height)
  let any = false
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (y + row) * doc.width + (x + col)
      if (!grown.mask[i]) continue
      const alpha = allowed ? allowed[(row * width + col) * 4 + 3] : 255
      if (alpha === 0) continue
      const target = region.mask[i] ? core : rim
      target.data.set([r, g, b, alpha], (row * width + col) * 4)
      any = true
    }
  }
  if (!any) return null
  const toPiece = (data: ImageData): Piece => {
    const canvas = createCanvas(width, height)
    getContext2d(canvas).putImageData(data, 0, 0)
    return { canvas, x, y }
  }
  return { core: toPiece(core), rim: toPiece(rim) }
}
