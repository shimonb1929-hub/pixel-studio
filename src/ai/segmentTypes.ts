// Messages between the page and the AI worker.

export interface SegmentPoint {
  x: number
  y: number
  // True for "this is part of it", false for "this is not".
  inside: boolean
}

export type SegmentRequest = {
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
  | { type: 'mask'; id: number; mask: Uint8Array; width: number; height: number }
  | { type: 'error'; id: number; message: string }
