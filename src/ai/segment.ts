import type { SegmentPoint, SegmentRequest, SegmentResponse } from './segmentTypes.ts'

// Finding things in a picture with AI. The work happens in a worker, so the page stays smooth; the
// model is downloaded from our own site the first time and kept by the browser after that.

export interface FoundMask {
  mask: Uint8Array
  // How much of each pixel belongs to the thing, 0 to 255, for soft cut-out edges.
  alpha: Uint8Array
  width: number
  height: number
}

// The AI works on pictures at most this big; the result is stretched back to full size.
export const AI_PICTURE_SIDE = 1024

let worker: Worker | null = null
let nextId = 1
let workerKey: string | null = null
const pending = new Map<number, { resolve: (found: FoundMask | null) => void; reject: (error: Error) => void }>()
const progressListeners = new Set<(share: number) => void>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./segmentWorker.ts', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'setup', siteBase: document.baseURI } satisfies SegmentRequest)
  worker.onmessage = (event: MessageEvent<SegmentResponse>) => {
    const message = event.data
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message.total > 0 ? message.loaded / message.total : 0)
      return
    }
    const waiting = pending.get(message.id)
    pending.delete(message.id)
    if (!waiting) return
    if (message.type === 'mask') waiting.resolve({ mask: message.mask, alpha: message.alpha, width: message.width, height: message.height })
    else if (message.type === 'prepared') waiting.resolve(null)
    else {
      workerKey = null
      waiting.reject(new Error(message.message))
    }
  }
  worker.onerror = () => {
    for (const waiting of pending.values()) waiting.reject(new Error('The AI stopped working.'))
    pending.clear()
    worker?.terminate()
    worker = null
    workerKey = null
  }
  return worker
}

// Hears how far the first download has come (0 to 1).
export function onAiProgress(listener: (share: number) => void): () => void {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

function send(request: Exclude<SegmentRequest, { type: 'setup' }>): Promise<FoundMask | null> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject })
    w.postMessage(request, request.image ? [request.image.data.buffer] : [])
  })
}

function pictureFor(key: string, picture: () => ImageData): Extract<SegmentRequest, { type: 'segment' }>['image'] {
  if (workerKey === key) return null
  const data = picture()
  workerKey = key
  return { data: data.data, width: data.width, height: data.height }
}

// Gets the AI and the picture ready ahead of time (when the magic selection is chosen), so the
// first click is quick.
export function prepareThing(key: string, picture: () => ImageData): Promise<void> {
  if (workerKey === key) return Promise.resolve()
  return send({ type: 'prepare', id: nextId++, key, image: pictureFor(key, picture) }).then(() => undefined)
}

// Finds the thing at the given points in a picture. `key` stands for the picture: the same key
// means the same picture, so it isn't sent or worked out again.
export async function findThing(key: string, picture: () => ImageData, points: SegmentPoint[], box?: [number, number, number, number]): Promise<FoundMask> {
  const found = await send({ type: 'segment', id: nextId++, key, image: pictureFor(key, picture), points, box })
  if (!found) throw new Error('Nothing came back.')
  return found
}
