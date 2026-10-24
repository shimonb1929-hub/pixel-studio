// Turns a picture into shapes away from the page, so the program never freezes while it works.
// The tracing itself is in trace.ts.

import { traceImage, type TraceImage, type TraceOptions, type TraceResult } from './trace.ts'

export interface TraceRequest {
  id: number
  image: TraceImage
  options: TraceOptions
}

export type TraceReply = { id: number; progress: number } | { id: number; result: TraceResult }

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { id, image, options } = event.data
  let last = 0
  const result = traceImage(image, options, (progress) => {
    // A few progress notes are enough.
    if (progress - last < 0.05 && progress < 1) return
    last = progress
    self.postMessage({ id, progress } satisfies TraceReply)
  })
  self.postMessage({ id, result } satisfies TraceReply)
}
