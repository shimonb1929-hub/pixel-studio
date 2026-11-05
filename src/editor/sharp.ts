import { createCanvas, getContext2d } from './document.ts'
import { enlargePixels, enlargeStep } from './enlarge.ts'
import type { EnlargeRequest, EnlargeResponse } from './enlargeWorker.ts'
import { pixelVersion } from './pixelVersion.ts'

// Pictures shown bigger than their own pixels are drawn from a sharp bigger copy, made from the
// original pixels (see enlarge.ts), so a small photo made big stays crisp instead of faded. The
// copies are kept until the picture's pixels change. Downloads and everything else that needs the
// finished look make the copy straight away; the screen asks for it in the background and shows
// the plain picture until it's ready, so dragging a corner never stutters.

interface Copy {
  version: number
  step: number
  canvas: HTMLCanvasElement
}

const KEEP = 2
const copies = new WeakMap<HTMLCanvasElement, Copy[]>()

// Goes up each time a copy made in the background is ready, so the screen is drawn again.
let version = 0
const listeners = new Set<() => void>()

export function sharpVersion(): number {
  return version
}

export function onSharpReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function ready() {
  version++
  for (const listener of listeners) listener()
}

// Counts each time the screen drew a picture without the sharp copy it needs, so pixels worked out
// meanwhile aren't kept for later.
let missed = 0

export function sharpMisses(): number {
  return missed
}

// While above zero, the screen is being drawn: copies are asked for, not waited for.
let onScreen = 0

export function drawingScreen<T>(draw: () => T): T {
  onScreen++
  try {
    return draw()
  } finally {
    onScreen--
  }
}

// All the copies kept, oldest first, so together they never take more memory than this.
const MAX_KEPT_BYTES = 400_000_000
const all = new Map<Copy, HTMLCanvasElement>()
let keptBytes = 0

function forget(copy: Copy) {
  const source = all.get(copy)
  if (!source) return
  all.delete(copy)
  keptBytes -= copy.canvas.width * copy.canvas.height * 4
  const left = (copies.get(source) ?? []).filter((c) => c !== copy)
  if (left.length) copies.set(source, left)
  else copies.delete(source)
}

function keep(source: HTMLCanvasElement, copy: Copy) {
  const before = copies.get(source) ?? []
  const kept = before.filter((c) => c.version === copy.version && c.step !== copy.step).slice(0, KEEP - 1)
  for (const old of before) if (!kept.includes(old)) forget(old)
  copies.set(source, [copy, ...kept])
  all.set(copy, source)
  keptBytes += copy.canvas.width * copy.canvas.height * 4
  for (const oldest of all.keys()) {
    if (keptBytes <= MAX_KEPT_BYTES || oldest === copy) break
    forget(oldest)
  }
}

function sizeFor(source: HTMLCanvasElement, step: number) {
  return { width: Math.max(1, Math.round(source.width * step)), height: Math.max(1, Math.round(source.height * step)) }
}

function sourcePixels(source: HTMLCanvasElement): ImageData {
  return getContext2d(source).getImageData(0, 0, source.width, source.height)
}

function toCanvas(data: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height)
  getContext2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, data.length), width, height), 0, 0)
  return canvas
}

function makeNow(source: HTMLCanvasElement, step: number): HTMLCanvasElement {
  const { width, height } = sizeFor(source, step)
  const out = enlargePixels(sourcePixels(source), width, height)
  const canvas = toCanvas(out.data, width, height)
  keep(source, { version: pixelVersion(source), step, canvas })
  return canvas
}

// --- In the background ---

let worker: Worker | null = null
let workerBroken = false
// The copy each picture needs next, in the order they were asked for.
const wanted = new Map<HTMLCanvasElement, number>()
let busy = false
let timer: ReturnType<typeof setTimeout> | null = null
// Waits this long after the last ask, so sizes passed while dragging aren't made for nothing.
const SETTLE_MS = 160

function ask(source: HTMLCanvasElement, step: number) {
  if (wanted.get(source) === step) return
  wanted.delete(source)
  wanted.set(source, step)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    pump()
  }, SETTLE_MS)
}

function enlargeAway(source: HTMLCanvasElement, width: number, height: number): Promise<Uint8ClampedArray> {
  const pixels = sourcePixels(source)
  if (typeof Worker === 'undefined' || workerBroken) return Promise.resolve(enlargePixels(pixels, width, height).data)
  if (!worker) {
    worker = new Worker(new URL('./enlargeWorker.ts', import.meta.url), { type: 'module' })
  }
  const w = worker
  return new Promise((resolve) => {
    const id = Math.random()
    const done = (event: MessageEvent<EnlargeResponse>) => {
      if (event.data.id !== id) return
      w.removeEventListener('message', done)
      w.removeEventListener('error', failed)
      resolve(event.data.data)
    }
    // If the worker can't run, the copy is made on the page itself.
    const failed = () => {
      w.removeEventListener('message', done)
      w.removeEventListener('error', failed)
      workerBroken = true
      worker?.terminate()
      worker = null
      // The pixels went to the worker, so they're read again.
      resolve(enlargePixels(sourcePixels(source), width, height).data)
    }
    w.addEventListener('message', done)
    w.addEventListener('error', failed)
    const request: EnlargeRequest = { id, data: pixels.data, width: pixels.width, height: pixels.height, toWidth: width, toHeight: height }
    w.postMessage(request, [pixels.data.buffer])
  })
}

async function pump() {
  if (busy) return
  busy = true
  try {
    while (wanted.size) {
      const [source, step] = wanted.entries().next().value!
      wanted.delete(source)
      const at = pixelVersion(source)
      if ((copies.get(source) ?? []).some((c) => c.version === at && c.step === step)) continue
      const { width, height } = sizeFor(source, step)
      let data: Uint8ClampedArray
      try {
        data = await enlargeAway(source, width, height)
      } catch {
        continue
      }
      // Painted on meanwhile: the copy is out of date, and the screen will ask again.
      if (pixelVersion(source) !== at) continue
      keep(source, { version: at, step, canvas: toCanvas(data, width, height) })
      ready()
    }
  } finally {
    busy = false
  }
}

// --- Drawing ---

// The sharp copy to draw for `source` shown `scale` times bigger, or null to draw it as it is.
export function sharpCopy(source: HTMLCanvasElement, scale: number): HTMLCanvasElement | null {
  const step = enlargeStep(source.width, source.height, scale)
  if (!step) return null
  const at = pixelVersion(source)
  const kept = (copies.get(source) ?? []).filter((c) => c.version === at)
  const exact = kept.find((c) => c.step === step)
  if (exact) return exact.canvas
  if (!onScreen) return makeNow(source, step)
  ask(source, step)
  missed++
  // Meanwhile another copy of these pixels is still better than none.
  const others = [...kept].sort((a, b) => b.step - a.step)
  return others[0]?.canvas ?? null
}

// How much bigger than its own pixels something drawn w × h from `source` shows on `ctx`.
function shownScale(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, w: number, h: number, then?: DOMMatrix): number {
  const m = then ? ctx.getTransform().multiply(then) : ctx.getTransform()
  return Math.max((Math.hypot(m.a, m.b) * Math.abs(w)) / source.width, (Math.hypot(m.c, m.d) * Math.abs(h)) / source.height)
}

// Draws `source` into the w × h rectangle at x, y, from a sharp copy when it shows bigger.
export function drawSharp(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const copy = sharpCopy(source, shownScale(ctx, source, w, h))
  ctx.drawImage(copy ?? source, x, y, w, h)
}

// The picture to fill with for `source` shown w × h (on `ctx`, through `then` if given): a sharp
// copy when it shows bigger, or the picture itself.
export function sharpPatternSource(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, w: number, h: number, then?: DOMMatrix): HTMLCanvasElement {
  return sharpCopy(source, shownScale(ctx, source, w, h, then)) ?? source
}
