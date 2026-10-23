import { createCanvas, getContext2d, MAX_DOCUMENT_SIDE } from './document.ts'
import type { Rect } from './geometry.ts'
import { selectionInfo, translateSelection } from './selection.ts'
import { boxFromRect, normalizeAngle, type TransformBox } from './transform.ts'
import type { EditorDocument, Layer, PixelLayer } from './types.ts'

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
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === 'raster' && !layer.box) return { ...layer, x: layer.x - x, y: layer.y - y }
    return { ...layer, box: { ...layer.box!, cx: layer.box!.cx - x, cy: layer.box!.cy - y } }
  })
  return { ...doc, width, height, layers, selection }
}

// Redraws a plain pixel layer through a canvas transform onto a fresh canvas. Used for quarter
// turns and flips, which move pixels without losing any.
function redraw(
  layer: PixelLayer,
  placed: { width: number; height: number; x: number; y: number; draw: (ctx: CanvasRenderingContext2D) => void },
): PixelLayer {
  const canvas = createCanvas(Math.max(1, placed.width), Math.max(1, placed.height))
  placed.draw(getContext2d(canvas))
  return { ...layer, canvas, x: placed.x, y: placed.y }
}

// A layer with a new box, keeping a shape's outline and text's letters in step with how much it grew.
function withBox(layer: Layer, box: TransformBox, scale = 1): Layer {
  if (layer.kind === 'shape') {
    const outline = layer.outline && { ...layer.outline, width: layer.outline.width * scale }
    return { ...layer, box, outline }
  }
  if (layer.kind === 'text') return { ...layer, box, style: { ...layer.style, size: layer.style.size * scale }, ...(layer.flow ? { flow: { ...layer.flow, height: layer.flow.height * scale } } : {}) }
  return { ...layer, box }
}

// The box a layer is shown in; plain pixel layers get one that matches where they sit.
function boxOf(layer: Layer): TransformBox {
  if (layer.kind === 'raster' && !layer.box) return boxFromRect({ x: layer.x, y: layer.y, width: layer.canvas.width, height: layer.canvas.height })
  return layer.box!
}

// Scales the whole design, every layer with it, to a new size in pixels. Layers only get a new
// box, so every picture keeps its original pixels and can be made big again without blur.
export function resizeDocument(doc: EditorDocument, width: number, height: number): EditorDocument {
  const sx = width / doc.width
  const sy = height / doc.height
  const even = Math.sqrt(sx * sy)
  const layers = doc.layers.map((layer) => {
    const box = boxOf(layer)
    // A turned box can't be squashed unevenly without slanting it, so it keeps its shape.
    const straight = Math.abs(Math.sin(box.rotation)) < 1e-9
    const sideways = Math.abs(Math.cos(box.rotation)) < 1e-9
    // Text grows evenly, so its letters keep their shape.
    const [fw, fh] = layer.kind === 'text' ? [even, even] : straight ? [sx, sy] : sideways ? [sy, sx] : [even, even]
    return withBox(layer, { ...box, cx: box.cx * sx, cy: box.cy * sy, width: box.width * fw, height: box.height * fh }, even)
  })
  // Margins and column gaps grow with the design, so the layout keeps its look.
  const layout = doc.layout && { ...doc.layout, margin: Math.round(doc.layout.margin * even), gap: Math.round(doc.layout.gap * even) }
  return { ...doc, width, height, layers, selection: null, ...(layout ? { layout } : {}) }
}

// Turns the whole design a quarter turn: 1 is clockwise, -1 counterclockwise.
export function rotateDocument(doc: EditorDocument, direction: 1 | -1): EditorDocument {
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === 'raster' && !layer.box) {
      const { width: w, height: h } = layer.canvas
      return direction === 1
        ? redraw(layer, {
            width: h,
            height: w,
            x: doc.height - (layer.y + h),
            y: layer.x,
            draw: (ctx) => {
              ctx.setTransform(0, 1, -1, 0, h, 0)
              ctx.drawImage(layer.canvas, 0, 0)
            },
          })
        : redraw(layer, {
            width: h,
            height: w,
            x: layer.y,
            y: doc.width - (layer.x + w),
            draw: (ctx) => {
              ctx.setTransform(0, -1, 1, 0, 0, w)
              ctx.drawImage(layer.canvas, 0, 0)
            },
          })
    }
    const box = layer.box!
    const center = direction === 1 ? { cx: doc.height - box.cy, cy: box.cx } : { cx: box.cy, cy: doc.width - box.cx }
    return withBox(layer, { ...box, ...center, rotation: normalizeAngle(box.rotation + (direction * Math.PI) / 2) })
  })
  return { ...doc, width: doc.height, height: doc.width, layers, selection: null }
}

// Mirrors the whole design left-to-right or top-to-bottom.
export function flipDocument(doc: EditorDocument, axis: 'horizontal' | 'vertical'): EditorDocument {
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === 'raster' && !layer.box) {
      const { width: w, height: h } = layer.canvas
      return axis === 'horizontal'
        ? redraw(layer, {
            width: w,
            height: h,
            x: doc.width - (layer.x + w),
            y: layer.y,
            draw: (ctx) => {
              ctx.setTransform(-1, 0, 0, 1, w, 0)
              ctx.drawImage(layer.canvas, 0, 0)
            },
          })
        : redraw(layer, {
            width: w,
            height: h,
            x: layer.x,
            y: doc.height - (layer.y + h),
            draw: (ctx) => {
              ctx.setTransform(1, 0, 0, -1, 0, h)
              ctx.drawImage(layer.canvas, 0, 0)
            },
          })
    }
    const box = layer.box!
    const mirrored =
      axis === 'horizontal'
        ? { ...box, cx: doc.width - box.cx, width: -box.width, rotation: normalizeAngle(-box.rotation) }
        : { ...box, cy: doc.height - box.cy, height: -box.height, rotation: normalizeAngle(-box.rotation) }
    return withBox(layer, mirrored)
  })
  return { ...doc, layers, selection: null }
}

// Memory the new canvases of a whole-design change take, for the undo history. Only plain pixel
// layers get new canvases; the rest just get a new box.
export function documentBytes(doc: EditorDocument): number {
  return doc.layers.reduce((sum, layer) => (layer.kind === 'raster' && !layer.box ? sum + layer.canvas.width * layer.canvas.height * 4 : sum), 0)
}
