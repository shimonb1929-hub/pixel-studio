// The messages between the page and the AI enlarger's worker (enlargeAiWorker.ts).

// The model file, under the site (see public/models/enlarge/SOURCE.txt).
export const ENLARGE_MODEL = 'models/enlarge/swin2sr-x2.ort'

export type EnlargeAiRequest =
  | { type: 'setup'; siteBase: string }
  | { type: 'enlarge'; id: number; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'stop'; id: number }

export type EnlargeAiResponse =
  | { type: 'progress'; id: number; share: number }
  | { type: 'done'; id: number; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'error'; id: number; message: string }
