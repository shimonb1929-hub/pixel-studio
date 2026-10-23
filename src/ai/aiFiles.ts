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
