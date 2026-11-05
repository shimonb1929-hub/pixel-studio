// Makes a photo twice as big with AI, away from the page so the program never freezes.
//
// The AI is Swin2SR (Apache License 2.0), a model taught to put back the fine detail a photo loses
// when it's made smaller, so the bigger photo is clearer than any plain math can make it. It runs on
// ONNX Runtime, the same engine the other AI tools use. The model file is downloaded from our own
// site the first time it's needed (see public/models/enlarge/SOURCE.txt); nothing comes from any
// other site.

import * as ort from 'onnxruntime-web/wasm'
import plainMjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import plainWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { upscalePixels } from '../editor/upscale.ts'
import { placeTile, tileInput, tilePlan } from './enlargeTiles.ts'
import { ENLARGE_MODEL, type EnlargeAiRequest, type EnlargeAiResponse } from './enlargeAiTypes.ts'

let siteBase: string | null = null
let session: Promise<ort.InferenceSession> | null = null

function post(message: EnlargeAiResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

function load(): Promise<ort.InferenceSession> {
  session ??= (async () => {
    if (!siteBase) throw new Error('The page did not say where the site is.')
    const own = (url: string) => new URL(url, import.meta.url).href
    ort.env.wasm.wasmPaths = { mjs: own(plainMjs), wasm: own(plainWasm) }
    // Several threads where the browser allows it (it needs the page to be "cross-origin isolated").
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
    return ort.InferenceSession.create(new URL(ENLARGE_MODEL, siteBase).href, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  })()
  session.catch(() => (session = null))
  return session
}

const stopped = new Set<number>()

async function enlarge(request: Extract<EnlargeAiRequest, { type: 'enlarge' }>) {
  const { id, data, width, height } = request
  const source = { data, width, height }
  const ai = await load()
  // The plain enlarge first: it gives the see-through parts, and the AI then paints the colors.
  const result = upscalePixels(source, 2)
  const tiles = tilePlan(width, height)
  const name = ai.inputNames[0]
  for (let i = 0; i < tiles.length; i++) {
    if (stopped.has(id)) return
    const tile = tiles[i]
    const input = new ort.Tensor('float32', tileInput(source, tile), [1, 3, tile.readSize, tile.readSize])
    const output = await ai.run({ [name]: input })
    const answer = output[ai.outputNames[0]]
    placeTile(result, tile, answer.data as Float32Array, 2)
    input.dispose()
    answer.dispose()
    post({ type: 'progress', id, share: (i + 1) / tiles.length })
  }
  post({ type: 'done', id, data: result.data, width: result.width, height: result.height }, [result.data.buffer])
}

self.onmessage = (event: MessageEvent<EnlargeAiRequest>) => {
  const request = event.data
  if (request.type === 'setup') {
    siteBase = request.siteBase
    return
  }
  if (request.type === 'stop') {
    stopped.add(request.id)
    return
  }
  enlarge(request).catch((error) => post({ type: 'error', id: request.id, message: String(error) }))
}
