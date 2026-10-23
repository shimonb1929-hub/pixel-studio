import { textInBox } from '../text/textLayer.ts'
import { createCanvas, getContext2d } from './document.ts'
import { cachedContentBounds } from './pixels.ts'
import { polygonBounds, unionRect } from './geometry.ts'
import { applyAffine, boxCorners, boxFromRect, boxMatrix, normalizeAngle, type TransformBox } from './transform.ts'
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

// The upright frame around several things, or null when none of them has anything on it.
export function frameOf(layers: Layer[]): TransformBox | null {
  const rects = layers
    .map((layer) => arrangeBox(layer))
    .filter((box): box is TransformBox => box !== null)
    .map((box) => polygonBounds(boxCorners(box))!)
  if (rects.length === 0) return null
  return boxFromRect(rects.reduce((all, rect) => unionRect(all, rect)))
}

// Where a box goes when the frame around several things changes from `from` to `to`: it moves,
// grows evenly, turns and flips along with the frame.
export function boxInFrame(box: TransformBox, from: TransformBox, to: TransformBox): TransformBox {
  const scale = Math.abs(to.height) / (Math.abs(from.height) || 1)
  const flipX = Math.sign(to.width) !== Math.sign(from.width)
  const flipY = Math.sign(to.height) !== Math.sign(from.height)
  // The box's middle and turn, seen from the frame (unturned).
  const dx = box.cx - from.cx
  const dy = box.cy - from.cy
  const cos = Math.cos(-from.rotation)
  const sin = Math.sin(-from.rotation)
  let x = (dx * cos - dy * sin) * scale
  let y = (dx * sin + dy * cos) * scale
  let turn = box.rotation - from.rotation
  let width = box.width * scale
  let height = box.height * scale
  if (flipX) {
    x = -x
    turn = -turn
    width = -width
  }
  if (flipY) {
    y = -y
    turn = -turn
    height = -height
  }
  const c = Math.cos(to.rotation)
  const s = Math.sin(to.rotation)
  return { cx: to.cx + x * c - y * s, cy: to.cy + x * s + y * c, width, height, rotation: normalizeAngle(turn + to.rotation) }
}

// A layer placed along with its frame. A move by whole pixels just slides it, so pictures stay crisp.
export function layerInFrame(layer: Layer, from: TransformBox, to: TransformBox): Layer {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const same = Math.abs(to.width - from.width) < 1e-9 && Math.abs(to.height - from.height) < 1e-9 && Math.abs(to.rotation - from.rotation) < 1e-9
  if (same && Number.isInteger(dx) && Number.isInteger(dy)) return slideLayer(layer, dx, dy)
  const box = arrangeBox(layer)
  return box ? placeInBox(layer, boxInFrame(box, from, to)) : layer
}

// How a layer looks while its frame is being dragged; nothing is copied.
export function previewInFrame(layer: Layer, from: TransformBox, to: TransformBox): Layer {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const same = Math.abs(to.width - from.width) < 1e-9 && Math.abs(to.height - from.height) < 1e-9 && Math.abs(to.rotation - from.rotation) < 1e-9
  if (same && Number.isInteger(dx) && Number.isInteger(dy)) return slideLayer(layer, dx, dy)
  const box = arrangeBox(layer)
  return box ? previewInBox(layer, boxInFrame(box, from, to)) : layer
}

// A size, place or angle typed in for something picked, in pixels and degrees. Left out means unchanged.
export interface BoxChange {
  x?: number
  y?: number
  width?: number
  height?: number
  angle?: number
}

// The box after a typed change. The place is its top-left corner before turning, and stays put when
// only the size changes. With `keepShape`, typing one side changes the other to match.
export function changeBox(box: TransformBox, change: BoxChange, keepShape: boolean): TransformBox {
  const width = Math.abs(box.width)
  const height = Math.abs(box.height)
  let nextWidth = change.width ?? width
  let nextHeight = change.height ?? height
  if (keepShape && width > 0 && height > 0) {
    if (change.width !== undefined && change.height === undefined) nextHeight = (nextWidth * height) / width
    if (change.height !== undefined && change.width === undefined) nextWidth = (nextHeight * width) / height
  }
  nextWidth = Math.max(1, nextWidth)
  nextHeight = Math.max(1, nextHeight)
  const left = change.x ?? box.cx - width / 2
  const top = change.y ?? box.cy - height / 2
  return {
    cx: left + nextWidth / 2,
    cy: top + nextHeight / 2,
    // Something flipped stays flipped.
    width: box.width < 0 ? -nextWidth : nextWidth,
    height: box.height < 0 ? -nextHeight : nextHeight,
    rotation: change.angle === undefined ? box.rotation : (change.angle * Math.PI) / 180,
  }
}
