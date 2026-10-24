import { drawLayer } from './compose.ts'
import { createCanvas } from './document.ts'
import { intersectRect, polygonBounds } from './geometry.ts'
import { paintPage } from './gradient.ts'
import { extractPalette, photoSources, type PaletteColor } from './palette.ts'
import { pixelVersion } from './pixelVersion.ts'
import { measureBackdrop, type Backdrop } from './readable.ts'
import { boxCorners } from './transform.ts'
import type { EditorDocument, TextLayer } from './types.ts'

// The canvas side of the design helpers: small copies of photos for their colors, and the pixels
// behind some words. The math is in palette.ts and readable.ts.

// A small copy is plenty to find a photo's main colors, and takes no time at all.
const SAMPLE_SIDE = 96
const samples = new WeakMap<HTMLCanvasElement, { version: number; data: Uint8ClampedArray }>()

function smallCopy(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const version = pixelVersion(canvas)
  const kept = samples.get(canvas)
  if (kept && kept.version === version) return kept.data
  const scale = Math.min(1, SAMPLE_SIDE / Math.max(canvas.width, canvas.height, 1))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const small = createCanvas(width, height)
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  samples.set(canvas, { version, data })
  return data
}

const palettes = new Map<string, PaletteColor[]>()
const canvasIds = new WeakMap<HTMLCanvasElement, number>()
let nextCanvasId = 1

// The main colors of the picked photo, or of every photo on the design.
export function designPalette(doc: EditorDocument, pickedId?: string): { colors: PaletteColor[]; picked: boolean } {
  const { canvases, picked } = photoSources(doc, pickedId)
  if (canvases.length === 0) return { colors: [], picked }
  const key = canvases
    .map((c) => {
      if (!canvasIds.has(c)) canvasIds.set(c, nextCanvasId++)
      return `${canvasIds.get(c)}:${pixelVersion(c)}`
    })
    .join()
  let colors = palettes.get(key)
  if (!colors) {
    const parts = canvases.map(smallCopy)
    const all = new Uint8ClampedArray(parts.reduce((sum, p) => sum + p.length, 0))
    let at = 0
    for (const part of parts) {
      all.set(part, at)
      at += part.length
    }
    colors = extractPalette(all)
    if (palettes.size > 50) palettes.clear()
    palettes.set(key, colors)
  }
  return { colors, picked }
}

// Behind words, this many pixels across are enough to see what's there.
const BACKDROP_SIDE = 120

// What is behind some words, as it shows on the page: the page and everything under the words,
// at the place of their box. A see-through page counts as white, as it prints.
export function textBackdrop(doc: EditorDocument, layer: TextLayer): Backdrop | null {
  const index = doc.layers.findIndex((l) => l.id === layer.id)
  if (index < 0) return null
  const bounds = polygonBounds(boxCorners(layer.box))
  const rect = bounds && intersectRect(bounds, { x: 0, y: 0, width: doc.width, height: doc.height })
  if (!rect || rect.width < 1 || rect.height < 1) return null
  const scale = Math.min(1, BACKDROP_SIDE / Math.max(rect.width, rect.height))
  const width = Math.max(1, Math.round(rect.width * scale))
  const height = Math.max(1, Math.round(rect.height * scale))
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale)
  paintPage(ctx, doc, doc.width, doc.height)
  for (const below of doc.layers.slice(0, index)) {
    if (!below.visible || below.opacity <= 0) continue
    ctx.globalAlpha = below.opacity
    drawLayer(ctx, doc, below)
  }
  return measureBackdrop(ctx.getImageData(0, 0, width, height).data)
}
