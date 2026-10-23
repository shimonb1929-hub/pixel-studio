import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSafari, pointAtOwnSite, type AiSettings } from './aiFiles.ts'

// Pixel Studio is used behind NetFree, which blocks or holds outside sites, so nothing may come
// from another site while the app runs. e2e/netfree.e2e.ts checks the AI tools in a browser with
// every outside site blocked; these check the settings and the code itself.

const ROOT = join(import.meta.dirname, '..', '..')

function fakeSettings(): AiSettings {
  return {
    allowLocalModels: false,
    allowRemoteModels: true,
    localModelPath: '/models/',
    remoteHost: 'https://huggingface.co/',
    useBrowserCache: true,
    useWasmCache: true,
    backends: { onnx: { wasm: { wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/' } } },
  }
}

const ENGINE = {
  plain: { mjs: 'assets/ort-plain.mjs', wasm: 'assets/ort-plain.wasm' },
  graphics: { mjs: 'http://example.test/shop/assets/ort-gpu.mjs', wasm: 'http://example.test/shop/assets/ort-gpu.wasm' },
}

describe('the AI files come from our own site', () => {
  it('turns off downloads from other sites and points everything at the site', () => {
    const settings = fakeSettings()
    pointAtOwnSite(settings, 'http://example.test/shop/index.html', ENGINE, false)
    expect(settings.allowRemoteModels).toBe(false)
    expect(settings.allowLocalModels).toBe(true)
    expect(settings.localModelPath).toBe('http://example.test/shop/models/')
    expect(settings.remoteHost).toBe('http://example.test/shop/models/')
    expect(settings.backends.onnx.wasm?.wasmPaths).toEqual({ mjs: ENGINE.graphics.mjs, wasm: ENGINE.graphics.wasm })
    expect(JSON.stringify(settings)).not.toMatch(/huggingface|jsdelivr|unpkg|cdn/)
  })

  it('works at the root of a domain too, and gives Safari the plain engine', () => {
    const settings = fakeSettings()
    pointAtOwnSite(settings, 'https://pixel.example/', ENGINE, true)
    expect(settings.localModelPath).toBe('https://pixel.example/models/')
    expect(settings.backends.onnx.wasm?.wasmPaths).toEqual({ mjs: 'https://pixel.example/assets/ort-plain.mjs', wasm: 'https://pixel.example/assets/ort-plain.wasm' })
  })

  it('tells Safari from other browsers', () => {
    expect(isSafari('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15', 'Apple Computer, Inc.')).toBe(true)
    expect(isSafari('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Google Inc.')).toBe(false)
    expect(isSafari('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/130.0 Mobile Safari/604.1', 'Apple Computer, Inc.')).toBe(false)
  })

  it("the app's own code names no other site to fetch from", () => {
    // Addresses that are only names, never fetched (like the SVG namespace).
    const NAMES_ONLY = new Set(['www.w3.org'])
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        return entry.isDirectory() ? files(path) : [path]
      })
    const code = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'pwa')), join(ROOT, 'index.html')].filter(
      (path) => /\.(tsx?|jsx?|mjs|html|css)$/.test(path) && !/\.test\.tsx?$/.test(path),
    )
    const found: string[] = []
    for (const path of code) {
      for (const match of readFileSync(path, 'utf8').matchAll(/(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=[/:'"`\s)]|$)/gi)) {
        if (!NAMES_ONLY.has(match[1].toLowerCase())) found.push(`${relative(ROOT, path)}: ${match[0]}`)
      }
    }
    expect(found).toEqual([])
  })

  it('the AI worker points the AI library at our own site before loading anything', () => {
    const worker = readFileSync(join(ROOT, 'src', 'ai', 'segmentWorker.ts'), 'utf8')
    const pointed = worker.indexOf('pointAtOurSite()\n')
    const firstLoad = worker.indexOf('.from_pretrained(')
    expect(pointed).toBeGreaterThan(-1)
    expect(firstLoad).toBeGreaterThan(pointed)
    expect(worker).not.toMatch(/allowRemoteModels\s*=\s*true/)
  })

  it('the model files the AI reads ship with the site, each small enough for GitHub', () => {
    const folder = join(ROOT, 'public', 'models', 'Xenova', 'slimsam-77-uniform')
    for (const name of ['config.json', 'preprocessor_config.json', 'onnx/vision_encoder.onnx', 'onnx/prompt_encoder_mask_decoder.onnx']) {
      const bytes = readFileSync(join(folder, name))
      expect(bytes.length, name).toBeGreaterThan(100)
      expect(bytes.length, name).toBeLessThan(95 * 1024 * 1024)
    }
  })
})
