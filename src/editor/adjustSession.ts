import { adjustColors, adjustmentReach, adjustPixels, blurSigma, changesColors, isNeutral, NO_ADJUSTMENTS, sharpenAmount, sharpenSigma, sharpenWith, type Adjustments } from './adjust.ts'
import { createCanvas, getContext2d, layerRect } from './document.ts'
import { intersectRect, unionRect, type Rect } from './geometry.ts'
import type { RenderPart } from './render.ts'
import { selectionInfo } from './selection.ts'
import type { EditorDocument, Layer } from './types.ts'

// Strong blur is worked out on a smaller copy and scaled back up: a blurred picture has no fine
// detail to lose, and it's many times quicker. This much blur (in pixels) is the most done at full
// detail; quick previews go smaller sooner.
const APPLY_BLUR_DETAIL = 2.5
const PREVIEW_BLUR_DETAIL = 1.2

// Previews stay quick by working on at most this many pixels.
const MAX_PREVIEW_PIXELS = 1_200_000

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by }
}

function longSide(doc: EditorDocument): number {
  return Math.max(doc.width, doc.height)
}

// The part of the design that changes, in design pixels: the selected part, or the whole layer
// plus room for a blur to spread into (inside the design). Null when nothing can change.
export function adjustArea(doc: EditorDocument, layer: Layer, a: Adjustments): Rect | null {
  const reach = adjustmentReach(a, longSide(doc))
  const own = layerRect(layer)
  const design = { x: 0, y: 0, width: doc.width, height: doc.height }
  if (doc.selection) {
    const bounds = selectionInfo(doc.selection, doc.width, doc.height).bounds
    return bounds && intersectRect(bounds, grow(own, reach))
  }
  const spread = reach > 0 ? intersectRect(grow(own, reach), design) : null
  return spread ? unionRect(own, spread) : own
}

// The pixels an adjustment of `area` looks at. A blur near the edge of a photo repeats the edge
// rather than pulling in see-through pixels from beyond it.
function readArea(doc: EditorDocument, layer: Layer, area: Rect, a: Adjustments): Rect {
  const reach = adjustmentReach(a, longSide(doc))
  const limits = unionRect(layerRect(layer), { x: 0, y: 0, width: doc.width, height: doc.height })
  return intersectRect(grow(area, reach), limits) ?? area
}

// `read` (design coordinates) copied from `image`, which shows `rect` of the design, at `scale`.
function capture(image: HTMLCanvasElement, rect: Rect, read: Rect, scale: number): HTMLCanvasElement {
  const canvas = createCanvas(Math.max(1, Math.round(read.width * scale)), Math.max(1, Math.round(read.height * scale)))
  const sx = canvas.width / read.width
  const sy = canvas.height / read.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform((sx * rect.width) / image.width, 0, 0, (sy * rect.height) / image.height, (rect.x - read.x) * sx, (rect.y - read.y) * sy)
  ctx.drawImage(image, 0, 0)
  return canvas
}

// Adjusts a captured canvas in place. `size` is the design's longer side in the design's pixels.
function process(canvas: HTMLCanvasElement, read: Rect, a: Adjustments, size: number): void {
  if (isNeutral(a)) return
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  adjustPixels(image.data, canvas.width, canvas.height, a, size * Math.min(canvas.width / read.width, canvas.height / read.height))
  ctx.putImageData(image, 0, 0)
}

// The adjusted pixels of `area`, at `scale` (1 for full detail). With a selection, only the
// selected part changes, soft edges included; the rest of `area` keeps the original pixels.
export function renderAdjusted(
  doc: EditorDocument,
  layer: Layer,
  a: Adjustments,
  area: Rect,
  scale: number,
  blurDetail = APPLY_BLUR_DETAIL,
): HTMLCanvasElement {
  const read = readArea(doc, layer, area, a)
  const size = longSide(doc)
  const blur = blurSigma(a.blur, size * scale)
  const sharpen = a.sharpen > 0
  // Sharpening comes after the blur and before the colors, so with it the steps are done apart.
  const firstStep = sharpen ? { ...NO_ADJUSTMENTS, blur: a.blur } : a
  let work: HTMLCanvasElement
  if (blur > blurDetail) {
    const small = capture(layer.canvas, layerRect(layer), read, (scale * blurDetail) / blur)
    process(small, read, firstStep, size)
    // Sharpening needs every detail, so it works on the blurred picture at full size.
    work = sharpen ? capture(small, read, read, scale) : small
  } else {
    work = capture(layer.canvas, layerRect(layer), read, scale)
    process(work, read, firstStep, size)
  }
  if (sharpen) {
    // A soft copy, made by shrinking the picture and enlarging it again; pushing every pixel away
    // from it makes edges crisper. Letting the canvas do the shrinking is far quicker than blurring.
    const shrink = 1 + 2 * sharpenSigma(size * (work.width / read.width))
    const soft = capture(capture(work, read, read, work.width / read.width / shrink), read, read, work.width / read.width)
    const softPixels = soft.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, soft.width, soft.height).data
    const ctx = work.getContext('2d', { willReadFrequently: true })!
    const image = ctx.getImageData(0, 0, work.width, work.height)
    if (softPixels.length === image.data.length) sharpenWith(image.data, softPixels, sharpenAmount(a))
    if (changesColors(a)) adjustColors(image.data, a)
    ctx.putImageData(image, 0, 0)
  }

  const out = createCanvas(Math.max(1, Math.round(area.width * scale)), Math.max(1, Math.round(area.height * scale)))
  const ox = out.width / area.width
  const oy = out.height / area.height
  const octx = getContext2d(out)
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(work, (read.x - area.x) * ox, (read.y - area.y) * oy, read.width * ox, read.height * oy)
  if (!doc.selection) return out

  // Selected parts get the new pixels, the rest keeps the old ones, and soft edges blend the two.
  const mask = createCanvas(out.width, out.height)
  const mctx = getContext2d(mask)
  mctx.setTransform(ox, 0, 0, oy, -area.x * ox, -area.y * oy)
  mctx.drawImage(selectionInfo(doc.selection, doc.width, doc.height).mask, 0, 0)
  octx.globalCompositeOperation = 'destination-in'
  octx.drawImage(mask, 0, 0)

  const blended = createCanvas(out.width, out.height)
  const bctx = getContext2d(blended)
  bctx.imageSmoothingQuality = 'high'
  bctx.setTransform(ox, 0, 0, oy, (layer.x - area.x) * ox, (layer.y - area.y) * oy)
  bctx.drawImage(layer.canvas, 0, 0)
  bctx.setTransform(1, 0, 0, 1, 0, 0)
  bctx.globalCompositeOperation = 'destination-out'
  bctx.drawImage(mask, 0, 0)
  // Adding the two halves gives old × (1 − selected) + new × selected.
  bctx.globalCompositeOperation = 'lighter'
  bctx.drawImage(out, 0, 0)
  return blended
}

// For editor.paint: replaces `area` of the layer with its adjusted pixels, at full detail.
export function paintAdjusted(ctx: CanvasRenderingContext2D, layer: Layer, doc: EditorDocument, a: Adjustments, area: Rect): void {
  const adjusted = renderAdjusted(doc, layer, a, area, 1)
  ctx.clearRect(area.x - layer.x, area.y - layer.y, area.width, area.height)
  ctx.drawImage(adjusted, area.x - layer.x, area.y - layer.y)
}

// How much detail a preview needs: no more than the screen shows (`screenScale` is screen pixels
// per design pixel), and never so much that it can't keep up with a slider.
export function previewScale(area: Rect, screenScale: number): number {
  return Math.min(1, screenScale, Math.sqrt(MAX_PREVIEW_PIXELS / (area.width * area.height)))
}

// What to draw in place of the layer while adjustments are being tried out.
export function previewParts(doc: EditorDocument, layer: Layer, a: Adjustments, screenScale: number): RenderPart[] {
  const area = adjustArea(doc, layer, a)
  if (!area) return [layer]
  const scale = previewScale(area, screenScale)
  const adjusted = renderAdjusted(doc, layer, a, area, scale, PREVIEW_BLUR_DETAIL)
  const place = (canvas: HTMLCanvasElement, rect: Rect): RenderPart =>
    scale === 1
      ? { canvas, x: rect.x, y: rect.y }
      : { canvas, x: rect.x, y: rect.y, transform: { a: rect.width / canvas.width, b: 0, c: 0, d: rect.height / canvas.height, e: rect.x, f: rect.y } }
  const own = layerRect(layer)
  // Without a selection the adjusted area covers the whole layer.
  if (!doc.selection) return [place(adjusted, area)]
  // With one, the rest of the layer shows as it is, around the adjusted part.
  const whole = unionRect(own, area)
  const rest = createCanvas(Math.max(1, Math.round(whole.width * scale)), Math.max(1, Math.round(whole.height * scale)))
  const rx = rest.width / whole.width
  const ry = rest.height / whole.height
  const ctx = getContext2d(rest)
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(rx, 0, 0, ry, (layer.x - whole.x) * rx, (layer.y - whole.y) * ry)
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect((area.x - whole.x) * rx, (area.y - whole.y) * ry, area.width * rx, area.height * ry)
  ctx.drawImage(adjusted, (area.x - whole.x) * rx, (area.y - whole.y) * ry, area.width * rx, area.height * ry)
  return [place(rest, whole)]
}

// Small pictures of the layer (or the selected part) with each set of adjustments, for the looks.
export function lookThumbnails(doc: EditorDocument, layer: Layer, looks: Adjustments[], maxSide: number): HTMLCanvasElement[] | null {
  const area = adjustArea(doc, layer, looks[0])
  if (!area) return null
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height))
  return looks.map((a) => renderAdjusted(doc, layer, a, area, scale, PREVIEW_BLUR_DETAIL))
}
