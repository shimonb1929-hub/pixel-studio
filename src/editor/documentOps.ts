import { createCanvas, getContext2d, MAX_DOCUMENT_SIDE } from './document.ts'
import type { Rect } from './geometry.ts'
import { selectionInfo, translateSelection } from './selection.ts'
import type { EditorDocument, Layer } from './types.ts'

// Changes that apply to the whole design at once. Each returns a new design and leaves every
// original canvas untouched, so undo can bring them back.

// Crops to a rectangle (design coordinates). Nothing outside it is thrown away: layers keep
// their pixels, so cropping again bigger, or undoing, brings them back.
export function cropDocument(doc: EditorDocument, rect: Rect): EditorDocument {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const width = Math.max(1, Math.min(MAX_DOCUMENT_SIDE, Math.round(rect.width)))
  const height = Math.max(1, Math.min(MAX_DOCUMENT_SIDE, Math.round(rect.height)))
  let selection = doc.selection && translateSelection(doc.selection, -x, -y)
  if (selection && !selectionInfo(selection, width, height).bounds) selection = null
  return {
    ...doc,
    width,
    height,
    layers: doc.layers.map((layer) => ({ ...layer, x: layer.x - x, y: layer.y - y })),
    selection,
  }
}

// Redraws every layer through a canvas transform, giving each layer a fresh canvas.
function redrawLayers(doc: EditorDocument, place: (layer: Layer) => { width: number; height: number; x: number; y: number; draw: (ctx: CanvasRenderingContext2D) => void }): Layer[] {
  return doc.layers.map((layer) => {
    const placed = place(layer)
    const canvas = createCanvas(Math.max(1, placed.width), Math.max(1, placed.height))
    const ctx = getContext2d(canvas)
    ctx.imageSmoothingQuality = 'high'
    placed.draw(ctx)
    return { ...layer, canvas, x: placed.x, y: placed.y }
  })
}

// Scales the whole design, every layer with it, to a new size in pixels.
export function resizeDocument(doc: EditorDocument, width: number, height: number): EditorDocument {
  const sx = width / doc.width
  const sy = height / doc.height
  const layers = redrawLayers(doc, (layer) => {
    const x = Math.round(layer.x * sx)
    const y = Math.round(layer.y * sy)
    const w = Math.round((layer.x + layer.canvas.width) * sx) - x
    const h = Math.round((layer.y + layer.canvas.height) * sy) - y
    return { width: w, height: h, x, y, draw: (ctx) => ctx.drawImage(layer.canvas, 0, 0, w, h) }
  })
  return { ...doc, width, height, layers, selection: null }
}

// Turns the whole design a quarter turn: 1 is clockwise, -1 counterclockwise.
export function rotateDocument(doc: EditorDocument, direction: 1 | -1): EditorDocument {
  const layers = redrawLayers(doc, (layer) => {
    const { width: w, height: h } = layer.canvas
    if (direction === 1) {
      return {
        width: h,
        height: w,
        x: doc.height - (layer.y + h),
        y: layer.x,
        draw: (ctx) => {
          ctx.setTransform(0, 1, -1, 0, h, 0)
          ctx.drawImage(layer.canvas, 0, 0)
        },
      }
    }
    return {
      width: h,
      height: w,
      x: layer.y,
      y: doc.width - (layer.x + w),
      draw: (ctx) => {
        ctx.setTransform(0, -1, 1, 0, 0, w)
        ctx.drawImage(layer.canvas, 0, 0)
      },
    }
  })
  return { ...doc, width: doc.height, height: doc.width, layers, selection: null }
}

// Mirrors the whole design left-to-right or top-to-bottom.
export function flipDocument(doc: EditorDocument, axis: 'horizontal' | 'vertical'): EditorDocument {
  const layers = redrawLayers(doc, (layer) => {
    const { width: w, height: h } = layer.canvas
    return axis === 'horizontal'
      ? {
          width: w,
          height: h,
          x: doc.width - (layer.x + w),
          y: layer.y,
          draw: (ctx) => {
            ctx.setTransform(-1, 0, 0, 1, w, 0)
            ctx.drawImage(layer.canvas, 0, 0)
          },
        }
      : {
          width: w,
          height: h,
          x: layer.x,
          y: doc.height - (layer.y + h),
          draw: (ctx) => {
            ctx.setTransform(1, 0, 0, -1, 0, h)
            ctx.drawImage(layer.canvas, 0, 0)
          },
        }
  })
  return { ...doc, layers, selection: null }
}

// Memory the new canvases of a whole-design change take, for the undo history.
export function documentBytes(doc: EditorDocument): number {
  return doc.layers.reduce((sum, layer) => sum + layer.canvas.width * layer.canvas.height * 4, 0)
}
