// Runs the AI that finds things in a picture, away from the page so the program never freezes.
//
// It uses SlimSAM (a small "Segment Anything" model, Apache License 2.0) through Transformers.js.
// The model is downloaded once, the first time it's needed, and kept by the browser after that.

import { env, RawImage, SamModel, SamProcessor, type Tensor } from '@huggingface/transformers'
import type { SegmentRequest, SegmentResponse } from './segmentTypes.ts'

const MODEL = 'Xenova/slimsam-77-uniform'

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
      ? await (SamModel.from_pretrained(MODEL, { device: 'webgpu', dtype: 'fp16', progress_callback: onProgress }) as Promise<SamModel>).catch(() => null)
      : null
    const [cpuModel, processor] = await Promise.all([
      model ? Promise.resolve(model) : (SamModel.from_pretrained(MODEL, { dtype: 'q8', progress_callback: onProgress }) as Promise<SamModel>),
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
  const points = request.points.map((p) => [p.x, p.y])
  const labels = request.points.map((p) => (p.inside ? 1 : 0))
  // With only a box, a "padding" point stands in, which the model ignores.
  const prompt = points.length > 0 ? { input_points: [[points]], input_labels: [[labels]] } : { input_points: [[[[0, 0]]]], input_labels: [[[-10]]] }
  const inputs = await processor(image, request.box ? { ...prompt, input_boxes: [[request.box]] } : prompt)
  const outputs = await model({
    ...embeddings,
    ...(inputs.input_points ? { input_points: inputs.input_points, input_labels: inputs.input_labels } : {}),
    ...(inputs.input_boxes ? { input_boxes: inputs.input_boxes } : {}),
  })
  const masks: Tensor[] = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
  const scores = Array.from(outputs.iou_scores.data as Float32Array)
  const [, count, height, width] = masks[0].dims
  const data = masks[0].data as Uint8Array
  const size = width * height
  // The model offers a small part, a bigger part and the whole thing. The whole thing is usually
  // what people mean, so the biggest one that the model is nearly as sure of wins.
  const best = Math.max(...scores)
  let pick = scores.indexOf(best)
  let pickArea = -1
  for (let m = 0; m < count; m++) {
    if (scores[m] < best - 0.04) continue
    let area = 0
    for (let i = m * size; i < (m + 1) * size; i++) area += data[i] ? 1 : 0
    if (area > pickArea) {
      pick = m
      pickArea = area
    }
  }
  const mask = data.slice(pick * size, (pick + 1) * size)
  post({ type: 'mask', id: request.id, mask, width, height })
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
