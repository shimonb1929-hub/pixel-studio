// Where the AI's files come from: always our own site, never another one.
//
// Pixel Studio is used behind NetFree, a filter that blocks or holds outside sites, so the AI
// library must never reach huggingface.co for the model or a CDN for its engine. The model files
// ship in public/models (refreshed by scripts/models/fetch.mjs) and the engine files are part of
// the build. Kept apart from the worker so a test can check the settings.

// The folder under the site that holds the models, laid out the way the AI library expects
// (models/<owner>/<name>/config.json and so on).
export const MODELS_FOLDER = 'models/'

// The engine (ONNX Runtime) comes in two builds. Safari needs the plain one; other browsers use
// the one that can also use the graphics card. The same choice the AI library makes by itself.
export interface EngineFiles {
  plain: { mjs: string; wasm: string }
  graphics: { mjs: string; wasm: string }
}

// The parts of the AI library's settings this changes (a small copy of its shape, so tests can
// pass a plain object).
export interface AiSettings {
  allowLocalModels: boolean
  allowRemoteModels: boolean
  localModelPath: string
  remoteHost: string
  useBrowserCache: boolean
  useWasmCache: boolean
  backends: { onnx: { wasm?: { wasmPaths?: unknown } } }
}

export function isSafari(userAgent: string, vendor: string): boolean {
  return vendor.includes('Apple') && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(userAgent) && !userAgent.includes('Chrome') && !userAgent.includes('Android')
}

// Points the AI library at our own site. `siteBase` is the page's address (document.baseURI), so
// it works wherever the site lives, at its own domain or in a folder of one. `engine` holds the
// engine files' full addresses (the worker works them out from its own address).
export function pointAtOwnSite(settings: AiSettings, siteBase: string, engine: EngineFiles, safari: boolean): void {
  const models = new URL(MODELS_FOLDER, siteBase).href
  settings.allowLocalModels = true
  settings.allowRemoteModels = false
  settings.localModelPath = models
  // Never used while remote models are off; set to our own site all the same, so nothing can
  // ever fall back to another one.
  settings.remoteHost = models
  // The offline helper (pwa/service-worker.js) keeps the model the first time it's used, so the
  // library doesn't keep a second copy of its own.
  settings.useBrowserCache = false
  settings.useWasmCache = false
  const files = safari ? engine.plain : engine.graphics
  const wasm = (settings.backends.onnx.wasm ??= {})
  wasm.wasmPaths = { mjs: new URL(files.mjs, siteBase).href, wasm: new URL(files.wasm, siteBase).href }
}

// Why an AI file couldn't be had, said plainly. `blocked` means something between us and the site
// (a filter like NetFree) sent a page of its own instead of the file.
export class AiFileError extends Error {
  readonly blocked: boolean
  constructor(file: string, reason: string, blocked: boolean) {
    super(`${file}: ${reason}`)
    this.blocked = blocked
  }
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

// How many times a download is tried, and how long to wait before trying again.
const TRIES = 3
const WAIT_MS = 1500

// Fetches an AI file carefully: tries again when the connection drops, and never hands the AI a
// web page in place of the file. A filter's "please wait" or "blocked" page that was kept by the
// offline helper is thrown away and fetched fresh once. `forget` drops a kept copy of a file.
export function carefulFetch(fetchFile: Fetch, forget: (url: string) => Promise<void>, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Fetch {
  return async (input, init) => {
    const url = String(input)
    const file = url.split('?')[0].split('/').pop() || url
    let lastError: AiFileError | null = null
    let fresh = false
    for (let attempt = 0; attempt < TRIES; attempt++) {
      if (attempt > 0) await wait(WAIT_MS * attempt)
      let response: Response
      try {
        response = await fetchFile(input, fresh ? { ...init, cache: 'reload' } : init)
      } catch {
        lastError = new AiFileError(file, 'the connection failed', false)
        continue
      }
      const type = response.headers.get('content-type') ?? ''
      // Model files are never web pages; a page here came from something in between.
      if (response.ok && type.includes('text/html')) {
        lastError = new AiFileError(file, 'a filter sent a page instead of the file', true)
        await forget(url).catch(() => {})
        fresh = true
        continue
      }
      if (response.ok || response.status === 404) return response
      lastError = new AiFileError(file, `the site answered ${response.status}`, response.status === 403 || response.status === 418)
    }
    throw lastError ?? new AiFileError(file, 'it could not be downloaded', false)
  }
}

// Drops a file from every copy the offline helper keeps, so it's downloaded fresh next time.
export async function forgetKept(url: string): Promise<void> {
  if (typeof caches === 'undefined') return
  for (const name of await caches.keys()) await (await caches.open(name)).delete(url)
}
