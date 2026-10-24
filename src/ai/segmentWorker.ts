// Runs the AI that finds things in a picture, away from the page so the program never freezes.
//
// It uses SlimSAM (a small "Segment Anything" model, Apache License 2.0) through Transformers.js.
// The model is downloaded once, the first time it's needed, and kept by the browser after that.

import { env, RawImage, SamModel, SamProcessor, type Tensor } from '@huggingface/transformers'
import { refineEdge } from './refineEdge.ts'
import type { SegmentRequest, SegmentResponse } from './segmentTypes.ts'

const MODEL = 'Xenova/slimsam-77-uniform'
// The full-size numbers (about 40 MB in all): the squeezed versions give ragged, patchy outlines.

env.allowLocalModels = false

let loading: Promise<{ model: SamModel; processor: SamProcessor }> | null = null
interface Prepared {
  model: SamModel
  processor: SamProcessor
  image: RawImage
  embeddings: Record<string, Tensor>
}

// The picture last worked out, so more clicks on the same picture are quick.
let kept: { key: string; ready: Promise<Prepared> } | null = null

function post(message: SegmentResponse) {
  self.postMessage(message)
}

function load() {
  loading ??= (async () => {
    const progress = new Map<string, { loaded: number; total: number }>()
    const onProgress = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (info.status !== 'progress' || !info.file || !info.total) return
      progress.set(info.file, { loaded: info.loaded ?? 0, total: info.total })
      let loaded = 0
      let total = 0
      for (const p of progress.values()) {
        loaded += p.loaded
        total += p.total
      }
      post({ type: 'progress', loaded, total })
    }
    // The graphics card is much quicker where the browser lets the page use it.
    const gpu = 'gpu' in navigator && !!(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null))
    const model = gpu
      ? await (SamModel.from_pretrained(MODEL, { device: 'webgpu', dtype: 'fp32', progress_callback: onProgress }) as Promise<SamModel>).catch(() => null)
      : null
    const [cpuModel, processor] = await Promise.all([
      model ? Promise.resolve(model) : (SamModel.from_pretrained(MODEL, { dtype: 'fp32', progress_callback: onProgress }) as Promise<SamModel>),
      SamProcessor.from_pretrained(MODEL, { progress_callback: onProgress }) as Promise<SamProcessor>,
    ])
    return { model: cpuModel, processor }
  })()
  loading.catch(() => (loading = null))
  return loading
}

// Works the picture out once, so clicks on it are quick. A click that comes while it's still being
// worked out waits for the same work instead of starting it again.
function prepare(key: string, picture: SegmentRequest['image']) {
  if (kept?.key === key) return kept.ready
  const ready = (async () => {
    const { model, processor } = await load()
    if (!picture) throw new Error('missing picture')
    const { data, width, height } = picture
    // The model wants red, green and blue only; see-through parts count as white.
    const rgb = new Uint8ClampedArray(width * height * 3)
    for (let i = 0; i < width * height; i++) {
      const a = data[i * 4 + 3] / 255
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = data[i * 4 + c] * a + 255 * (1 - a)
    }
    const image = new RawImage(rgb, width, height, 3)
    const inputs = await processor(image)
    return { model, processor, image, embeddings: await model.get_image_embeddings(inputs) }
  })()
  kept = { key, ready }
  ready.catch(() => {
    if (kept?.ready === ready) kept = null
  })
  return ready
}

async function segment(request: Extract<SegmentRequest, { type: 'segment' }>) {
  const { model, processor, image, embeddings } = await prepare(request.key, request.image)
  const given = [...request.points]
  // This model doesn't take boxes, so a box becomes points: its middle is the thing and its
  // corners are around it.
  if (request.box) {
    const [x0, y0, x1, y1] = request.box
    if (!given.some((p) => p.inside)) given.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, inside: true })
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) given.push({ x, y, inside: false })
  }
  const points = given.map((p) => [p.x, p.y])
  const labels = given.map((p) => (p.inside ? 1 : 0))
  const inputs = await processor(image, { input_points: [[points]], input_labels: [[labels]] })
  const outputs = await model({ ...embeddings, input_points: inputs.input_points, input_labels: inputs.input_labels })
  // Kept as the AI's own "how sure" numbers (above 0 means yes), so the edge can be refined below.
  const masks: Tensor[] = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes, { binarize: false })
  const scores = Array.from(outputs.iou_scores.data as Float32Array)
  const [, count, height, width] = masks[0].dims
  const data = masks[0].data as Float32Array
  const size = width * height
  // The model offers a small part, a bigger part and the whole thing. Only parts that agree with
  // the points count (every "this" point inside, every "not this" point outside). From one click
  // the whole thing is usually what people mean, so the biggest one the model is nearly as sure of
  // wins; with more points the meaning is clear, so the one it's surest of wins.
  const agrees = (m: number) =>
    given.every((p) => {
      const x = Math.min(width - 1, Math.max(0, Math.round(p.x)))
      const y = Math.min(height - 1, Math.max(0, Math.round(p.y)))
      return data[m * size + y * width + x] > 0 === p.inside
    })
  // With a box, the thing is inside it: parts that spill well past it are something else.
  const fitsBox = (m: number) => {
    if (!request.box) return true
    const [x0, y0, x1, y1] = request.box
    let inside = 0
    let all = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[m * size + y * width + x] <= 0) continue
        all++
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inside++
      }
    }
    return all > 0 && inside >= all * 0.97
  }
  let candidates = Array.from({ length: count }, (_, m) => m).filter((m) => agrees(m) && fitsBox(m))
  if (candidates.length === 0) candidates = Array.from({ length: count }, (_, m) => m).filter(agrees)
  if (candidates.length === 0) candidates = Array.from({ length: count }, (_, m) => m)
  const best = Math.max(...candidates.map((m) => scores[m]))
  let pick = candidates[0]
  let pickArea = -1
  for (const m of candidates) {
    if (scores[m] < best - (given.length > 1 ? 0 : 0.04)) continue
    let area = 0
    for (let i = m * size; i < (m + 1) * size; i++) area += data[i] > 0 ? 1 : 0
    if (area > pickArea) {
      pick = m
      pickArea = area
    }
  }
  // The edge is moved onto where the picture's colors really change, so fine detail is followed.
  // (The AI's yes/no is used, not how sure it is: it can be unsure in the middle of a thing too.)
  const found = new Float32Array(size)
  for (let i = 0; i < size; i++) found[i] = data[pick * size + i] > 0 ? 1 : 0
  const refined = image.width === width && image.height === height ? refineEdge(found, image.data, width, height) : found
  const mask = new Uint8Array(size)
  const alpha = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    mask[i] = refined[i] >= 0.5 ? 1 : 0
    // Nearly-whole pixels count as whole, so only the very edge is soft.
    alpha[i] = Math.round(Math.min(1, Math.max(0, (refined[i] - 0.1) / 0.8)) * 255)
  }
  post({ type: 'mask', id: request.id, mask, alpha, width, height })
}

self.onmessage = (event: MessageEvent<SegmentRequest>) => {
  const request = event.data
  if (request.type === 'prepare') {
    prepare(request.key, request.image).then(
      () => post({ type: 'prepared', id: request.id }),
      (error: unknown) => post({ type: 'error', id: request.id, message: String(error) }),
    )
  } else if (request.type === 'segment') {
    segment(request).catch((error: unknown) => post({ type: 'error', id: request.id, message: String(error) }))
  }
}
