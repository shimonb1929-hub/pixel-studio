import { createCanvas, getContext2d } from './document.ts'
import { upscalePixels, type Pixels, type UpscaleFactor } from './upscale.ts'
import type { UpscaleRequest, UpscaleResponse } from './upscaleWorker.ts'

// Runs Bigger and sharper on a whole photo in a worker, so the page stays smooth, and hands back
// the new pixels as a canvas. A new worker each time: the work is rare and big, and the worker's
// memory is given back as soon as it's done.

export function canvasPixels(source: HTMLCanvasElement): Pixels {
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no canvas')
  const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height)
  return { data, width, height }
}

export function pixelsCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = createCanvas(pixels.width, pixels.height)
  const ctx = getContext2d(canvas)
  const image = ctx.createImageData(pixels.width, pixels.height)
  image.data.set(pixels.data)
  ctx.putImageData(image, 0, 0)
  return canvas
}

// Stopping `signal` stops the work at once (when the window is closed while it works).
export async function upscaleCanvas(source: HTMLCanvasElement, factor: UpscaleFactor, onProgress: (share: number) => void, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  return pixelsCanvas(await upscaleInWorker(canvasPixels(source), factor, onProgress, signal))
}

let nextId = 1

function upscaleInWorker(source: Pixels, factor: UpscaleFactor, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Pixels> {
  if (typeof Worker === 'undefined') return Promise.resolve(upscalePixels(source, factor, { onProgress }))
  const worker = new Worker(new URL('./upscaleWorker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  return new Promise<Pixels>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<UpscaleResponse>) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') onProgress(message.share)
      else if (message.type === 'done') resolve({ data: message.data, width: message.width, height: message.height })
      else reject(new Error(message.message))
    }
    worker.onerror = () => reject(new Error('The worker stopped.'))
    signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
    const request: UpscaleRequest = { id, data: source.data, width: source.width, height: source.height, factor }
    worker.postMessage(request, [source.data.buffer])
  }).finally(() => worker.terminate())
}
