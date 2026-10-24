// Messages between the page and the AI worker.

export interface SegmentPoint {
  x: number
  y: number
  // True for "this is part of it", false for "this is not".
  inside: boolean
}

export type SegmentRequest =
  // Sent first: the page's address, so the AI's files come from our own site wherever it lives.
  | { type: 'setup'; siteBase: string }
  | {
      type: 'prepare'
      id: number
      key: string
      image: { data: Uint8ClampedArray; width: number; height: number } | null
    }
  | {
  type: 'segment'
  id: number
  // Stands for the picture; the picture itself is only sent when the worker doesn't have it yet.
  key: string
  image: { data: Uint8ClampedArray; width: number; height: number } | null
  points: SegmentPoint[]
  // A box around the thing, as left, top, right, bottom.
  box?: [number, number, number, number]
    }

export type SegmentResponse =
  | { type: 'progress'; loaded: number; total: number }
  // `mask` is 1 for every pixel of the thing; `alpha` says the same softly (0 to 255), for smooth cut-out edges.
  | { type: 'mask'; id: number; mask: Uint8Array; alpha: Uint8Array; width: number; height: number }
  | { type: 'prepared'; id: number }
  | { type: 'error'; id: number; message: string }
