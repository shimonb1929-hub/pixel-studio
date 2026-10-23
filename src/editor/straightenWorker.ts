// Finds how far a photo leans, away from the page so the program never freezes on a busy photo.
// The finding itself is in straighten.ts.

import { findTilt, type Tilt } from './straighten.ts'

export interface TiltRequest {
  id: number
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface TiltResponse {
  id: number
  tilt: Tilt | null
}

self.onmessage = (event: MessageEvent<TiltRequest>) => {
  const { id, data, width, height } = event.data
  const response: TiltResponse = { id, tilt: findTilt({ width, height, data }) }
  self.postMessage(response)
}
