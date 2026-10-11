import { rgbToHex } from './color.ts'
import { adjustedLayer } from './compose.ts'
import { createCanvas } from './document.ts'
import { drawLayerContent } from './objects.ts'
import { applyAffine, boxMatrix, invertAffine } from './transform.ts'
import type { EditorDocument } from './types.ts'

let sampler: CanvasRenderingContext2D | null = null

// Copies pixel lx, ly of `canvas` onto the sampler, if the canvas has one there.
function samplePixel(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, lx: number, ly: number) {
  if (lx < 0 || ly < 0 || lx >= canvas.width || ly >= canvas.height) return
  ctx.drawImage(canvas, lx, ly, 1, 1, 0, 0, 1, 1)
}

// The color you see at a point of the design, with all visible layers combined.
// Null outside the design or where everything is see-through.
export function sampleColor(doc: EditorDocument, x: number, y: number): string | null {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= doc.width || py >= doc.height) return null
  if (!sampler) {
    sampler = createCanvas(1, 1).getContext('2d', { willReadFrequently: true })
    if (!sampler) return null
    sampler.imageSmoothingEnabled = false
  }
  const ctx = sampler
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, 1, 1)
  if (doc.background) {
    ctx.globalAlpha = 1
    ctx.fillStyle = doc.background
    ctx.fillRect(0, 0, 1, 1)
  }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    // Only the one pixel is read from each layer, so big layers stay quick to sample.
    const adjusted = adjustedLayer(doc, layer)
    if (adjusted) {
      samplePixel(ctx, adjusted.canvas, px - adjusted.x, py - adjusted.y)
    } else if (layer.kind !== 'raster') {
      ctx.save()
      ctx.translate(-px, -py)
      drawLayerContent(ctx, layer)
      ctx.restore()
    } else if (layer.box) {
      const local = applyAffine(invertAffine(boxMatrix(layer.box, layer.canvas.width, layer.canvas.height)), { x: px + 0.5, y: py + 0.5 })
      samplePixel(ctx, layer.canvas, Math.floor(local.x), Math.floor(local.y))
    } else {
      samplePixel(ctx, layer.canvas, px - layer.x, py - layer.y)
    }
  }
  ctx.globalAlpha = 1
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a === 0 ? null : rgbToHex({ r, g, b })
}
