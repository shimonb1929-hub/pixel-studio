import { canvasPixels, pixelsCanvas } from '../editor/upscaleRun.ts'
import type { EnlargeAiRequest, EnlargeAiResponse } from './enlargeAiTypes.ts'

// Most detail (AI): makes a photo twice or four times as big with the AI enlarger, which puts back
// fine detail plain math can't. The work happens in a worker, so the page stays smooth.

// The AI takes a while for each pixel, so it works on photos up to this size (four times as wide
// makes the second half work on a photo four times bigger: past this, it's finished the plain way).
export const AI_MAX_PIXELS = 500_000

export function aiCanEnlarge(width: number, height: number): boolean {
  return width * height <= AI_MAX_PIXELS
}

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./enlargeAiWorker.ts', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'setup', siteBase: document.baseURI } satisfies EnlargeAiRequest)
  return worker
}

// Twice as big. Stopping `signal` stops the work.
export function enlargeTwice(source: HTMLCanvasElement, onProgress: (share: number) => void, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const w = getWorker()
  const id = nextId++
  const pixels = canvasPixels(source)
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const listen = (event: MessageEvent<EnlargeAiResponse>) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') return onProgress(message.share)
      done()
      if (message.type === 'done') resolve(pixelsCanvas({ data: message.data, width: message.width, height: message.height }))
      else reject(new Error(message.message))
    }
    const failed = () => {
      done()
      worker?.terminate()
      worker = null
      reject(new Error('The AI stopped working.'))
    }
    const stop = () => {
      done()
      w.postMessage({ type: 'stop', id } satisfies EnlargeAiRequest)
      reject(new DOMException('Stopped', 'AbortError'))
    }
    const done = () => {
      w.removeEventListener('message', listen)
      w.removeEventListener('error', failed)
      signal?.removeEventListener('abort', stop)
    }
    w.addEventListener('message', listen)
    w.addEventListener('error', failed)
    signal?.addEventListener('abort', stop)
    w.postMessage({ type: 'enlarge', id, data: pixels.data, width: pixels.width, height: pixels.height } satisfies EnlargeAiRequest, [pixels.data.buffer])
  })
}
