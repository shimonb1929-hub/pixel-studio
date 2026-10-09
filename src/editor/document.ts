import { containsRect, snapRect, unionRect, type Rect } from './geometry.ts'
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

// Designs are kept in the browser between visits, so their ids must never repeat.
export function createDesignId(): string {
  // randomUUID only exists on secure (https or localhost) pages.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
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

// Browsers can't make canvases much bigger than this on a side.
export const MAX_LAYER_SIDE = 16000

export function layerFromCanvas(name: string, canvas: HTMLCanvasElement, x = 0, y = 0): Layer {
  return { id: createId('layer'), kind: 'raster', name, canvas, x, y, visible: true, opacity: 1 }
}

export function createLayer(name: string, width: number, height: number): Layer {
  return layerFromCanvas(name, createCanvas(width, height))
}

export function duplicateLayer(layer: Layer): Layer {
  const canvas = createCanvas(layer.canvas.width, layer.canvas.height)
  getContext2d(canvas).drawImage(layer.canvas, 0, 0)
  return { ...layerFromCanvas(`${layer.name} copy`, canvas, layer.x, layer.y), visible: layer.visible, opacity: layer.opacity }
}

// The area a layer's pixels cover, in design coordinates.
export function layerRect(layer: Layer): Rect {
  return { x: layer.x, y: layer.y, width: layer.canvas.width, height: layer.canvas.height }
}

// Returns a layer whose canvas covers the given area, growing a copy of it if needed.
// The original layer is left untouched, so undo can put it back.
export function coverRect(layer: Layer, rect: Rect): Layer {
  const current = layerRect(layer)
  if (containsRect(current, rect)) return layer
  let target = snapRect(unionRect(current, rect))
  // A layer dragged very far away would need a canvas too big for the browser; keep the area asked for.
  if (target.width > MAX_LAYER_SIDE || target.height > MAX_LAYER_SIDE) target = snapRect(rect)
  const canvas = createCanvas(target.width, target.height)
  getContext2d(canvas).drawImage(layer.canvas, layer.x - target.x, layer.y - target.y)
  return { ...layer, canvas, x: target.x, y: target.y }
}

// Every design starts like a sheet of paper with a clear sheet on top. You draw on the clear
// sheet, so the eraser rubs out your drawing and never the paper or the picture underneath.
function withDrawingLayer(name: string, base: Layer, width: number, height: number): EditorDocument {
  const drawing = createLayer('Layer 1', width, height)
  return { id: createDesignId(), name, width, height, layers: [base, drawing], activeLayerId: drawing.id, selection: null }
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
    ctx.drawImage(layer.canvas, layer.x, layer.y)
  }
  return canvas
}
