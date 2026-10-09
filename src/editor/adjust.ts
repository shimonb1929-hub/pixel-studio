// Color and detail adjustments: the math, done on plain RGBA pixel arrays so it can be tested
// without a browser. Brightness, contrast, color strength and warmth change each pixel on its own;
// blur and sharpen look at the pixels around it.

export interface Adjustments {
  // -1 to 1; 0 changes nothing.
  brightness: number
  contrast: number
  // Color strength: -1 is black and white.
  saturation: number
  // Positive is warmer (more orange), negative is cooler (more blue).
  warmth: number
  // 0 to 1.
  blur: number
  sharpen: number
}

export type AdjustmentKey = keyof Adjustments

export const NO_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0, sharpen: 0 }

export const ADJUSTMENT_NAMES: Record<AdjustmentKey, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Color strength',
  warmth: 'Warmth',
  blur: 'Blur',
  sharpen: 'Sharpen',
}

// Sliders that go both ways start in the middle; blur and sharpen start at the left.
export const TWO_WAY: Record<AdjustmentKey, boolean> = {
  brightness: true,
  contrast: true,
  saturation: true,
  warmth: true,
  blur: false,
  sharpen: false,
}

export interface Look {
  id: string
  name: string
  description: string
  keywords: string[]
  settings: Adjustments
}

const look = (id: string, name: string, description: string, keywords: string[], settings: Partial<Adjustments>): Look => ({
  id,
  name,
  description,
  keywords,
  settings: { ...NO_ADJUSTMENTS, ...settings },
})

// Ready-made looks. Each one just sets the sliders, so you can fine-tune it afterwards.
export const LOOKS: Look[] = [
  look('original', 'Original', 'No changes. Puts every slider back to the middle.', ['original', 'none', 'reset', 'normal'], {}),
  look('mono', 'Black & white', 'Takes away all color, with a little extra contrast.', ['black and white', 'grayscale', 'greyscale', 'gray', 'mono', 'no color'], {
    saturation: -1,
    contrast: 0.12,
  }),
  look('old', 'Old photo', 'Brown and faded, like a photo from long ago.', ['sepia', 'old', 'vintage', 'retro', 'antique', 'brown'], {
    saturation: -1,
    warmth: 0.75,
    contrast: -0.12,
    brightness: 0.06,
  }),
  look('vivid', 'Vivid', 'Brighter, bolder colors that stand out.', ['vivid', 'colorful', 'bold', 'pop', 'saturated', 'bright colors'], {
    saturation: 0.45,
    contrast: 0.15,
  }),
  look('warm', 'Warm', 'A golden, sunny glow.', ['warm', 'sunny', 'golden', 'orange', 'summer'], { warmth: 0.45, saturation: 0.1, brightness: 0.04 }),
  look('cool', 'Cool', 'A fresh, bluish feel.', ['cool', 'cold', 'blue', 'winter', 'icy'], { warmth: -0.45, saturation: -0.05 }),
  look('soft', 'Soft', 'Lighter and gentler, with calm colors.', ['soft', 'faded', 'pastel', 'light', 'gentle', 'matte'], {
    contrast: -0.28,
    brightness: 0.12,
    saturation: -0.2,
  }),
  look('dramatic', 'Dramatic', 'Strong darks and lights, with quieter colors.', ['dramatic', 'moody', 'dark', 'strong', 'intense'], {
    contrast: 0.5,
    saturation: -0.3,
    brightness: -0.06,
  }),
  look('dreamy', 'Dreamy', 'Soft focus and light, like a dream.', ['dreamy', 'dream', 'glow', 'hazy', 'soft focus'], {
    blur: 0.22,
    brightness: 0.14,
    contrast: -0.18,
  }),
]

export function sameAdjustments(a: Adjustments, b: Adjustments): boolean {
  return (Object.keys(a) as AdjustmentKey[]).every((key) => Math.abs(a[key] - b[key]) < 1e-6)
}

export function isNeutral(a: Adjustments): boolean {
  return sameAdjustments(a, NO_ADJUSTMENTS)
}

// The ready-made look these settings are exactly, if any.
export function matchingLook(a: Adjustments): Look | undefined {
  return LOOKS.find((l) => sameAdjustments(l.settings, a))
}

// The name of the change, for undo: "Brightness", "Black & white look" or "Adjust colors".
export function adjustmentLabel(a: Adjustments): string {
  const chosen = matchingLook(a)
  if (chosen && chosen.id !== 'original') return `${chosen.name} look`
  const changed = (Object.keys(a) as AdjustmentKey[]).filter((key) => a[key] !== 0)
  return changed.length === 1 ? ADJUSTMENT_NAMES[changed[0]] : 'Adjust colors'
}

// What a slider's value means, in everyday words.
export function describeAdjustment(key: AdjustmentKey, value: number): string {
  const amount = Math.abs(value)
  const tier = amount < 0.005 ? 0 : amount < 0.3 ? 1 : amount < 0.7 ? 2 : 3
  const up = value > 0
  const words: Record<AdjustmentKey, [string, string[], string[]]> = {
    brightness: ['No change.', ['A little lighter.', 'Lighter.', 'Much lighter.'], ['A little darker.', 'Darker.', 'Much darker.']],
    contrast: [
      'No change.',
      ['A little more punch.', 'Darks darker and lights lighter.', 'Very strong: details may get lost in the darks and lights.'],
      ['A little gentler.', 'Softer and flatter.', 'Very flat and gray.'],
    ],
    saturation: [
      'No change.',
      ['A little more colorful.', 'More colorful.', 'Very bold colors.'],
      ['A little less colorful.', 'Faded colors.', amount >= 0.995 ? 'Black and white.' : 'Almost no color.'],
    ],
    warmth: ['No change.', ['A little warmer.', 'Warmer and more golden.', 'Very warm and orange.'], ['A little cooler.', 'Cooler and more blue.', 'Very cool and blue.']],
    blur: ['Sharp, as it is.', ['Slightly soft.', 'Blurry.', 'Very blurry.'], []],
    sharpen: ['No extra sharpening.', ['Crisper details.', 'Much crisper details.', 'Very crisp. Edges may start to look rough.'], []],
  }
  const [none, more, less] = words[key]
  if (tier === 0) return none
  return (up ? more : less)[tier - 1]
}

// How strong blur and sharpen are depends on the design's size, so the same slider position looks
// the same on a small sticker and a big poster. `size` is the design's longer side, measured in
// the pixels being worked on (smaller for a quick preview).
export function blurSigma(blur: number, size: number): number {
  return Math.pow(Math.max(0, blur), 1.5) * 0.03 * size
}

export function sharpenSigma(size: number): number {
  return Math.max(0.6, size / 1600)
}

// How far a change can reach past the pixels it starts from, in the same units as `size`.
export function adjustmentReach(a: Adjustments, size: number): number {
  const blur = blurSigma(a.blur, size)
  return Math.ceil(3 * (blur >= 0.3 ? blur : 0) + (a.sharpen > 0 ? 3 * sharpenSigma(size) : 0))
}

export function changesColors(a: Adjustments): boolean {
  return a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.warmth !== 0
}

// One lookup table for brightness and contrast, the same for red, green and blue.
export function toneTable(brightness: number, contrast: number): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256)
  // Brightness bends the middle tones and keeps pure black and white as they are.
  const gamma = Math.pow(2, -1.25 * brightness)
  const spread = contrast >= 0 ? 1 + 2 * contrast : 1 + 0.85 * contrast
  for (let i = 0; i < 256; i++) {
    const x = Math.pow(i / 255, gamma)
    table[i] = ((x - 0.5) * spread + 0.5) * 255
  }
  return table
}

// Brightness, contrast, color strength and warmth, changing `data` (RGBA) in place.
export function adjustColors(data: Uint8ClampedArray, a: Adjustments): void {
  const tone = toneTable(a.brightness, a.contrast)
  const strength = a.saturation >= 0 ? 1 + 1.2 * a.saturation : 1 + a.saturation
  // Color strength comes before warmth, so a warm tint survives black and white (that's "Old photo").
  const red = 1 + 0.22 * a.warmth
  const blue = 1 - 0.22 * a.warmth
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = tone[data[i]]
    let g = tone[data[i + 1]]
    let b = tone[data[i + 2]]
    if (strength !== 1) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = gray + (r - gray) * strength
      g = gray + (g - gray) * strength
      b = gray + (b - gray) * strength
    }
    data[i] = r * red
    data[i + 1] = g
    data[i + 2] = b * blue
  }
}

// Three box blurs in a row look just like a Gaussian blur, and each one is quick whatever its size.
export function boxRadii(sigma: number, passes = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1)
  let lower = Math.floor(ideal)
  if (lower % 2 === 0) lower--
  const upper = lower + 2
  const useLower = Math.round((12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4))
  return Array.from({ length: passes }, (_, i) => ((i < useLower ? lower : upper) - 1) / 2)
}

// Colors weighted by how solid they are ("premultiplied"), as floats: red, green, blue, alpha for
// each pixel. Blurring these never brings dark fringes in from see-through areas.
function premultiplied(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    out[i] = data[i] * alpha
    out[i + 1] = data[i + 1] * alpha
    out[i + 2] = data[i + 2] * alpha
    out[i + 3] = data[i + 3]
  }
  return out
}

// Averages each pixel with its neighbors along its row. Past the ends, the end pixel repeats, so a
// photo's edges stay solid instead of fading out.
function boxRows(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
  const scale = 1 / (2 * r + 1)
  const last = width - 1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    let s0 = src[row] * (r + 1)
    let s1 = src[row + 1] * (r + 1)
    let s2 = src[row + 2] * (r + 1)
    let s3 = src[row + 3] * (r + 1)
    for (let k = 1; k <= r; k++) {
      const i = row + Math.min(k, last) * 4
      s0 += src[i]
      s1 += src[i + 1]
      s2 += src[i + 2]
      s3 += src[i + 3]
    }
    for (let x = 0; x < width; x++) {
      const o = row + x * 4
      dst[o] = s0 * scale
      dst[o + 1] = s1 * scale
      dst[o + 2] = s2 * scale
      dst[o + 3] = s3 * scale
      const add = row + Math.min(x + r + 1, last) * 4
      const sub = row + Math.max(x - r, 0) * 4
      s0 += src[add] - src[sub]
      s1 += src[add + 1] - src[sub + 1]
      s2 += src[add + 2] - src[sub + 2]
      s3 += src[add + 3] - src[sub + 3]
    }
  }
}

// The same down the columns, a whole row at a time, which is much kinder to the computer's memory
// than walking down one column after another.
function boxColumns(src: Float32Array, dst: Float32Array, width: number, height: number, r: number, sums: Float32Array): void {
  const scale = 1 / (2 * r + 1)
  const stride = width * 4
  const lastRow = (height - 1) * stride
  for (let i = 0; i < stride; i++) sums[i] = src[i] * (r + 1)
  for (let k = 1; k <= r; k++) {
    const row = Math.min(k * stride, lastRow)
    for (let i = 0; i < stride; i++) sums[i] += src[row + i]
  }
  for (let y = 0; y < height; y++) {
    const out = y * stride
    const add = Math.min((y + r + 1) * stride, lastRow)
    const sub = Math.max((y - r) * stride, 0)
    for (let i = 0; i < stride; i++) {
      dst[out + i] = sums[i] * scale
      sums[i] += src[add + i] - src[sub + i]
    }
  }
}

// Blurs premultiplied pixels in place.
function blurFloats(values: Float32Array, width: number, height: number, radii: number[]): void {
  const tmp = new Float32Array(values.length)
  const sums = new Float32Array(width * 4)
  for (const r of radii) {
    if (r < 1) continue
    boxRows(values, tmp, width, height, r)
    boxColumns(tmp, values, width, height, r, sums)
  }
}

// Blurs `data` (RGBA) in place.
export function blurPixels(data: Uint8ClampedArray, width: number, height: number, sigma: number): void {
  const radii = boxRadii(sigma)
  if (radii.every((r) => r < 1)) return
  const values = premultiplied(data)
  blurFloats(values, width, height, radii)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = values[i + 3]
    const k = alpha > 0.01 ? 255 / alpha : 0
    data[i] = values[i] * k
    data[i + 1] = values[i + 1] * k
    data[i + 2] = values[i + 2] * k
    data[i + 3] = alpha
  }
}

// How strongly Sharpen pushes edges apart.
export function sharpenAmount(a: Adjustments): number {
  return a.sharpen * 1.6
}

// Makes edges crisper by pushing each pixel away from a blurred copy of itself (`soft`, the same
// size). How see-through each pixel is stays the same.
export function sharpenWith(data: Uint8ClampedArray, soft: Uint8ClampedArray, amount: number): void {
  if (amount <= 0) return
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] += amount * (data[i] - soft[i])
    data[i + 1] += amount * (data[i + 1] - soft[i + 1])
    data[i + 2] += amount * (data[i + 2] - soft[i + 2])
  }
}

// Every adjustment, in place, in the order they're applied: blur, sharpen, then colors. `size` is
// the design's longer side in these pixels' scale.
export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, a: Adjustments, size: number): void {
  const sigma = blurSigma(a.blur, size)
  if (sigma >= 0.3) blurPixels(data, width, height, sigma)
  if (a.sharpen > 0) {
    const soft = data.slice()
    blurPixels(soft, width, height, sharpenSigma(size))
    sharpenWith(data, soft, sharpenAmount(a))
  }
  if (changesColors(a)) adjustColors(data, a)
}
