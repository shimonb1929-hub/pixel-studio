import { rgbToHex } from './color.ts'
import { createCanvas } from './document.ts'
import type { EditorDocument } from './types.ts'

let sampler: CanvasRenderingContext2D | null = null

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
  sampler.clearRect(0, 0, 1, 1)
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    sampler.globalAlpha = layer.opacity
    sampler.drawImage(layer.canvas, px, py, 1, 1, 0, 0, 1, 1)
  }
  sampler.globalAlpha = 1
  const [r, g, b, a] = sampler.getImageData(0, 0, 1, 1).data
  return a === 0 ? null : rgbToHex({ r, g, b })
}
