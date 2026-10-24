import type { PixelLayer } from './types.ts'

// Bigger and sharper (the professional "Preserve Details" enlarge): a photo gets two or four times
// as many pixels, so it prints sharp even when it was small. This is plain math on the photo's own
// pixels, with no AI and nothing invented:
// 1. Lanczos resampling (three lobes) works out each new pixel from the 6×6 old pixels around it.
//    It keeps edges much crisper than the browser's own smoothing.
// 2. Gentle sharpening (an unsharp mask) makes edges a little steeper. It only works where the
//    photo has real edges: in flat areas (sky, skin, walls) it does nothing, so grain and noise are
//    never made stronger.
// 3. Halo guard: no new pixel may be much brighter or darker than the old pixels right around it,
//    which stops the light and dark rims that resampling and sharpening can leave along edges.
// Colors are worked on with see-through already multiplied in, so see-through edges never get a
// dark or colored fringe.

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type UpscaleFactor = 2 | 4

export const UPSCALE_FACTORS: UpscaleFactor[] = [2, 4]

// Results bigger than this get a plain warning: they take a while and make the design heavy.
export const WARN_MEGAPIXELS = 60
// Results bigger than this are refused: the browser could run out of memory and close the tab.
export const MAX_MEGAPIXELS = 100
// Browsers can't make canvases much bigger than this on a side (the same as MAX_LAYER_SIDE).
export const MAX_UPSCALE_SIDE = 16000

export interface UpscalePlan {
  width: number
  height: number
  megapixels: number
  // 'large' works but is slow and heavy; 'too-big' is refused.
  verdict: 'ok' | 'large' | 'too-big'
}

export function upscalePlan(width: number, height: number, factor: UpscaleFactor): UpscalePlan {
  const w = width * factor
  const h = height * factor
  const megapixels = (w * h) / 1_000_000
  const verdict = megapixels > MAX_MEGAPIXELS || w > MAX_UPSCALE_SIDE || h > MAX_UPSCALE_SIDE ? 'too-big' : megapixels > WARN_MEGAPIXELS ? 'large' : 'ok'
  return { width: w, height: h, megapixels, verdict }
}

// How many photo pixels land on each inch of paper when the design is printed at its real size.
// `shownWidth` is how wide the photo is on the design, in design pixels.
export function printDetail(photoWidth: number, shownWidth: number, ppi: number): number {
  return Math.round((photoWidth * ppi) / Math.max(1e-6, Math.abs(shownWidth)))
}

// The photo with its new, bigger pixels, in exactly the same place and size on the design. A layer
// sitting at plain x, y gets a box of its old size, so the extra pixels make it sharper, not bigger.
export function withUpscaledPixels(layer: PixelLayer, canvas: HTMLCanvasElement): PixelLayer {
  const box = layer.box ?? {
    cx: layer.x + layer.canvas.width / 2,
    cy: layer.y + layer.canvas.height / 2,
    width: layer.canvas.width,
    height: layer.canvas.height,
    rotation: 0,
  }
  return { ...layer, canvas, box }
}

const LOBES = 3
const TAPS = LOBES * 2

function sinc(x: number): number {
  if (x === 0) return 1
  const px = Math.PI * x
  return Math.sin(px) / px
}

function lanczos(x: number): number {
  return Math.abs(x) < LOBES ? sinc(x) * sinc(x / LOBES) : 0
}

// For a whole-number enlargement the same few weight patterns repeat: new pixel j·factor + p sits at
// old position j + (p + 0.5) / factor − 0.5, and reads the six old pixels around it.
interface Phase {
  first: number
  weights: Float32Array
}

function phases(factor: number): Phase[] {
  return Array.from({ length: factor }, (_, p) => {
    const at = (p + 0.5) / factor - 0.5
    const first = Math.floor(at) - LOBES + 1
    const weights = new Float32Array(TAPS)
    let sum = 0
    for (let k = 0; k < TAPS; k++) {
      weights[k] = lanczos(at - (first + k))
      sum += weights[k]
    }
    for (let k = 0; k < TAPS; k++) weights[k] /= sum
    return { first, weights }
  })
}

// Where each new pixel sits between the old ones: the old pixel before it, the one after it, and
// how far along it is (0 to 1). Used for the halo guard and for how much to sharpen.
interface Between {
  before: Int32Array
  after: Int32Array
  share: Float32Array
}

function between(size: number, factor: number): Between {
  const out = size * factor
  const before = new Int32Array(out)
  const after = new Int32Array(out)
  const share = new Float32Array(out)
  for (let o = 0; o < out; o++) {
    const at = Math.min(size - 1, Math.max(0, (o + 0.5) / factor - 0.5))
    const b = Math.floor(at)
    before[o] = b
    after[o] = Math.min(size - 1, b + 1)
    share[o] = at - b
  }
  return { before, after, share }
}

function gaussian(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2))
  const kernel = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma))
    sum += kernel[i + radius]
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  return kernel
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export interface UpscaleOptions {
  // How strong the sharpening is (0 for none). Gentle by default.
  sharpen?: number
  // Called now and then with how far along it is (0 to 1).
  onProgress?: (share: number) => void
}

// Below this much difference between neighboring old pixels (0 to 255) an area counts as flat and
// isn't sharpened; above the second number it's sharpened fully.
const FLAT = 10
const EDGE = 32
// How much of an overshoot past the old pixels around it is kept (the rest is the halo taken away).
const HALO_KEEP = 0.15

// The halo guard: past the old pixels around a new pixel (lo to hi), only a little of the
// overshoot stays.
function guard(value: number, lo: number, hi: number): number {
  if (value > hi) return hi + (value - hi) * HALO_KEEP
  if (value < lo) return lo - (lo - value) * HALO_KEEP
  return value
}

// Makes a picture `factor` times wider and taller. Works row by row, so even a big result needs
// little memory beyond the result itself.
export function upscalePixels(source: Pixels, factor: UpscaleFactor, options: UpscaleOptions = {}): Pixels {
  const { width: w, height: h, data: src } = source
  const ow = w * factor
  const oh = h * factor
  const amount = options.sharpen ?? 0.9
  const out = new Uint8ClampedArray(ow * oh * 4)

  // The old pixels with see-through multiplied in, as numbers, and how bright each is.
  const pre = new Float32Array(w * h * 4)
  const luma = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3] / 255
    const r = src[i * 4] * a
    const g = src[i * 4 + 1] * a
    const b = src[i * 4 + 2] * a
    pre[i * 4] = r
    pre[i * 4 + 1] = g
    pre[i * 4 + 2] = b
    pre[i * 4 + 3] = src[i * 4 + 3]
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  // How much the brightness changes around each old pixel (largest minus smallest of its 3×3
  // neighbors): small in flat areas, big along edges.
  const edgeness = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let lo = Infinity
      let hi = -Infinity
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const v = luma[yy * w + Math.min(w - 1, Math.max(0, x + dx))]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      edgeness[y * w + x] = smoothstep(FLAT, EDGE, hi - lo)
    }
  }

  const phase = phases(factor)
  const across = between(w, factor)
  const down = between(h, factor)
  const kernel = gaussian(0.5 * factor)
  const radius = (kernel.length - 1) / 2

  // Which six old pixels each new column reads, and how much of each, worked out once.
  const tapAt = new Int32Array(ow * TAPS)
  const tapWeight = new Float32Array(ow * TAPS)
  for (let o = 0; o < ow; o++) {
    const { first, weights } = phase[o % factor]
    const j = Math.floor(o / factor)
    for (let k = 0; k < TAPS; k++) {
      tapAt[o * TAPS + k] = Math.min(w - 1, Math.max(0, j + first + k)) * 4
      tapWeight[o * TAPS + k] = weights[k]
    }
  }

  // Old rows made wide (Lanczos across), kept only while rows near them are being made.
  const wideRows = new Map<number, Float32Array>()
  const wideRow = (y: number): Float32Array => {
    const kept = wideRows.get(y)
    if (kept) return kept
    const row = new Float32Array(ow * 4)
    const base = y * w * 4
    for (let o = 0; o < ow; o++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let t = o * TAPS, end = t + TAPS; t < end; t++) {
        const i = base + tapAt[t]
        const wk = tapWeight[t]
        r += pre[i] * wk
        g += pre[i + 1] * wk
        b += pre[i + 2] * wk
        a += pre[i + 3] * wk
      }
      row[o * 4] = r
      row[o * 4 + 1] = g
      row[o * 4 + 2] = b
      row[o * 4 + 3] = a
    }
    wideRows.set(y, row)
    return row
  }

  // New rows (Lanczos down as well), with their brightness blurred across for the sharpening.
  interface NewRow {
    rgba: Float32Array
    blurredAcross: Float32Array
  }
  const newRows = new Map<number, NewRow>()
  const newRow = (oy: number): NewRow => {
    const y = Math.min(oh - 1, Math.max(0, oy))
    const kept = newRows.get(y)
    if (kept) return kept
    const { first, weights } = phase[y % factor]
    const j = Math.floor(y / factor)
    const rows = Array.from({ length: TAPS }, (_, k) => wideRow(Math.min(h - 1, Math.max(0, j + first + k))))
    const rgba = new Float32Array(ow * 4)
    const [r0, r1, r2, r3, r4, r5] = rows
    const [w0, w1, w2, w3, w4, w5] = weights
    for (let i = 0, end = ow * 4; i < end; i++) rgba[i] = r0[i] * w0 + r1[i] * w1 + r2[i] * w2 + r3[i] * w3 + r4[i] * w4 + r5[i] * w5
    const bright = new Float32Array(ow)
    for (let x = 0; x < ow; x++) bright[x] = 0.299 * rgba[x * 4] + 0.587 * rgba[x * 4 + 1] + 0.114 * rgba[x * 4 + 2]
    const blurredAcross = new Float32Array(ow)
    for (let x = 0; x < ow; x++) {
      let sum = 0
      if (x >= radius && x < ow - radius) {
        for (let k = 0; k < kernel.length; k++) sum += bright[x - radius + k] * kernel[k]
      } else {
        for (let k = -radius; k <= radius; k++) sum += bright[Math.min(ow - 1, Math.max(0, x + k))] * kernel[k + radius]
      }
      blurredAcross[x] = sum
    }
    const made = { rgba, blurredAcross }
    newRows.set(y, made)
    return made
  }

  // For the two old rows around the current new row: for each pair of neighboring old pixels,
  // the lowest and highest of each channel among the four (for the halo guard), and how edgy the
  // old picture is there, worked out once for every few new rows that share them.
  const cellLo = new Float32Array(w * 4)
  const cellHi = new Float32Array(w * 4)
  const rowEdge = new Float32Array(w)
  let cellsFor = ''

  const reportEvery = Math.max(1, Math.floor(oh / 50))
  for (let oy = 0; oy < oh; oy++) {
    const here = newRow(oy).rgba
    // The brightness blurred both ways, for the sharpening.
    const blurred = new Float32Array(ow)
    for (let k = -radius; k <= radius; k++) {
      const row = newRow(oy + k).blurredAcross
      const wk = kernel[k + radius]
      for (let x = 0; x < ow; x++) blurred[x] += row[x] * wk
    }
    const y0 = down.before[oy]
    const y1 = down.after[oy]
    const fy = down.share[oy]
    if (cellsFor !== `${y0}:${y1}`) {
      cellsFor = `${y0}:${y1}`
      for (let x = 0; x < w; x++) {
        const x1 = Math.min(w - 1, x + 1)
        const a = (y0 * w + x) * 4
        const b = (y0 * w + x1) * 4
        const d = (y1 * w + x) * 4
        const e = (y1 * w + x1) * 4
        for (let c = 0; c < 4; c++) {
          cellLo[x * 4 + c] = Math.min(pre[a + c], pre[b + c], pre[d + c], pre[e + c])
          cellHi[x * 4 + c] = Math.max(pre[a + c], pre[b + c], pre[d + c], pre[e + c])
        }
      }
    }
    for (let x = 0; x < w; x++) rowEdge[x] = edgeness[y0 * w + x] * (1 - fy) + edgeness[y1 * w + x] * fy
    for (let ox = 0; ox < ow; ox++) {
      const x0 = across.before[ox]
      const fx = across.share[ox]
      const cell = x0 * 4
      // Sharpen only as much as the old pixels around it have edges.
      const edge = rowEdge[x0] * (1 - fx) + rowEdge[across.after[ox]] * fx
      const p = ox * 4
      const alphaLo = cellLo[cell + 3]
      const alphaHi = cellHi[cell + 3]
      const alpha = Math.min(255, Math.max(0, guard(here[p + 3], alphaLo, alphaHi)))
      const o = (oy * ow + ox) * 4
      if (alpha <= 0.5) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0
        continue
      }
      // Along a see-through edge the brightness changes because of the see-through, not the
      // picture, so it isn't sharpened there (that would tint the edge).
      const bright = 0.299 * here[p] + 0.587 * here[p + 1] + 0.114 * here[p + 2]
      const lift = alphaLo === alphaHi ? amount * edge * (bright - blurred[ox]) : 0
      for (let c = 0; c < 3; c++) {
        const v = Math.min(alpha, Math.max(0, guard(here[p + c] + lift, cellLo[cell + c], cellHi[cell + c])))
        out[o + c] = (v * 255) / alpha
      }
      out[o + 3] = alpha
    }
    // Rows no longer needed are let go, so memory stays small.
    for (const key of newRows.keys()) if (key < oy - radius) newRows.delete(key)
    const oldNeeded = Math.floor((oy + 1 - radius) / factor) + phase[0].first - 1
    for (const key of wideRows.keys()) if (key < oldNeeded) wideRows.delete(key)
    if (options.onProgress && oy % reportEvery === 0) options.onProgress(oy / oh)
  }
  options.onProgress?.(1)
  return { data: out, width: ow, height: oh }
}

// A part of a picture: `rect` in whole pixels, which must lie inside it.
export function cropPixels(source: Pixels, x: number, y: number, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * source.width + x) * 4
    data.set(source.data.subarray(from, from + width * 4), row * width * 4)
  }
  return { data, width, height }
}

// A small part of the result, for the preview: the old pixels at `x, y` (size × size) made bigger.
// A rim around the part is made too and cut off again, so the part looks exactly like the same
// spot of the full result.
export function upscalePart(source: Pixels, factor: UpscaleFactor, x: number, y: number, size: number, options: UpscaleOptions = {}): Pixels {
  const rim = LOBES + 2
  const x0 = Math.max(0, x - rim)
  const y0 = Math.max(0, y - rim)
  const x1 = Math.min(source.width, x + size + rim)
  const y1 = Math.min(source.height, y + size + rim)
  const big = upscalePixels(cropPixels(source, x0, y0, x1 - x0, y1 - y0), factor, options)
  const width = Math.min(size, source.width - x) * factor
  const height = Math.min(size, source.height - y) * factor
  return cropPixels(big, (x - x0) * factor, (y - y0) * factor, width, height)
}

// The most detailed square of a picture (the one with the most edges), so the preview shows where
// the difference is easy to see rather than a patch of empty sky.
export function busiestSpot(source: Pixels, size: number): { x: number; y: number } {
  const { width: w, height: h, data } = source
  if (w <= size && h <= size) return { x: 0, y: 0 }
  const step = Math.max(1, Math.floor(size / 4))
  const sample = Math.max(1, Math.floor(size / 24))
  let best = { x: Math.max(0, Math.floor((w - size) / 2)), y: Math.max(0, Math.floor((h - size) / 2)) }
  let bestScore = -1
  const brightness = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000) * (data[i + 3] / 255)
  }
  for (let y = 0; y <= Math.max(0, h - size); y += step) {
    for (let x = 0; x <= Math.max(0, w - size); x += step) {
      let score = 0
      for (let yy = y; yy < Math.min(h - sample, y + size); yy += sample) {
        for (let xx = x; xx < Math.min(w - sample, x + size); xx += sample) {
          const here = brightness(xx, yy)
          score += Math.abs(here - brightness(xx + sample, yy)) + Math.abs(here - brightness(xx, yy + sample))
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
    }
  }
  return best
}
