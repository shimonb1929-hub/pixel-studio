import { channelTables, NO_ADJUSTMENTS, type Adjustments, type CurvePoint } from './adjust.ts'

// Match colors (what professionals call Match Color): makes one photo take on the light and colors
// of another. For red, green and blue on their own, the tones of the photo are moved to where the
// same share of the other photo's pixels sits ("histogram matching"): if a tenth of the other
// photo's blue is darker than 30%, a tenth of this photo's blue becomes darker than 30% too. The
// result is three ordinary light curves, so every point stays changeable afterwards, plus a little
// color strength when the other photo is more (or less) colorful.

// How far along the tones each curve point sits: the darkest bit, the quarters and the brightest
// bit. With the two ends, that's seven points.
const SHARES = [0.02, 0.25, 0.5, 0.75, 0.98]

// Curves never get steeper or flatter than this, so a dull photo isn't stretched into noise and
// nothing is squeezed into one flat color.
const MIN_SLOPE = 0.25
const MAX_SLOPE = 4

// Pixels this see-through or more don't count.
const SOLID = 128

// How many of a picture's (RGBA) solid pixels have each value, for red, green and blue.
export function channelCounts(data: Uint8ClampedArray): { counts: Uint32Array[]; total: number } {
  const counts = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < SOLID) continue
    counts[0][data[i]]++
    counts[1][data[i + 1]]++
    counts[2][data[i + 2]]++
    total++
  }
  return { counts, total }
}

// The tone (0 to 1) that `share` of the pixels are darker than, read smoothly between values.
export function toneAt(counts: Uint32Array, total: number, share: number): number {
  const goal = share * total
  let seen = 0
  for (let v = 0; v < 256; v++) {
    const next = seen + counts[v]
    if (next >= goal && counts[v] > 0) return (v + (goal - seen) / counts[v] - 0.5) / 255
    seen = next
  }
  return 1
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

// One channel's curve: from this photo's tones to the other photo's at the same shares.
export function matchCurve(from: Uint32Array, to: Uint32Array, total: number, otherTotal: number): CurvePoint[] {
  const inner: CurvePoint[] = []
  for (const share of SHARES) {
    const x = clamp01(toneAt(from, total, share))
    const y = clamp01(toneAt(to, otherTotal, share))
    const previous = inner[inner.length - 1]
    // Tones this close together (a photo of few colors) would make the curve jump.
    if (previous && x - previous[0] < 0.01) continue
    inner.push([x, y])
  }
  // Never steeper or flatter than the limits, working out from the middle point.
  const middle = Math.floor(inner.length / 2)
  for (let i = middle + 1; i < inner.length; i++) {
    const dx = inner[i][0] - inner[i - 1][0]
    inner[i][1] = Math.min(inner[i - 1][1] + dx * MAX_SLOPE, Math.max(inner[i - 1][1] + dx * MIN_SLOPE, inner[i][1]))
  }
  for (let i = middle - 1; i >= 0; i--) {
    const dx = inner[i + 1][0] - inner[i][0]
    inner[i][1] = Math.max(inner[i + 1][1] - dx * MAX_SLOPE, Math.min(inner[i + 1][1] - dx * MIN_SLOPE, inner[i][1]))
  }
  // The ends carry on the way the curve runs near them (or straight, with only one point), so the
  // darkest and brightest tones keep their detail instead of going flat.
  const first = inner[0]
  const last = inner[inner.length - 1]
  const slopeAt = (a: CurvePoint, b: CurvePoint) => Math.min(MAX_SLOPE, Math.max(MIN_SLOPE, (b[1] - a[1]) / (b[0] - a[0])))
  const low = inner.length > 1 ? slopeAt(inner[0], inner[1]) : 1
  const high = inner.length > 1 ? slopeAt(inner[inner.length - 2], last) : 1
  const points: CurvePoint[] = []
  if (first[0] > 0.005) points.push([0, clamp01(first[1] - first[0] * low)])
  points.push(...inner)
  if (last[0] < 0.995) points.push([1, clamp01(last[1] + (1 - last[0]) * high)])
  return points.map(([x, y]) => [round(x), round(clamp01(y))])
}

const round = (x: number) => Math.round(x * 1000) / 1000

// How colorful a picture's solid pixels are on average: the gap between the strongest and weakest
// of red, green and blue, 0 to 1.
export function colorfulness(data: Uint8ClampedArray): number {
  let sum = 0
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < SOLID) continue
    sum += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
    total++
  }
  return total ? sum / total / 255 : 0
}

// The settings that make `photo` (RGBA, a small copy is plenty) look like `other`: red, green and
// blue light curves and color strength. `amount` (0 to 1) is how much: less moves every curve
// back toward a straight line. Only these settings, so the rest stay as they are (a light curve
// for all colors together is replaced, since it was made for the old colors). Empty when
// either picture has nothing solid to measure.
export function matchColors(photo: Uint8ClampedArray, other: Uint8ClampedArray, amount = 1): Partial<Adjustments> {
  const mine = channelCounts(photo)
  const theirs = channelCounts(other)
  if (mine.total < 16 || theirs.total < 16) return {}
  const k = clamp01(amount)
  const [red, green, blue] = [0, 1, 2].map((c) =>
    matchCurve(mine.counts[c], theirs.counts[c], mine.total, theirs.total).map(([x, y]): CurvePoint => [x, round(x + (y - x) * k)]),
  )
  const curve = { red, green, blue }
  // Matching each color on its own already brings most of the other photo's color strength along;
  // what's still missing is made up gently with color strength.
  const matched = photo.slice()
  const [r, g, b] = channelTables({ ...NO_ADJUSTMENTS, curve })
  for (let i = 0; i < matched.length; i += 4) {
    matched[i] = r[matched[i]]
    matched[i + 1] = g[matched[i + 1]]
    matched[i + 2] = b[matched[i + 2]]
  }
  const now = colorfulness(matched)
  const goal = colorfulness(other)
  let saturation = 0
  if (now > 0.01) {
    const ratio = goal / now
    // Color strength s makes colors 1 + 1.2 s times as strong (or 1 + s, below zero); half of
    // what's missing is plenty, and never too much either way.
    saturation = ratio >= 1 ? (ratio - 1) / 1.2 : ratio - 1
    saturation = Math.max(-0.4, Math.min(0.4, saturation * 0.5)) * k
  }
  return { curve, saturation: Math.round(saturation * 100) / 100 || 0 }
}
