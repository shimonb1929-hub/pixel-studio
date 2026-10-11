import { textInBox } from '../text/textLayer.ts'
import { createCanvas, getContext2d } from './document.ts'
import { cachedContentBounds } from './pixels.ts'
import { applyAffine, boxFromRect, boxMatrix, type TransformBox } from './transform.ts'
import type { Layer, PixelLayer } from './types.ts'

// Arranging objects: where their handles go, and placing them in a new box. Moving, resizing and
// turning only ever change the box, so pictures never lose quality however often they change.

// The box the handles show for a layer: around what's drawn on a plain pixel layer, or the box a
// resized picture or a shape sits in. Null when there's nothing on the layer.
export function arrangeBox(layer: Layer): TransformBox | null {
  if (layer.kind !== 'raster' || layer.box) return layer.box
  const bounds = cachedContentBounds(layer)
  return bounds && boxFromRect(bounds)
}

// For a plain pixel layer, the box for its whole canvas that matches `box` around what's drawn.
function wholeCanvasBox(layer: PixelLayer, box: TransformBox): TransformBox {
  const content = cachedContentBounds(layer)!
  const kx = box.width / content.width
  const ky = box.height / content.height
  // Where the canvas's middle lands, measured from the drawn part's top-left corner.
  const m = boxMatrix(box, content.width, content.height)
  const middle = applyAffine(m, { x: layer.x + layer.canvas.width / 2 - content.x, y: layer.y + layer.canvas.height / 2 - content.y })
  return { cx: middle.x, cy: middle.y, width: layer.canvas.width * kx, height: layer.canvas.height * ky, rotation: box.rotation }
}

// True if the box only slid by whole pixels from where the drawing sits, so no box is needed.
function onlySlid(layer: PixelLayer, box: TransformBox): { dx: number; dy: number } | null {
  const content = cachedContentBounds(layer)
  if (!content || box.rotation !== 0 || box.width !== content.width || box.height !== content.height) return null
  const dx = box.cx - (content.x + content.width / 2)
  const dy = box.cy - (content.y + content.height / 2)
  return Number.isInteger(dx) && Number.isInteger(dy) ? { dx, dy } : null
}

// How the layer looks in a new box, for showing while handles are dragged. Nothing is copied.
export function previewInBox(layer: Layer, box: TransformBox): Layer {
  if (layer.kind === 'text') return textInBox(layer, box)
  if (layer.kind === 'shape' || layer.box) return { ...layer, box }
  const slid = onlySlid(layer, box)
  if (slid) return { ...layer, x: layer.x + slid.dx, y: layer.y + slid.dy }
  return { ...layer, box: wholeCanvasBox(layer, box) }
}

// The layer placed in a new box for good. A plain pixel layer is first trimmed to what's drawn on
// it, so from then on its handles hug the drawing.
export function placeInBox(layer: Layer, box: TransformBox): Layer {
  if (layer.kind === 'text') return textInBox(layer, box)
  if (layer.kind === 'shape' || layer.box) return { ...layer, box }
  const slid = onlySlid(layer, box)
  if (slid) return { ...layer, x: layer.x + slid.dx, y: layer.y + slid.dy }
  const content = cachedContentBounds(layer)
  if (!content) return layer
  const canvas = createCanvas(content.width, content.height)
  getContext2d(canvas).drawImage(layer.canvas, layer.x - content.x, layer.y - content.y)
  return { ...layer, canvas, x: content.x, y: content.y, box }
}

// The layer slid by whole pixels.
export function slideLayer(layer: Layer, dx: number, dy: number): Layer {
  if (layer.kind === 'raster' && !layer.box) return { ...layer, x: layer.x + dx, y: layer.y + dy }
  return { ...layer, box: { ...layer.box!, cx: layer.box!.cx + dx, cy: layer.box!.cy + dy } }
}
