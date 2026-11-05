// Making a picture bigger without it going soft. The browser enlarges pictures by blending
// neighboring pixels, which looks faded and fuzzy once a photo is shown much bigger than it is.
// This works each new pixel out from the six nearest on each side, weighted the way that keeps
// edges and fine detail (the Lanczos way), and never lets a pixel get lighter or darker than the
// pixels it sits between, so edges stay crisp without bright or dark rims around them.

export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

// How many times bigger the sharp copies are made. A picture shown 2.6 times bigger uses the copy
// made 3 times bigger, shrunk a little by the browser (shrinking a little stays sharp).
export const ENLARGE_STEPS = [1.5, 2, 3, 4, 6, 8]
// Pictures shown less than this much bigger look fine as they are.
export const ENLARGE_FROM = 1.15
// The most pixels one sharp copy may have, so memory stays in check.
export const ENLARGE_MAX_PIXELS = 12_000_000

// Which sharp copy a picture shown `scale` times bigger uses, or null if it needs none.
export function enlargeStep(width: number, height: number, scale: number): number | null {
  if (!(scale >= ENLARGE_FROM)) return null
  let step = ENLARGE_STEPS.find((s) => s >= scale * 0.98) ?? ENLARGE_STEPS[ENLARGE_STEPS.length - 1]
  for (let i = ENLARGE_STEPS.indexOf(step); i >= 0; i--) {
    step = ENLARGE_STEPS[i]
    if (Math.round(width * step) * Math.round(height * step) <= ENLARGE_MAX_PIXELS) return step
  }
  return null
}

const LOBES = 3

function lanczos(x: number): number {
  if (x === 0) return 1
  if (x <= -LOBES || x >= LOBES) return 0
  const px = Math.PI * x
  return (LOBES * Math.sin(px) * Math.sin(px / LOBES)) / (px * px)
}

interface Taps {
  // For each new pixel: where its first source pixel is, and the weight of each of the six.
  first: Int32Array
  weights: Float32Array
  // The two source pixels it sits between, which it must stay within.
  near: Int32Array
}

const TAPS = 2 * LOBES

function tapsFor(from: number, to: number): Taps {
  const first = new Int32Array(to)
  const weights = new Float32Array(to * TAPS)
  const near = new Int32Array(to * 2)
  const ratio = from / to
  for (let i = 0; i < to; i++) {
    const center = (i + 0.5) * ratio - 0.5
    const start = Math.floor(center) - LOBES + 1
    first[i] = start
    let sum = 0
    for (let k = 0; k < TAPS; k++) {
      const w = lanczos(center - (start + k))
      weights[i * TAPS + k] = w
      sum += w
    }
    for (let k = 0; k < TAPS; k++) weights[i * TAPS + k] /= sum
    const low = Math.floor(center)
    near[i * 2] = Math.max(0, Math.min(from - 1, low))
    near[i * 2 + 1] = Math.max(0, Math.min(from - 1, low + 1))
  }
  return { first, weights, near }
}

// One direction at a time: `count` lines of `from` pixels each become lines of `to` pixels.
// `step` is how far apart neighbors on a line are, and `lineStep` how far apart lines are, both in
// the source and (as outStep, outLineStep) in the result. Colors are four numbers each. Each new
// pixel is kept between the two pixels of `bounds` it sits between.
function pass(
  src: Float32Array,
  bounds: Float32Array,
  out: Float32Array,
  from: number,
  to: number,
  count: number,
  step: number,
  lineStep: number,
  outStep: number,
  outLineStep: number,
): void {
  const { first, weights, near } = tapsFor(from, to)
  for (let line = 0; line < count; line++) {
    const base = line * lineStep
    const outBase = line * outLineStep
    for (let i = 0; i < to; i++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const start = first[i]
      for (let k = 0; k < TAPS; k++) {
        const w = weights[i * TAPS + k]
        if (w === 0) continue
        const at = base + Math.max(0, Math.min(from - 1, start + k)) * step
        r += src[at] * w
        g += src[at + 1] * w
        b += src[at + 2] * w
        a += src[at + 3] * w
      }
      // Kept between the two pixels it sits between, so edges get no rims.
      const p = base + near[i * 2] * step
      const q = base + near[i * 2 + 1] * step
      const o = outBase + i * outStep
      const c = bounds
      out[o] = Math.min(Math.max(r, Math.min(c[p], c[q])), Math.max(c[p], c[q]))
      out[o + 1] = Math.min(Math.max(g, Math.min(c[p + 1], c[q + 1])), Math.max(c[p + 1], c[q + 1]))
      out[o + 2] = Math.min(Math.max(b, Math.min(c[p + 2], c[q + 2])), Math.max(c[p + 2], c[q + 2]))
      out[o + 3] = Math.min(Math.max(a, Math.min(c[p + 3], c[q + 3])), Math.max(c[p + 3], c[q + 3]))
    }
  }
}

// How much crisper edges are made before enlarging.
const CRISP = 1

// The picture with each pixel pushed away from the average of its neighbors (1-2-1 each way).
function sharpened(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length)
  const at = (x: number, y: number) => (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = at(x, y)
      const n = [at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1), at(x - 1, y), at(x + 1, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)]
      for (let ch = 0; ch < 4; ch++) {
        const blur =
          (src[n[0] + ch] + 2 * src[n[1] + ch] + src[n[2] + ch] + 2 * src[n[3] + ch] + 4 * src[o + ch] + 2 * src[n[4] + ch] + src[n[5] + ch] + 2 * src[n[6] + ch] + src[n[7] + ch]) / 16
        out[o + ch] = src[o + ch] + CRISP * (src[o + ch] - blur)
      }
    }
  }
  return out
}

// The picture made `width` × `height` (bigger than it is), keeping its edges and detail.
export function enlargePixels(source: Pixels, width: number, height: number): Pixels {
  const { width: sw, height: sh, data } = source
  // Worked out with colors weighed by how solid they are, so see-through edges get no dark fringe.
  const pre = new Float32Array(sw * sh * 4)
  for (let i = 0; i < sw * sh * 4; i += 4) {
    const alpha = data[i + 3] / 255
    pre[i] = data[i] * alpha
    pre[i + 1] = data[i + 1] * alpha
    pre[i + 2] = data[i + 2] * alpha
    pre[i + 3] = data[i + 3]
  }
  // Edges are made a little crisper first. Since each new pixel then stays between the pixels it
  // sits between, this narrows the soft band across an edge without bright or dark rims.
  const crisp = sharpened(pre, sw, sh)
  // Across first (each row gets wider), then down (each column gets taller).
  const wide = new Float32Array(width * sh * 4)
  pass(crisp, pre, wide, sw, width, sh, 4, sw * 4, 4, width * 4)
  const tall = new Float32Array(width * height * 4)
  pass(wide, wide, tall, sh, height, width, width * 4, 4, width * 4, 4)
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height * 4; i += 4) {
    const a = tall[i + 3]
    if (a <= 0) continue
    const unweigh = 255 / a
    out[i] = tall[i] * unweigh
    out[i + 1] = tall[i + 1] * unweigh
    out[i + 2] = tall[i + 2] * unweigh
    out[i + 3] = a
  }
  return { width, height, data: out }
}
