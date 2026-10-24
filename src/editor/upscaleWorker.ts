// Makes a photo bigger and sharper away from the page, so the program never freezes while it works
// (see upscale.ts for how).

import { upscalePixels, type UpscaleFactor } from './upscale.ts'

export interface UpscaleRequest {
  id: number
  data: Uint8ClampedArray
  width: number
  height: number
  factor: UpscaleFactor
}

export type UpscaleResponse =
  | { id: number; type: 'progress'; share: number }
  | { id: number; type: 'done'; data: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: 'error'; message: string }

self.onmessage = (event: MessageEvent<UpscaleRequest>) => {
  const { id, data, width, height, factor } = event.data
  try {
    let last = -1
    const result = upscalePixels({ data, width, height }, factor, {
      onProgress: (share) => {
        const percent = Math.floor(share * 100)
        if (percent === last) return
        last = percent
        self.postMessage({ id, type: 'progress', share } satisfies UpscaleResponse)
      },
    })
    self.postMessage({ id, type: 'done', ...result } satisfies UpscaleResponse, { transfer: [result.data.buffer] })
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error) } satisfies UpscaleResponse)
  }
}
