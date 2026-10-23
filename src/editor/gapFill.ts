import { createCanvas, getContext2d, layerRect } from './document.ts'
import { distanceToShape } from './distance.ts'
import { intersectRect, type Rect } from './geometry.ts'
import { healPixels } from './heal.ts'
import type { GapRequest, GapResponse } from './gapFillWorker.ts'
import { pixelVersion } from './pixelVersion.ts'
import { selectionInfo, type Selection } from './selection.ts'
import type { Layer, PixelLayer } from './types.ts'

// Moving the selected part of a photo: AI fills the gap it leaves behind, so the place it came from
// looks as if it was never there (like the professional "content-aware move"). The gap is the same
// wherever the part goes, so it's filled once, in the background, as soon as the part is picked up.

// How far past the selection's edge the gap reaches, in pixels, so no rim of the old thing is left.
export const GAP_GROWTH = 3
// How much of the picture around the gap is looked at for pieces to fill it with.
const MIN_MARGIN = 48
const MAX_MARGIN = 360
// Gaps bigger than this many pixels are filled at a smaller size and then enlarged, so it stays quick.
const MAX_GAP_PIXELS = 400_000

export interface GapFill {
  // Where the gap's area sits in the design.
  area: Rect
  // Opaque where the gap is (design pixels, at area.x, area.y): cut away from the layer.
  hole: HTMLCanvasElement
  // The filled-in pixels, only inside the gap; null until the filling is done.
  patch: HTMLCanvasElement | null
  // Resolves once the patch is ready (null if it couldn't be made).
  ready: Promise<HTMLCanvasElement | null>
}

// Opaque where `marked` (the selection's alpha, 0..255) is, grown by `growth` pixels.
export function gapHole(marked: Uint8ClampedArray | Uint8Array, width: number, height: number, growth = GAP_GROWTH): Uint8Array {
  const inside = new Uint8Array(width * height)
  for (let i = 0; i < inside.length; i++) inside[i] = marked[i] > 0 ? 1 : 0
  const distance = distanceToShape(inside, width, height)
  const hole = new Uint8Array(width * height)
  for (let i = 0; i < hole.length; i++) hole[i] = distance[i] <= growth ? 1 : 0
  return hole
}

// The area around a gap whose pixels are used to fill it.
export function gapArea(bounds: Rect, layer: Rect): Rect | null {
  const side = Math.max(bounds.width, bounds.height)
  const margin = Math.round(Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, side * 0.75))) + GAP_GROWTH
  return intersectRect(layer, {
    x: Math.floor(bounds.x - margin),
    y: Math.floor(bounds.y - margin),
    width: Math.ceil(bounds.width + margin * 2),
    height: Math.ceil(bounds.height + margin * 2),
  })
}

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, (data: Uint8ClampedArray | null) => void>()

function fillPixels(data: Uint8ClampedArray, width: number, height: number, hole: Uint8Array): Promise<Uint8ClampedArray | null> {
  if (typeof Worker === 'undefined') {
    healPixels(data, width, height, hole)
    return Promise.resolve(data)
  }
  if (!worker) {
    worker = new Worker(new URL('./gapFillWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<GapResponse>) => {
      const done = waiting.get(event.data.id)
      waiting.delete(event.data.id)
      done?.(event.data.data)
    }
    worker.onerror = () => {
      for (const done of waiting.values()) done(null)
      waiting.clear()
      worker?.terminate()
      worker = null
    }
  }
  const id = nextId++
  const request: GapRequest = { id, data, width, height, hole }
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    worker!.postMessage(request, [data.buffer])
  })
}

const listeners = new Set<() => void>()

// Hears when a gap has been filled, so what's on screen can show it.
export function onGapFilled(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// A filled gap is remembered for the selection it belongs to, while the layer's pixels stay the same.
const cache = new WeakMap<Selection, { layer: Layer; version: number; fill: GapFill | null }>()

// The gap the selected part of `layer` leaves when it's lifted off, filled in the background.
// `layer` is the layer as it is in the design; `pixels` is it settled into plain pixels.
export function gapFor(layer: Layer, pixels: PixelLayer, selection: Selection, docWidth: number, docHeight: number): GapFill | null {
  const version = layer.kind === 'raster' ? pixelVersion(layer.canvas) : 0
  const cached = cache.get(selection)
  if (cached && cached.layer === layer && cached.version === version) return cached.fill
  const fill = startGap(pixels, selection, docWidth, docHeight)
  cache.set(selection, { layer, version, fill })
  return fill
}

function startGap(layer: PixelLayer, selection: Selection, docWidth: number, docHeight: number): GapFill | null {
  const { mask, bounds } = selectionInfo(selection, docWidth, docHeight)
  const inLayer = bounds && intersectRect(bounds, layerRect(layer))
  const area = inLayer && gapArea(inLayer, layerRect(layer))
  if (!area) return null
  const { x, y, width, height } = area

  const maskCtx = mask.getContext('2d', { willReadFrequently: true }) ?? getContext2d(mask)
  // The mask is design-sized; parts of the area off the design are simply not selected.
  const marked = new Uint8ClampedArray(width * height)
  const inDesign = intersectRect(area, { x: 0, y: 0, width: docWidth, height: docHeight })
  if (inDesign) {
    const alpha = maskCtx.getImageData(inDesign.x, inDesign.y, inDesign.width, inDesign.height).data
    for (let row = 0; row < inDesign.height; row++) {
      for (let col = 0; col < inDesign.width; col++) {
        marked[(row + inDesign.y - y) * width + col + inDesign.x - x] = alpha[(row * inDesign.width + col) * 4 + 3]
      }
    }
  }
  const holeBits = gapHole(marked, width, height)

  const hole = createCanvas(width, height)
  const holeCtx = getContext2d(hole)
  const holeImage = holeCtx.createImageData(width, height)
  for (let i = 0; i < holeBits.length; i++) if (holeBits[i]) holeImage.data[i * 4 + 3] = 255
  holeCtx.putImageData(holeImage, 0, 0)

  // The picture around the gap, as it is (the part itself is in the gap, so it's never copied).
  const source = createCanvas(width, height)
  const sourceCtx = source.getContext('2d', { willReadFrequently: true }) ?? getContext2d(source)
  sourceCtx.drawImage(layer.canvas, layer.x - x, layer.y - y)

  let holeCount = 0
  for (const bit of holeBits) holeCount += bit
  const around = sourceCtx.getImageData(0, 0, width, height).data
  if (!mostlySolid(around, holeBits)) return null
  const scale = holeCount > MAX_GAP_PIXELS ? Math.sqrt(MAX_GAP_PIXELS / holeCount) : 1
  const work = scale < 1 ? shrink(source, hole, scale) : { canvas: source, hole: holeBits }
  const workCtx = work.canvas.getContext('2d', { willReadFrequently: true }) ?? getContext2d(work.canvas)
  const image = workCtx.getImageData(0, 0, work.canvas.width, work.canvas.height)

  const fill: GapFill = { area, hole, patch: null, ready: Promise.resolve(null) }
  fill.ready = fillPixels(image.data, image.width, image.height, work.hole).then((data) => {
    if (!data) return null
    workCtx.putImageData(new ImageData(new Uint8ClampedArray(data), image.width, image.height), 0, 0)
    const patch = createCanvas(width, height)
    const patchCtx = getContext2d(patch)
    patchCtx.imageSmoothingQuality = 'high'
    patchCtx.drawImage(work.canvas, 0, 0, width, height)
    // Only the gap is kept.
    patchCtx.globalCompositeOperation = 'destination-in'
    patchCtx.drawImage(hole, 0, 0)
    fill.patch = patch
    for (const listener of listeners) listener()
    return patch
  })
  return fill
}

// Only photos (and other pictures with no see-through parts around the gap) get filled: on a
// drawing, the gap stays see-through, so other strokes nearby aren't copied into it.
export function mostlySolid(rgba: Uint8ClampedArray, hole: Uint8Array): boolean {
  let solid = 0
  let count = 0
  for (let i = 0; i < hole.length; i++) {
    if (hole[i]) continue
    count++
    if (rgba[i * 4 + 3] >= 250) solid++
  }
  return count > 0 && solid >= count * 0.9
}

// A smaller copy of the picture and gap, for very big gaps.
function shrink(source: HTMLCanvasElement, hole: HTMLCanvasElement, scale: number): { canvas: HTMLCanvasElement; hole: Uint8Array } {
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  const small = createCanvas(width, height)
  const smallCtx = small.getContext('2d', { willReadFrequently: true }) ?? getContext2d(small)
  smallCtx.drawImage(hole, 0, 0, width, height)
  const alpha = smallCtx.getImageData(0, 0, width, height).data
  const bits = new Uint8Array(width * height)
  for (let i = 0; i < bits.length; i++) bits[i] = alpha[i * 4 + 3] > 0 ? 1 : 0
  return { canvas, hole: bits }
}

// The layer's pixels with the gap cut out (see-through), ready for the part to be put down again.
export function cutGap(layer: PixelLayer, fill: GapFill): HTMLCanvasElement {
  const base = createCanvas(layer.canvas.width, layer.canvas.height)
  const ctx = getContext2d(base)
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(fill.hole, fill.area.x - layer.x, fill.area.y - layer.y)
  return base
}
