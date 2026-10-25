import { combinePerspective, facing, frontSize, invertPerspective, scaleMove, squareToQuad, warpPixels, type Perspective, type Quad } from './corners.ts'
import { createCanvas, getContext2d } from './document.ts'
import { polygonBounds } from './geometry.ts'
import { layerFrame } from './objects.ts'
import { applyAffine, invertAffine, type TransformBox } from './transform.ts'
import type { LayerHide, PixelLayer, Point } from './types.ts'

// Moving a photo's corners, on real photos: "Fit to a place" moves the photo's own corners anywhere
// (onto a sign, a screen, the side of a box), and "Face front" takes the four corners of something
// photographed at a slant and makes it flat and square. Both make new pixels from the photo's own,
// once, at the photo's full detail. The math is in corners.ts.

export type CornerMode = 'fit' | 'front'

// The biggest result, in pixels (about a 36-megapixel photo).
const MAX_PIXELS = 36_000_000
const MAX_SIDE = 12_000

const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

// Where the photo's own corners are on the design, starting with its top-left pixel (so a flipped
// photo starts on the right).
export function photoCorners(layer: PixelLayer & { box: TransformBox }): Quad {
  const frame = layerFrame(layer)
  return UNIT.map((p) => applyAffine(frame, p)) as Quad
}

// Where the dots start for Face front: a little inside the photo, in the order they are seen (top
// left first), so it's clear they should go onto the corners of the slanted thing.
export function frontStart(layer: PixelLayer & { box: TransformBox }): Quad {
  const frame = layerFrame({ ...layer, box: { ...layer.box, width: Math.abs(layer.box.width), height: Math.abs(layer.box.height) } })
  const inset = 0.12
  return UNIT.map((p) => applyAffine(frame, { x: inset + p.x * (1 - 2 * inset), y: inset + p.y * (1 - 2 * inset) })) as Quad
}

function fitSize(width: number, height: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)), MAX_SIDE / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}

const pixelCache = new WeakMap<HTMLCanvasElement, ImageData>()

function readPixels(canvas: HTMLCanvasElement): ImageData {
  let pixels = pixelCache.get(canvas)
  if (!pixels) {
    pixels = getContext2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
    pixelCache.set(canvas, pixels)
  }
  return pixels
}

// New pixels (width × height) from `source`, where `toOldUnit` takes a point of the new picture
// (0..1 across and down) to the point of the photo's frame it shows. `inside` is a point of the
// new picture (0..1) that surely shows the photo.
function warpCanvas(source: HTMLCanvasElement, toOldUnit: Perspective, inside: Point, width: number, height: number, from?: LayerHide['rect']): HTMLCanvasElement {
  const pixels = readPixels(source)
  const toSource = from
    ? scaleMove(source.width / from.width, source.height / from.height, (-from.x * source.width) / from.width, (-from.y * source.height) / from.height)
    : scaleMove(source.width, source.height, 0, 0)
  const map = facing(combinePerspective(toSource, combinePerspective(toOldUnit, scaleMove(1 / width, 1 / height, 0, 0))), { x: inside.x * width, y: inside.y * height })
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  const image = ctx.createImageData(width, height)
  image.data.set(warpPixels(pixels, map, width, height))
  ctx.putImageData(image, 0, 0)
  return canvas
}

// The photo made again from its own pixels: `toOldUnit` takes the new frame (0..1) to the old one.
// Faded parts are moved the same way, so they stay where they were on the photo.
function remade(layer: PixelLayer & { box: TransformBox }, source: HTMLCanvasElement, toOldUnit: Perspective, inside: Point, width: number, height: number, box: TransformBox): PixelLayer {
  const canvas = warpCanvas(source, toOldUnit, inside, width, height)
  const hide = layer.hide
    ? { canvas: warpCanvas(layer.hide.canvas, toOldUnit, inside, layer.hide.canvas.width, layer.hide.canvas.height, layer.hide.rect), rect: { x: 0, y: 0, width: 1, height: 1 } }
    : layer.hide
  return {
    ...layer,
    canvas,
    hide,
    x: Math.round(box.cx - box.width / 2),
    y: Math.round(box.cy - box.height / 2),
    box,
  }
}

// "Fit to a place": the photo with its corners at `quad` (in the order of photoCorners). `source`
// can be a smaller copy of the photo, for quick previews.
export function fitToCorners(layer: PixelLayer & { box: TransformBox }, quad: Quad, source: HTMLCanvasElement = layer.canvas): PixelLayer {
  const bounds = polygonBounds(quad)!
  const side = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
  // As many pixels for each design pixel as the photo has now, on average, so it keeps its detail.
  const across = (side(quad[0], quad[1]) + side(quad[3], quad[2])) / 2
  const down = (side(quad[0], quad[3]) + side(quad[1], quad[2])) / 2
  const density = Math.max(source.width / Math.max(across, 1), source.height / Math.max(down, 1))
  const size = fitSize(bounds.width * density, bounds.height * density)
  const box: TransformBox = { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, width: bounds.width, height: bounds.height, rotation: 0 }
  // squareToQuad(quad) takes the photo's frame to the design, so turned around it takes the new
  // picture's place on the design back to the photo.
  const toOldUnit = combinePerspective(invertPerspective(squareToQuad(quad)), scaleMove(bounds.width, bounds.height, bounds.x, bounds.y))
  // The middle of the corners is always on the photo.
  const middle = { x: quad.reduce((sum, p) => sum + p.x, 0) / 4, y: quad.reduce((sum, p) => sum + p.y, 0) / 4 }
  const inside = { x: (middle.x - bounds.x) / bounds.width, y: (middle.y - bounds.y) / bounds.height }
  return remade(layer, source, toOldUnit, inside, size.width, size.height, box)
}

// "Face front": the part of the photo inside `quad` (on the design, top left first), made flat and
// square, standing upright where it was.
export function faceFront(layer: PixelLayer & { box: TransformBox }, quad: Quad, source: HTMLCanvasElement = layer.canvas): PixelLayer {
  const toFrame = invertAffine(layerFrame(layer))
  const inFrame = quad.map((p) => applyAffine(toFrame, p)) as Quad
  // Its size in the photo's own pixels, so it keeps all the detail it has.
  const inPixels = frontSize(inFrame.map((p) => ({ x: p.x * source.width, y: p.y * source.height })) as Quad)
  const size = fitSize(inPixels.width, inPixels.height)
  const onDesign = frontSize(quad)
  const width = onDesign.width
  const height = (width * size.height) / size.width
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4
  return remade(layer, source, squareToQuad(inFrame), { x: 0.5, y: 0.5 }, size.width, size.height, { cx, cy, width, height, rotation: 0 })
}
