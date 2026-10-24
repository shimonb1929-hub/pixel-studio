import { live, msg, t } from '../i18n/i18n.ts'
import type { Rect } from './geometry.ts'
// Light, color and detail adjustments: the math, done on plain RGBA pixel arrays so it can be
// tested without a browser. Most change each pixel on its own; blur, sharpen and the light of dark
// and bright parts look at the pixels around it; dark corners and grain depend on where it is.

// The sliders, in the order they're shown. Values are -1 to 1 (0 changes nothing), except blur,
// sharpen and grain, which are 0 to 1.
export const SLIDER_KEYS = [
  'brightness',
  'contrast',
  // Only the bright parts, or only the dark parts.
  'highlights',
  'shadows',
  // The very brightest and very darkest parts.
  'whites',
  'blacks',
  // Color strength: -1 is black and white.
  'saturation',
  // Like color strength, but mostly for dull colors.
  'vibrance',
  // Positive is warmer (more orange), negative is cooler (more blue).
  'warmth',
  // Positive is more pink, negative more green.
  'tint',
  'sharpen',
  // Detail and texture in the middle tones; negative softens them.
  'clarity',
  'blur',
  // Positive darkens the corners, negative lightens them.
  'vignette',
  'grain',
] as const

export type AdjustmentKey = (typeof SLIDER_KEYS)[number]

// The color families "Change one color" works on, around the color wheel.
export const COLOR_RANGES = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'] as const
export type ColorRange = (typeof COLOR_RANGES)[number]
// Where each family sits on the color wheel, in degrees.
export const COLOR_RANGE_HUES: Record<ColorRange, number> = { red: 0, orange: 30, yellow: 58, green: 115, aqua: 180, blue: 222, purple: 272, pink: 322 }

// How one color family changes, each -1 to 1: its shade (turned toward its neighbors on the color
// wheel), how strong it is, and how light it is.
export interface ColorChange {
  hue: number
  strength: number
  light: number
}
export type ColorChanges = Partial<Record<ColorRange, ColorChange>>

// A light curve: points from the darkest (x 0) to the brightest (x 1) tones, each saying how light
// that tone becomes (y, 0 to 1). The line runs smoothly through them.
export type CurvePoint = [number, number]
export const CURVE_CHANNELS = ['all', 'red', 'green', 'blue'] as const
export type CurveChannel = (typeof CURVE_CHANNELS)[number]
export type ToneCurves = Partial<Record<CurveChannel, CurvePoint[]>>

export type Adjustments = Record<AdjustmentKey, number> & {
  // Only the families that change are listed.
  colors?: ColorChanges
  // Only the curves that aren't a straight line are listed.
  curve?: ToneCurves
}

export const NO_ADJUSTMENTS: Adjustments = Object.fromEntries(SLIDER_KEYS.map((key) => [key, 0])) as unknown as Adjustments

// Each name is in everyday words; the help guide also gives the word professionals use.
export const ADJUSTMENT_NAMES: Record<AdjustmentKey, string> = live({
  brightness: msg('Brightness'),
  contrast: msg('Contrast'),
  highlights: msg('Bright parts'),
  shadows: msg('Dark parts'),
  whites: msg('Whitest parts'),
  blacks: msg('Darkest parts'),
  saturation: msg('Color strength'),
  vibrance: msg('Gentle color boost'),
  warmth: msg('Warmth'),
  tint: msg('Green or pink'),
  sharpen: msg('Sharpen'),
  clarity: msg('Clear details'),
  blur: msg('Blur'),
  vignette: msg('Dark corners'),
  grain: msg('Film grain'),
})

// Sliders that go both ways start in the middle; blur, sharpen and grain start at the left.
export const TWO_WAY: Record<AdjustmentKey, boolean> = {
  ...(Object.fromEntries(SLIDER_KEYS.map((key) => [key, true])) as Record<AdjustmentKey, boolean>),
  blur: false,
  sharpen: false,
  grain: false,
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
export const LOOKS: Look[] = live([
  look('original', msg('Original'), msg('No changes. Puts every slider back to the middle.'), ['original', 'none', 'reset', 'normal'], {}),
  look('mono', msg('Black & white'), msg('Takes away all color, with a little extra contrast.'), ['black and white', 'grayscale', 'greyscale', 'gray', 'mono', 'no color'], {
    saturation: -1,
    contrast: 0.12,
  }),
  look('old', msg('Old photo'), msg('Brown and faded, like a photo from long ago.'), ['sepia', 'old', 'vintage', 'retro', 'antique', 'brown'], {
    saturation: -1,
    warmth: 0.75,
    contrast: -0.12,
    brightness: 0.06,
  }),
  look('vivid', msg('Vivid'), msg('Brighter, bolder colors that stand out.'), ['vivid', 'colorful', 'bold', 'pop', 'saturated', 'bright colors'], {
    saturation: 0.45,
    contrast: 0.15,
  }),
  look('warm', msg('Warm'), msg('A golden, sunny glow.'), ['warm', 'sunny', 'golden', 'orange', 'summer'], { warmth: 0.45, saturation: 0.1, brightness: 0.04 }),
  look('cool', msg('Cool'), msg('A fresh, bluish feel.'), ['cool', 'cold', 'blue', 'winter', 'icy'], { warmth: -0.45, saturation: -0.05 }),
  look('soft', msg('Soft'), msg('Lighter and gentler, with calm colors.'), ['soft', 'faded', 'pastel', 'light', 'gentle', 'matte'], {
    contrast: -0.28,
    brightness: 0.12,
    saturation: -0.2,
  }),
  look('dramatic', msg('Dramatic'), msg('Strong darks and lights, with quieter colors.'), ['dramatic', 'moody', 'dark', 'strong', 'intense'], {
    contrast: 0.5,
    saturation: -0.3,
    brightness: -0.06,
  }),
  look('dreamy', msg('Dreamy'), msg('Soft focus and light, like a dream.'), ['dreamy', 'dream', 'glow', 'hazy', 'soft focus'], {
    blur: 0.22,
    brightness: 0.14,
    contrast: -0.18,
  }),
])

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6

export function isStraightCurve(points: CurvePoint[] | undefined): boolean {
  return !points || points.every(([x, y]) => same(x, y))
}

function isNoColorChange(change: ColorChange | undefined): boolean {
  return !change || (same(change.hue, 0) && same(change.strength, 0) && same(change.light, 0))
}

// The same settings without color families that don't change or curves that are straight, so
// settings that look the same are the same.
export function tidyAdjustments(a: Adjustments): Adjustments {
  const { colors, curve, ...sliders } = a
  const out: Adjustments = { ...sliders }
  const changedColors = COLOR_RANGES.filter((range) => !isNoColorChange(colors?.[range]))
  if (changedColors.length) out.colors = Object.fromEntries(changedColors.map((range) => [range, colors![range]]))
  const bentCurves = CURVE_CHANNELS.filter((channel) => !isStraightCurve(curve?.[channel]))
  if (bentCurves.length) out.curve = Object.fromEntries(bentCurves.map((channel) => [channel, curve![channel]]))
  return out
}

export function hasColorChanges(a: Adjustments): boolean {
  return COLOR_RANGES.some((range) => !isNoColorChange(a.colors?.[range]))
}

export function hasCurve(a: Adjustments): boolean {
  return CURVE_CHANNELS.some((channel) => !isStraightCurve(a.curve?.[channel]))
}

function sameCurve(a: CurvePoint[] | undefined, b: CurvePoint[] | undefined): boolean {
  if (isStraightCurve(a) || isStraightCurve(b)) return isStraightCurve(a) && isStraightCurve(b)
  return a!.length === b!.length && a!.every(([x, y], i) => same(x, b![i][0]) && same(y, b![i][1]))
}

export function sameAdjustments(a: Adjustments, b: Adjustments): boolean {
  if (!SLIDER_KEYS.every((key) => same(a[key], b[key]))) return false
  const zero = { hue: 0, strength: 0, light: 0 }
  for (const range of COLOR_RANGES) {
    const x = a.colors?.[range] ?? zero
    const y = b.colors?.[range] ?? zero
    if (!same(x.hue, y.hue) || !same(x.strength, y.strength) || !same(x.light, y.light)) return false
  }
  return CURVE_CHANNELS.every((channel) => sameCurve(a.curve?.[channel], b.curve?.[channel]))
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
  if (chosen && chosen.id !== 'original') return t('{look} look', { look: chosen.name })
  const changed: string[] = SLIDER_KEYS.filter((key) => a[key] !== 0).map((key) => ADJUSTMENT_NAMES[key])
  if (hasColorChanges(a)) changed.push(t('Change one color'))
  if (hasCurve(a)) changed.push(t('Light curve'))
  return changed.length === 1 ? changed[0] : t('Adjust colors')
}

// What has been changed, in a word or two: "Black & white", "Brightness" or "Adjust colors".
export function adjustmentName(a: Adjustments): string {
  const chosen = matchingLook(a)
  if (chosen && chosen.id !== 'original') return chosen.name
  return adjustmentLabel(a)
}

// What a slider's value means, in everyday words.
export function describeAdjustment(key: AdjustmentKey, value: number): string {
  const amount = Math.abs(value)
  const tier = amount < 0.005 ? 0 : amount < 0.3 ? 1 : amount < 0.7 ? 2 : 3
  const up = value > 0
  const none = t('No change.')
  const words: Record<AdjustmentKey, () => [string, string[], string[]]> = {
    brightness: () => [none, [t('A little lighter.'), t('Lighter.'), t('Much lighter.')], [t('A little darker.'), t('Darker.'), t('Much darker.')]],
    contrast: () => [
      none,
      [t('A little more punch.'), t('Darks darker and lights lighter.'), t('Very strong: details may get lost in the darks and lights.')],
      [t('A little gentler.'), t('Softer and flatter.'), t('Very flat and gray.')],
    ],
    highlights: () => [
      none,
      [t('Bright parts a little brighter.'), t('Brighter bright parts.'), t('Much brighter bright parts: the sky may turn white.')],
      [t('Bright parts a little calmer.'), t('Calmer bright parts: more detail in the sky.'), t('Much calmer bright parts.')],
    ],
    shadows: () => [
      none,
      [t('Dark parts a little lighter.'), t('Lighter dark parts: more detail shows.'), t('Much lighter dark parts.')],
      [t('Dark parts a little deeper.'), t('Deeper dark parts.'), t('Much deeper dark parts.')],
    ],
    whites: () => [
      none,
      [t('Whites a little brighter.'), t('Brighter whites.'), t('Very bright whites: some may turn pure white.')],
      [t('Whites a little dimmer.'), t('Dimmer whites.'), t('Much dimmer whites, a little gray.')],
    ],
    blacks: () => [
      none,
      [t('Blacks a little lifted.'), t('Lifted, faded blacks.'), t('Very faded blacks, almost gray.')],
      [t('Blacks a little deeper.'), t('Deeper blacks.'), t('Very deep blacks: some may turn pure black.')],
    ],
    saturation: () => [
      none,
      [t('A little more colorful.'), t('More colorful.'), t('Very bold colors.')],
      [t('A little less colorful.'), t('Faded colors.'), amount >= 0.995 ? t('Black and white.') : t('Almost no color.')],
    ],
    vibrance: () => [
      none,
      [t('Dull colors a little livelier.'), t('Livelier dull colors.'), t('Very lively colors.')],
      [t('A little calmer colors.'), t('Calmer colors.'), t('Very calm, quiet colors.')],
    ],
    warmth: () => [none, [t('A little warmer.'), t('Warmer and more golden.'), t('Very warm and orange.')], [t('A little cooler.'), t('Cooler and more blue.'), t('Very cool and blue.')]],
    tint: () => [none, [t('A little more pink.'), t('More pink.'), t('Very pink.')], [t('A little more green.'), t('More green.'), t('Very green.')]],
    sharpen: () => [t('No extra sharpening.'), [t('Crisper details.'), t('Much crisper details.'), t('Very crisp. Edges may start to look rough.')], []],
    clarity: () => [
      none,
      [t('Details a little clearer.'), t('Clearer details and texture.'), t('Very clear, gritty details.')],
      [t('Details a little softer.'), t('Softer, glowing details.'), t('Very soft and dreamy.')],
    ],
    blur: () => [t('Sharp, as it is.'), [t('Slightly soft.'), t('Blurry.'), t('Very blurry.')], []],
    vignette: () => [
      none,
      [t('Corners a little darker.'), t('Dark corners.'), t('Very dark corners.')],
      [t('Corners a little lighter.'), t('Light corners.'), t('Very light, white corners.')],
    ],
    grain: () => [t('No grain.'), [t('A little grain, like film.'), t('Grainy, like old film.'), t('Very grainy.')], []],
  }
  const [nothing, more, less] = words[key]()
  if (tier === 0) return nothing
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

// The light of dark parts, bright parts and clear details depends on how light a pixel's
// surroundings are, this far around it (in the pixels being worked on).
export function localSigma(size: number): number {
  return Math.max(2, size * 0.012)
}

function changesLocalLight(a: Adjustments): boolean {
  return a.highlights !== 0 || a.shadows !== 0 || a.clarity !== 0
}

// How far past the changed pixels an adjustment needs to look, beyond how far it reaches.
export function adjustmentLookAround(a: Adjustments, size: number): number {
  return changesLocalLight(a) ? Math.ceil(3 * localSigma(size)) : 0
}

// Whether adjustColors has anything to do.
export function changesColors(a: Adjustments): boolean {
  return (
    a.brightness !== 0 ||
    a.contrast !== 0 ||
    a.whites !== 0 ||
    a.blacks !== 0 ||
    a.saturation !== 0 ||
    a.vibrance !== 0 ||
    a.warmth !== 0 ||
    a.tint !== 0 ||
    hasColorChanges(a) ||
    hasCurve(a)
  )
}

// Whether anything is left to do after blur and sharpen.
export function changesAfterDetail(a: Adjustments): boolean {
  return changesColors(a) || changesLocalLight(a) || a.vignette !== 0 || a.grain !== 0
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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function smoothstep(from: number, to: number, x: number): number {
  const k = clamp01((x - from) / (to - from))
  return k * k * (3 - 2 * k)
}

// A light curve as a table of 256 tones (0 to 1). The line runs smoothly through every point
// without overshooting them, and stays flat past the first and last points.
export function curveTable(points: CurvePoint[]): Float32Array {
  const table = new Float32Array(256)
  const pts = [...points].sort((p, q) => p[0] - q[0])
  const n = pts.length
  if (n === 0) {
    for (let i = 0; i < 256; i++) table[i] = i / 255
    return table
  }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => clamp01(p[1]))
  // How steep the line is at each point (Fritsch and Carlson's way, so it never wobbles).
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) slopes.push(xs[i + 1] - xs[i] > 1e-6 ? (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) : 0)
  const m = xs.map((_, i) => {
    if (n === 1) return 0
    if (i === 0) return slopes[0]
    if (i === n - 1) return slopes[n - 2]
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2
  })
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / slopes[i]
    const b = m[i + 1] / slopes[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      m[i] = k * a * slopes[i]
      m[i + 1] = k * b * slopes[i]
    }
  }
  let seg = 0
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    if (x <= xs[0]) table[i] = ys[0]
    else if (x >= xs[n - 1]) table[i] = ys[n - 1]
    else {
      while (seg < n - 2 && x > xs[seg + 1]) seg++
      const w = xs[seg + 1] - xs[seg]
      const u = (x - xs[seg]) / w
      const u2 = u * u
      const u3 = u2 * u
      table[i] = clamp01(
        (2 * u3 - 3 * u2 + 1) * ys[seg] + (u3 - 2 * u2 + u) * w * m[seg] + (-2 * u3 + 3 * u2) * ys[seg + 1] + (u3 - u2) * w * m[seg + 1],
      )
    }
  }
  return table
}

// Whites (-1 to 1) at tone x: more makes bright tones brighter (the brightest turn pure white),
// less makes the brightest dimmer. Blacks are the same, the other way up.
function whitesAt(x: number, whites: number): number {
  return whites >= 0 ? x * (1 + 0.8 * whites * x) : x * (1 + 0.3 * whites * x * x)
}

function lookUp(table: Float32Array, x: number): number {
  const at = clamp01(x) * 255
  const i = Math.min(254, Math.floor(at))
  return table[i] + (table[i + 1] - table[i]) * (at - i)
}

// Tables for red, green and blue (0 to 255, with fractions): brightness, contrast, whites, blacks
// and the light curves.
export function channelTables(a: Adjustments): Float32Array[] {
  const gamma = Math.pow(2, -1.25 * a.brightness)
  const spread = a.contrast >= 0 ? 1 + 2 * a.contrast : 1 + 0.85 * a.contrast
  const curve = (points: CurvePoint[] | undefined) => (isStraightCurve(points) ? null : curveTable(points!))
  const all = curve(a.curve?.all)
  return [a.curve?.red, a.curve?.green, a.curve?.blue].map((points) => {
    const own = curve(points)
    const table = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      let x = clamp01((Math.pow(i / 255, gamma) - 0.5) * spread + 0.5)
      // Whites stretch or squeeze the bright tones and blacks the dark ones, most at their own end.
      x = clamp01(whitesAt(x, a.whites))
      x = 1 - clamp01(whitesAt(1 - x, -a.blacks))
      if (all) x = lookUp(all, x)
      if (own) x = lookUp(own, x)
      table[i] = x * 255
    }
    return table
  })
}

// Each color family's change, as hue, strength and light, one after another in COLOR_RANGES order.
function colorChangeList(a: Adjustments): Float32Array {
  const list = new Float32Array(COLOR_RANGES.length * 3)
  COLOR_RANGES.forEach((range, i) => {
    const change = a.colors?.[range]
    if (!change) return
    list[i * 3] = change.hue
    list[i * 3 + 1] = change.strength
    list[i * 3 + 2] = change.light
  })
  return list
}

const RANGE_HUES = COLOR_RANGES.map((range) => COLOR_RANGE_HUES[range])

// How much a hue (degrees) belongs to each color family: two neighbors share it, adding up to one.
export function colorRangeWeights(hue: number): { first: number; second: number; mix: number } {
  const h = ((hue % 360) + 360) % 360
  const count = RANGE_HUES.length
  for (let i = 0; i < count; i++) {
    const from = RANGE_HUES[i]
    const to = i === count - 1 ? RANGE_HUES[0] + 360 : RANGE_HUES[i + 1]
    const at = h < from ? h + 360 : h
    if (at >= from && at < to) {
      const u = (at - from) / (to - from)
      return { first: i, second: (i + 1) % count, mix: u * u * (3 - 2 * u) }
    }
  }
  return { first: 0, second: 1, mix: 0 }
}

function hueToChannel(p: number, q: number, h: number): number {
  if (h < 0) h += 1
  if (h > 1) h -= 1
  if (h < 1 / 6) return p + (q - p) * 6 * h
  if (h < 1 / 2) return q
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6
  return p
}

// Changes one pixel's color family (`rgb`, 0 to 255, changed in place).
function changeOneColor(rgb: Float32Array, list: Float32Array): void {
  const r = clamp01(rgb[0] / 255)
  const g = clamp01(rgb[1] / 255)
  const b = clamp01(rgb[2] / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma < 1e-3) return
  let l = (max + min) / 2
  let s = l > 0.5 ? chroma / (2 - max - min) : chroma / (max + min)
  let h = max === r ? (g - b) / chroma + (g < b ? 6 : 0) : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4
  h *= 60
  const { first, second, mix } = colorRangeWeights(h)
  const pick = (k: number) => list[first * 3 + k] * (1 - mix) + list[second * 3 + k] * mix
  const dh = pick(0)
  const ds = pick(1)
  const dl = pick(2)
  if (dh === 0 && ds === 0 && dl === 0) return
  // Nearly gray pixels have hardly any color to change.
  const colorful = Math.min(1, chroma * 3)
  h = (h + dh * 30 * colorful) / 360
  s = clamp01(ds > 0 ? s * (1 + 1.2 * ds * colorful) : s * (1 + ds * colorful))
  l = dl > 0 ? l + (1 - l) * dl * 0.55 * colorful : l * (1 + dl * 0.55 * colorful)
  if (s === 0) {
    rgb[0] = rgb[1] = rgb[2] = l * 255
    return
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  rgb[0] = hueToChannel(p, q, h + 1 / 3) * 255
  rgb[1] = hueToChannel(p, q, h) * 255
  rgb[2] = hueToChannel(p, q, h - 1 / 3) * 255
}

// Brightness, contrast, whites, blacks, light curves, one color, color strength, warmth and green or
// pink, changing `data` (RGBA) in place.
export function adjustColors(data: Uint8ClampedArray, a: Adjustments): void {
  const [redTone, greenTone, blueTone] = channelTables(a)
  const strength = a.saturation >= 0 ? 1 + 1.2 * a.saturation : 1 + a.saturation
  const vibrance = a.vibrance
  const colors = hasColorChanges(a) ? colorChangeList(a) : null
  const rgb = new Float32Array(3)
  // Color strength comes before warmth, so a warm tint survives black and white (that's "Old photo").
  const red = (1 + 0.22 * a.warmth) * (1 + 0.05 * a.tint)
  const green = 1 - 0.14 * a.tint
  const blue = (1 - 0.22 * a.warmth) * (1 + 0.05 * a.tint)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = redTone[data[i]]
    let g = greenTone[data[i + 1]]
    let b = blueTone[data[i + 2]]
    // One color comes before color strength, so in black and white it lightens or darkens just
    // that color's parts.
    if (colors) {
      rgb[0] = r
      rgb[1] = g
      rgb[2] = b
      changeOneColor(rgb, colors)
      r = rgb[0]
      g = rgb[1]
      b = rgb[2]
    }
    let k = strength
    if (vibrance !== 0) {
      const max = Math.max(r, g, b)
      const dull = max > 0 ? 1 - (max - Math.min(r, g, b)) / max : 1
      // A gentle boost goes mostly to dull colors; a gentle calm reaches every color.
      k *= vibrance > 0 ? 1 + 1.4 * vibrance * dull * dull : 1 + 0.8 * vibrance
    }
    if (k !== 1) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = gray + (r - gray) * k
      g = gray + (g - gray) * k
      b = gray + (b - gray) * k
    }
    data[i] = r * red
    data[i + 1] = g * green
    data[i + 2] = b * blue
  }
}

// How light the surroundings of each pixel are (0 to 1), from each pixel's lightness `light`. See-
// through pixels don't count, so a photo's edge isn't darkened by the emptiness beyond it.
function surroundingLight(light: Float32Array, data: Uint8ClampedArray, width: number, height: number, sigma: number): Float32Array {
  // Surroundings change slowly, so they're worked out on a smaller copy, which is far quicker.
  const step = Math.max(1, Math.floor(sigma / 3))
  const sw = Math.ceil(width / step)
  const sh = Math.ceil(height / step)
  const small = new Float32Array(sw * sh * 4)
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / step) * sw
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const alpha = data[p * 4 + 3] / 255
      const o = (row + Math.floor(x / step)) * 4
      small[o] += light[p] * alpha
      small[o + 1] += alpha
    }
  }
  blurFloats(small, sw, sh, boxRadii(sigma / step))
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / step - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(sh - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / step - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(sw - 1, x0 + 1)
      const tx = fx - x0
      const at = (cx: number, cy: number, k: number) => small[(cy * sw + cx) * 4 + k]
      const blend = (k: number) => (at(x0, y0, k) * (1 - tx) + at(x1, y0, k) * tx) * (1 - ty) + (at(x0, y1, k) * (1 - tx) + at(x1, y1, k) * tx) * ty
      const weight = blend(1)
      const p = y * width + x
      out[p] = weight > 1e-4 ? blend(0) / weight : light[p]
    }
  }
  return out
}

// Dark parts, bright parts and clear details, changing `data` (RGBA) in place. Each pixel's light
// changes by how light it and its surroundings are, so a dark face in a bright scene gets lighter
// without the whole picture going flat. `size` is the design's longer side in these pixels.
export function adjustLocalLight(data: Uint8ClampedArray, width: number, height: number, a: Adjustments, size: number): void {
  if (!changesLocalLight(a)) return
  const light = new Float32Array(width * height)
  for (let p = 0; p < light.length; p++) light[p] = (0.2126 * data[p * 4] + 0.7152 * data[p * 4 + 1] + 0.0722 * data[p * 4 + 2]) / 255
  const around = surroundingLight(light, data, width, height, localSigma(size))
  const shadowGamma = Math.pow(2, -a.shadows)
  const highlightGamma = Math.pow(2, a.highlights)
  const clarity = a.clarity * (a.clarity > 0 ? 1.3 : 0.9)
  for (let p = 0; p < light.length; p++) {
    const i = p * 4
    if (data[i + 3] === 0) continue
    const l = light[p]
    const base = 0.35 * l + 0.65 * around[p]
    let target = l
    if (a.shadows !== 0) target += (1 - smoothstep(0.08, 0.62, base)) * (Math.pow(l, shadowGamma) - l)
    if (a.highlights !== 0) target += smoothstep(0.38, 0.92, base) * (1 - Math.pow(1 - l, highlightGamma) - l)
    // Clear details push each pixel away from its surroundings, mostly in the middle tones.
    if (clarity !== 0) target += clarity * (l - around[p]) * (1 - (2 * l - 1) * (2 * l - 1))
    target = clamp01(target)
    const goal = target * 255
    if (l < 0.002) {
      data[i] = data[i + 1] = data[i + 2] = goal
      continue
    }
    const ratio = target / l
    let r = data[i] * ratio
    let g = data[i + 1] * ratio
    let b = data[i + 2] * ratio
    // Too bright a color for the screen loses some color instead of changing shade.
    const max = Math.max(r, g, b)
    if (max > 255) {
      const k = (255 - goal) / (max - goal)
      r = goal + (r - goal) * k
      g = goal + (g - goal) * k
      b = goal + (b - goal) * k
    }
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

// Where the pixels being worked on sit in the design: pixel (0, 0) is at design point (x, y), and
// there are `scale` of them per design pixel. `frame` is the photo (or selected part) in design
// pixels, for dark corners; `size` is the design's longer side, for the size of the grain.
export interface PixelPlace {
  x: number
  y: number
  scale: number
  frame: Rect
  size: number
}

// A number from -1 to 1 for every whole-number spot, always the same for the same spot.
function noiseAt(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h & 0xffff) / 0xffff) * 2 - 1
}

// Smooth noise between those spots.
function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const top = noiseAt(ix, iy) * (1 - fx) + noiseAt(ix + 1, iy) * fx
  const bottom = noiseAt(ix, iy + 1) * (1 - fx) + noiseAt(ix + 1, iy + 1) * fx
  return top * (1 - fy) + bottom * fy
}

// How big one grain is, in design pixels: about the same share of any design.
export function grainSize(size: number): number {
  return Math.max(0.8, size / 1500)
}

// Dark (or light) corners and film grain, changing `data` (RGBA) in place. The grain is tied to
// spots in the design, so a preview and the finished picture show the same grain.
export function finishPixels(data: Uint8ClampedArray, width: number, height: number, a: Adjustments, place: PixelPlace): void {
  if (a.vignette === 0 && a.grain === 0) return
  const { frame, scale } = place
  const cx = frame.x + frame.width / 2
  const cy = frame.y + frame.height / 2
  const hw = Math.max(1e-6, frame.width / 2)
  const hh = Math.max(1e-6, frame.height / 2)
  const cell = grainSize(place.size)
  const vignette = 0.85 * a.vignette
  const grain = 40 * a.grain
  for (let y = 0; y < height; y++) {
    const dy = place.y + (y + 0.5) / scale
    const ny = (dy - cy) / hh
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] === 0) continue
      const dx = place.x + (x + 0.5) / scale
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      if (vignette !== 0) {
        const nx = (dx - cx) / hw
        // 0 in the middle, 1 in the corners.
        const w = smoothstep(0.3, 1, Math.sqrt((nx * nx + ny * ny) / 2))
        if (vignette > 0) {
          const k = 1 - vignette * w
          r *= k
          g *= k
          b *= k
        } else {
          const k = -vignette * w
          r += (255 - r) * k
          g += (255 - g) * k
          b += (255 - b) * k
        }
      }
      if (grain !== 0) {
        const gx = dx / cell
        const gy = dy / cell
        const noise = 0.75 * smoothNoise(gx, gy) + 0.4 * smoothNoise(gx * 2.13 + 17.3, gy * 2.13 + 41.9)
        // Grain shows most in the middle tones, as on film.
        const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const amount = noise * grain * (1 - 0.6 * Math.abs(2 * light - 1))
        r += amount
        g += amount
        b += amount
      }
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
  }
}

// Everything after blur and sharpen, in place: the light of dark and bright parts, colors, then
// corners and grain. `size` is the design's longer side in these pixels.
export function adjustToneAndColor(data: Uint8ClampedArray, width: number, height: number, a: Adjustments, size: number, place?: PixelPlace): void {
  adjustLocalLight(data, width, height, a, size)
  if (changesColors(a)) adjustColors(data, a)
  finishPixels(data, width, height, a, place ?? { x: 0, y: 0, scale: 1, frame: { x: 0, y: 0, width, height }, size: Math.max(width, height) })
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

// Every adjustment, in place, in the order they're applied: blur, sharpen, then light and colors.
// `size` is the design's longer side in these pixels' scale.
export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, a: Adjustments, size: number, place?: PixelPlace): void {
  const sigma = blurSigma(a.blur, size)
  if (sigma >= 0.3) blurPixels(data, width, height, sigma)
  if (a.sharpen > 0) {
    const soft = data.slice()
    blurPixels(soft, width, height, sharpenSigma(size))
    sharpenWith(data, soft, sharpenAmount(a))
  }
  adjustToneAndColor(data, width, height, a, size, place)
}

// What "Fix light" sets, from a picture's pixels (a small copy is plenty): the overall light toward
// the middle, big dark areas opened up and big bright areas calmed, and the darkest and brightest
// tones stretched toward black and white. Only those sliders, so the others stay as they are.
export function autoLight(data: Uint8ClampedArray): Partial<Adjustments> {
  const counts = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    counts[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++
    total++
  }
  if (total < 16) return {}
  const tone = (share: number) => {
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += counts[v]
      if (seen >= share * total) return v / 255
    }
    return 1
  }
  // The overall light moves gently toward the middle, judged by the average tone.
  let sum = 0
  for (let v = 0; v < 256; v++) sum += counts[v] * v
  const average = sum / total / 255
  // How much of the photo is in a range of tones, and how light that part is on average (after
  // `gamma`, the change brightness makes).
  const part = (from: number, to: number, gamma = 1) => {
    let count = 0
    let tones = 0
    for (let v = Math.round(from * 255); v <= Math.round(to * 255); v++) {
      count += counts[v]
      tones += counts[v] * v
    }
    return { share: count / total, average: count ? Math.pow(tones / count / 255, gamma) : 0 }
  }
  let brightness = 0
  if (average > 0.02 && average < 0.98) brightness = (-Math.log2(Math.log(0.46) / Math.log(average)) / 1.25) * 0.6
  // A photo with big dark areas is never made darker, nor one with big bright areas lighter:
  // opening up the dark parts or calming the bright ones does that job better.
  if (brightness < 0 && part(0, 0.3).share > 0.22) brightness = 0
  if (brightness > 0 && part(0.8, 1).share > 0.22) brightness = 0
  brightness = Math.max(-0.25, Math.min(0.45, brightness))
  const gamma = Math.pow(2, -1.25 * brightness)
  const dark = part(0, 0.3, gamma)
  const bright = part(0.8, 1, gamma)
  // Big dark areas are opened up, more the darker they are; big bright areas are calmed.
  const shadows = dark.share > 0.15 ? Math.min(0.7, ((0.32 - dark.average) / 0.32) * Math.min(1, (dark.share - 0.15) * 3.5) * 1.1) : 0
  const highlights = bright.share > 0.15 ? -Math.min(0.6, ((bright.average - 0.8) / 0.2) * Math.min(1, (bright.share - 0.15) * 3.5) * 0.6) : 0
  const darkest = Math.pow(tone(0.005), gamma)
  const brightest = Math.pow(tone(0.995), gamma)
  // The whites and blacks that take the brightest tone to nearly white and the darkest to nearly
  // black (see whitesAt), the blacks only halfway, so dark parts keep their detail.
  const whites = brightest < 0.96 && brightest > 0.05 ? Math.min(1, (0.98 / brightest - 1) / brightest / 0.8) : 0
  const lift = 1 - darkest
  const blacks = darkest > 0.04 && lift > 0.05 ? -Math.min(0.6, ((0.985 / lift - 1) / lift / 0.8) * 0.5) : 0
  const round = (x: number) => Math.round(x * 100) / 100 || 0
  return { brightness: round(brightness), whites: round(whites), blacks: round(blacks), shadows: round(shadows), highlights: round(highlights) }
}

// What "Fix colors" sets: warmth and green or pink that take away a color cast, judged mostly from
// the parts that are nearly gray (they should look gray). Gentle, so it never overdoes it.
export function autoColor(data: Uint8ClampedArray): Partial<Adjustments> {
  let red = 0
  let green = 0
  let blue = 0
  let weights = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if (light < 0.08 || light > 0.97) continue
    const max = Math.max(r, g, b)
    const dull = 1 - (max - Math.min(r, g, b)) / max
    const w = dull * dull * dull
    red += r * w
    green += g * w
    blue += b * w
    weights += w
  }
  if (weights < 1) return {}
  const clamp = (x: number) => Math.round(Math.max(-0.7, Math.min(0.7, x)) * 100) / 100 || 0
  const warmth = clamp(((blue - red) / (0.22 * (red + blue))) * 0.8)
  const middle = (red * (1 + 0.22 * warmth) + blue * (1 - 0.22 * warmth)) / 2
  const tint = clamp(((green - middle) / (0.14 * green + 0.05 * middle)) * 0.8)
  return { warmth, tint }
}
