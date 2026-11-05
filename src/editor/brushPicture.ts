import { addBrushShape, nextShapeName, type BrushShape } from './brushShapes.ts'
import { drawLayer } from './compose.ts'
import { createCanvas, getContext2d } from './document.ts'
import type { EditorDocument, Layer } from './types.ts'

// Draws the chosen things on their own, cut to just around them, and keeps that as a brush shape.
// Null when nothing shows.
export function brushShapeFrom(doc: EditorDocument, layers: Layer[]): BrushShape | null {
  if (layers.length === 0) return null
  // Big designs are drawn smaller: the brush shape is small anyway.
  const scale = Math.min(1, 1024 / Math.max(doc.width, doc.height))
  const width = Math.max(1, Math.round(doc.width * scale))
  const height = Math.max(1, Math.round(doc.height * scale))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.scale(scale, scale)
  for (const layer of layers) drawLayer(ctx, doc, layer)
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const cut = createCanvas(maxX - minX + 1, maxY - minY + 1)
  getContext2d(cut).drawImage(canvas, -minX, -minY)
  return addBrushShape(cut, nextShapeName())
}
