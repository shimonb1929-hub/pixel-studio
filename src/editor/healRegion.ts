import { createCanvas, getContext2d } from './document.ts'
import { distanceToShape } from './distance.ts'
import { healPixels, MARK_GROWTH } from './heal.ts'

// Fills in what `marks` covers (anything not see-through in it), on a layer's canvas, using the
// picture within `area` (design pixels). Marks are grown a little, so the soft edge of a spot goes too.
export function healRegion(
  ctx: CanvasRenderingContext2D,
  layer: { x: number; y: number; canvas: HTMLCanvasElement },
  area: { x: number; y: number; width: number; height: number },
  marks: { canvas: HTMLCanvasElement; x: number; y: number },
): void {
  const x = Math.max(0, Math.floor(area.x - layer.x))
  const y = Math.max(0, Math.floor(area.y - layer.y))
  const width = Math.min(layer.canvas.width, Math.ceil(area.x + area.width - layer.x)) - x
  const height = Math.min(layer.canvas.height, Math.ceil(area.y + area.height - layer.y)) - y
  if (width <= 0 || height <= 0) return
  const markCanvas = createCanvas(width, height)
  const markCtx = markCanvas.getContext('2d', { willReadFrequently: true }) ?? getContext2d(markCanvas)
  markCtx.drawImage(marks.canvas, marks.x - layer.x - x, marks.y - layer.y - y)
  const markAlpha = markCtx.getImageData(0, 0, width, height).data
  const marked = new Uint8Array(width * height)
  for (let i = 0; i < marked.length; i++) marked[i] = markAlpha[i * 4 + 3] > 0 ? 1 : 0
  const distance = distanceToShape(marked, width, height)
  const hole = new Uint8Array(width * height)
  for (let i = 0; i < hole.length; i++) hole[i] = distance[i] <= MARK_GROWTH ? 1 : 0
  const image = ctx.getImageData(x, y, width, height)
  healPixels(image.data, width, height, hole)
  ctx.putImageData(image, x, y)
}
