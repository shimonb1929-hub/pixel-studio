import type { EditorDocument, Layer } from './types.ts'

// Browsers refuse or silently fail on canvases much larger than this.
export const MAX_DOCUMENT_SIDE = 10000

export type BackgroundFill = 'white' | 'black' | 'transparent'

const BACKGROUND_COLORS: Record<Exclude<BackgroundFill, 'transparent'>, string> = {
  white: '#ffffff',
  black: '#000000',
}

let nextId = 1

export function createId(prefix: string): string {
  return `${prefix}-${nextId++}`
}

export function validateDocumentSize(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return 'Width and height must be whole numbers.'
  }
  if (width < 1 || height < 1) return 'Width and height must be at least 1 pixel.'
  if (width > MAX_DOCUMENT_SIDE || height > MAX_DOCUMENT_SIDE) {
    return `Width and height can be at most ${MAX_DOCUMENT_SIDE.toLocaleString('en-US')} pixels.`
  }
  return null
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not create a drawing surface that large.')
  return ctx
}

export function createLayer(name: string, width: number, height: number): Layer {
  return {
    id: createId('layer'),
    kind: 'raster',
    name,
    canvas: createCanvas(width, height),
    visible: true,
    opacity: 1,
  }
}

export function duplicateLayer(layer: Layer): Layer {
  const copy = createLayer(`${layer.name} copy`, layer.canvas.width, layer.canvas.height)
  getContext2d(copy.canvas).drawImage(layer.canvas, 0, 0)
  return { ...copy, visible: layer.visible, opacity: layer.opacity }
}

// Every design starts like a sheet of paper with a clear sheet on top. You draw on the clear
// sheet, so the eraser rubs out your drawing and never the paper or the picture underneath.
function withDrawingLayer(name: string, base: Layer, width: number, height: number): EditorDocument {
  const drawing = createLayer('Layer 1', width, height)
  return { id: createId('doc'), name, width, height, layers: [base, drawing], activeLayerId: drawing.id }
}

export function createBlankDocument(
  name: string,
  width: number,
  height: number,
  background: BackgroundFill,
): EditorDocument {
  const layer = createLayer('Background', width, height)
  if (background !== 'transparent') {
    const ctx = getContext2d(layer.canvas)
    ctx.fillStyle = BACKGROUND_COLORS[background]
    ctx.fillRect(0, 0, width, height)
  }
  return withDrawingLayer(name, layer, width, height)
}

export function createDocumentFromImage(
  name: string,
  image: CanvasImageSource,
  width: number,
  height: number,
): EditorDocument {
  const layer = createLayer('Picture', width, height)
  getContext2d(layer.canvas).drawImage(image, 0, 0, width, height)
  return withDrawingLayer(name, layer, width, height)
}

// Merges all visible layers into a single canvas, optionally over a solid color.
export function flattenDocument(doc: EditorDocument, background?: string): HTMLCanvasElement {
  const canvas = createCanvas(doc.width, doc.height)
  const ctx = getContext2d(canvas)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, doc.width, doc.height)
  }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(layer.canvas, 0, 0)
  }
  return canvas
}
