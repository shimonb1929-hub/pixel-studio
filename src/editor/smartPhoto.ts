import { drawLayer } from './compose.ts'
import { createCanvas, getContext2d } from './document.ts'
import { paintPage } from './gradient.ts'
import { photoPlacement } from './objects.ts'
import { cachedContentBounds } from './pixels.ts'
import { bestWindow, SALIENCY_SIDE, saliencyMap, slideFor, type SaliencyMap } from './saliency.ts'
import { pixelVersion } from './pixelVersion.ts'
import { findTilt, STRAIGHTEN_SIDE, type Tilt } from './straighten.ts'
import { frameRect, needsTrim, quarterTurn, straightenedBox, trimmedSize } from './straightenBox.ts'
import type { TiltRequest, TiltResponse } from './straightenWorker.ts'
import { boxFromRect, type TransformBox } from './transform.ts'
import type { EditorDocument, PixelLayer, ShapeFill } from './types.ts'

// The two photo helpers put to work on real pictures: Straighten and smart crop. The math lives in
// straighten.ts and saliency.ts; this file shrinks pictures for them and applies what they find.

// A picture's pixels, shrunk so its longer side is at most `side`.
export function smallPixels(source: CanvasImageSource & { width: number; height: number }, side: number): ImageData {
  const scale = Math.min(1, side / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

// A shrunk copy of a picture, for showing changes quickly while a slider moves.
export function previewCopy(source: HTMLCanvasElement, side: number): HTMLCanvasElement {
  const scale = Math.min(1, side / Math.max(source.width, source.height))
  if (scale === 1) return source
  const canvas = createCanvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)))
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

// --- Straighten ---

// A photo layer with a box. A plain pixel layer gets the box it sits in, trimmed to what's drawn
// (an opened photo already fills its canvas, so it keeps its very own pixels).
export function boxedLayer(layer: PixelLayer): (PixelLayer & { box: TransformBox }) | null {
  if (layer.box) return layer as PixelLayer & { box: TransformBox }
  const content = cachedContentBounds(layer)
  if (!content) return null
  const box = boxFromRect(content)
  if (content.x === layer.x && content.y === layer.y && content.width === layer.canvas.width && content.height === layer.canvas.height) return { ...layer, box }
  const canvas = createCanvas(content.width, content.height)
  getContext2d(canvas).drawImage(layer.canvas, layer.x - content.x, layer.y - content.y)
  return { ...layer, canvas, x: content.x, y: content.y, box }
}

let worker: Worker | null = null
let nextId = 1
// Each waiting request, with what to do once the worker answers (or 'failed' if it couldn't).
const waiting = new Map<number, (tilt: Tilt | null | 'failed') => void>()

// Looks for the lines in the background, so a busy photo never freezes the page.
function tiltAway(pixels: ImageData): Promise<Tilt | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(findTilt(pixels))
  if (!worker) {
    worker = new Worker(new URL('./straightenWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TiltResponse>) => {
      const done = waiting.get(event.data.id)
      waiting.delete(event.data.id)
      done?.(event.data.tilt)
    }
    worker.onerror = () => {
      worker?.terminate()
      worker = null
      for (const done of waiting.values()) done('failed')
      waiting.clear()
    }
  }
  const id = nextId++
  const request: TiltRequest = { id, data: pixels.data, width: pixels.width, height: pixels.height }
  return new Promise((resolve) => {
    // If the worker can't start, the lines are looked for on the page itself.
    waiting.set(id, (tilt) => resolve(tilt === 'failed' ? findTilt(pixels) : tilt))
    worker!.postMessage(request)
  })
}

const tiltCache = new WeakMap<HTMLCanvasElement, { version: number; tilt: Promise<Tilt | null> }>()

// How far the photo's lines lean (worked out once for each version of a picture).
export function photoTilt(layer: PixelLayer): Promise<Tilt | null> {
  const version = pixelVersion(layer.canvas)
  const cached = tiltCache.get(layer.canvas)
  if (cached && cached.version === version) return cached.tilt
  const boxed = boxedLayer(layer)
  const tilt = boxed ? tiltAway(smallPixels(boxed.canvas, STRAIGHTEN_SIDE)) : Promise.resolve(null)
  tiltCache.set(layer.canvas, { version, tilt })
  return tilt
}

// The photo turned by `degrees` from upright, still filling its frame. When the page's edge trims
// it anyway, only its box changes and every pixel stays as it was. Otherwise the part that shows
// is kept, at the photo's own detail. `preview` is a smaller copy of the photo for quick previews.
export function straightenLayer(layer: PixelLayer, degrees: number, page: { width: number; height: number }, preview?: HTMLCanvasElement): PixelLayer {
  const boxed = boxedLayer(layer)
  if (!boxed || degrees === 0) return layer
  const box = boxed.box
  const turned = straightenedBox(box, degrees)
  if (!needsTrim(turned, frameRect(box), page)) return { ...boxed, box: turned }
  const source = preview ?? boxed.canvas
  const size = trimmedSize(box, source.width, source.height, degrees)
  const canvas = createCanvas(size.width, size.height)
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Drawn as the box would show it, seen from the frame: flips undone, then turned and grown.
  const flipX = Math.sign(box.width)
  const flipY = Math.sign(box.height)
  ctx.translate(size.width / 2, size.height / 2)
  ctx.scale(size.density * flipX, size.density * flipY)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.scale(turned.width / source.width, turned.height / source.height)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return { ...boxed, canvas, box: { ...box, rotation: quarterTurn(box.rotation) } }
}

// --- Smart crop ---

const photoMaps = new WeakMap<HTMLCanvasElement, SaliencyMap>()

export function photoSaliency(canvas: HTMLCanvasElement): SaliencyMap {
  let map = photoMaps.get(canvas)
  if (!map) {
    map = saliencyMap(smallPixels(canvas, SALIENCY_SIDE))
    photoMaps.set(canvas, map)
  }
  return map
}

// Where a photo inside a w × h shape slides to, so the shape shows its main thing.
export function photoOnMainThing(fill: Extract<ShapeFill, { kind: 'photo' }>, w: number, h: number): { x: number; y: number } {
  const place = photoPlacement(fill, w, h)
  const shareX = Math.min(1, w / place.width)
  const shareY = Math.min(1, h / place.height)
  const window = bestWindow(photoSaliency(fill.canvas), shareX, shareY)
  return { x: slideFor(window.x + window.width / 2, shareX), y: slideFor(window.y + window.height / 2, shareY) }
}

const designMaps = new WeakMap<EditorDocument['layers'], { key: string; map: SaliencyMap }>()

// The important parts of the whole design, as it looks.
function designSaliency(doc: EditorDocument): SaliencyMap {
  const key = `${doc.width}x${doc.height}:${doc.background}`
  const cached = designMaps.get(doc.layers)
  if (cached && cached.key === key) return cached.map
  const scale = Math.min(1, SALIENCY_SIDE / Math.max(doc.width, doc.height))
  const canvas = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)))
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(canvas.width / doc.width, canvas.height / doc.height)
  paintPage(ctx, doc, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  const map = saliencyMap(getContext2d(canvas).getImageData(0, 0, canvas.width, canvas.height))
  designMaps.set(doc.layers, { key, map })
  return map
}

// A crop frame of the given shape (width ÷ height), as big as fits inside `within`, placed over the
// most important part of the design instead of the plain middle.
export function smartCropFrame(doc: EditorDocument, ratio: number, within: TransformBox): TransformBox {
  const width = Math.min(Math.abs(within.width), Math.abs(within.height) * ratio)
  const height = width / ratio
  const area = {
    x: (within.cx - Math.abs(within.width) / 2) / doc.width,
    y: (within.cy - Math.abs(within.height) / 2) / doc.height,
    width: Math.abs(within.width) / doc.width,
    height: Math.abs(within.height) / doc.height,
  }
  const window = bestWindow(designSaliency(doc), width / doc.width, height / doc.height, area)
  return { cx: (window.x + window.width / 2) * doc.width, cy: (window.y + window.height / 2) * doc.height, width, height, rotation: 0 }
}
