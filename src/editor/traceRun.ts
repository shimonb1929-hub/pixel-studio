import { traceImage, type TraceImage, type TraceOptions, type TraceResult } from './trace.ts'
import type { TraceReply, TraceRequest } from './traceWorker.ts'

// Runs Turn into shapes in a worker, one job at a time: a new job stops the one before (its answer
// is no longer wanted, as when a slider moves on). The answer is null when the job was stopped.

let worker: Worker | null = null
let current: { id: number; done: (result: TraceResult | null) => void; progress?: (share: number) => void } | null = null
let nextId = 1

function stopCurrent() {
  if (!current) return
  current.done(null)
  current = null
  // The worker is busy with work nobody wants any more: start afresh.
  worker?.terminate()
  worker = null
}

function startWorker(): Worker {
  const w = new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (event: MessageEvent<TraceReply>) => {
    const reply = event.data
    if (!current || reply.id !== current.id) return
    if ('progress' in reply) current.progress?.(reply.progress)
    else {
      const { done } = current
      current = null
      done(reply.result)
    }
  }
  w.onerror = () => {
    const job = current
    current = null
    worker?.terminate()
    worker = null
    job?.done(null)
  }
  return w
}

export function runTrace(image: TraceImage, options: TraceOptions, progress?: (share: number) => void): Promise<TraceResult | null> {
  stopCurrent()
  if (typeof Worker === 'undefined') return Promise.resolve(traceImage(image, options, progress))
  worker ??= startWorker()
  const id = nextId++
  return new Promise((resolve) => {
    current = { id, done: resolve, progress }
    const request: TraceRequest = { id, image, options }
    worker!.postMessage(request, [image.data.buffer])
  })
}

// Stops the job that's running, if any (when the window closes).
export function stopTrace(): void {
  stopCurrent()
}
