// Makes sharp bigger copies of pictures away from the page, so the program never freezes while
// one is made. The work itself is in enlarge.ts.

import { enlargePixels } from './enlarge.ts'

export interface EnlargeRequest {
  id: number
  data: Uint8ClampedArray
  width: number
  height: number
  toWidth: number
  toHeight: number
}

export interface EnlargeResponse {
  id: number
  data: Uint8ClampedArray
}

self.onmessage = (event: MessageEvent<EnlargeRequest>) => {
  const { id, data, width, height, toWidth, toHeight } = event.data
  const out = enlargePixels({ width, height, data }, toWidth, toHeight)
  const response: EnlargeResponse = { id, data: out.data }
  ;(self as unknown as Worker).postMessage(response, [out.data.buffer])
}
