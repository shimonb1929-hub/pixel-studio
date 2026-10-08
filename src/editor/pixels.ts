import { createCanvas, getContext2d } from './document.ts'
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
