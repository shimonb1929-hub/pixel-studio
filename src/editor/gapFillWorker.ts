// Fills the gap a moved part leaves behind, away from the page so the program never freezes.
// The filling itself is the same as Fix spots (see heal.ts).

import { healPixels } from './heal.ts'

export interface GapRequest {
  id: number
  data: Uint8ClampedArray
  width: number
  height: number
  hole: Uint8Array
}

export interface GapResponse {
  id: number
  data: Uint8ClampedArray
}

self.onmessage = (event: MessageEvent<GapRequest>) => {
  const { id, data, width, height, hole } = event.data
  healPixels(data, width, height, hole)
  const response: GapResponse = { id, data }
  self.postMessage(response, { transfer: [data.buffer] })
}
