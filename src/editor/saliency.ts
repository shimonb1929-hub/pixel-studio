import type { Pixels } from './straighten.ts'

// Smart crop (pro: Content-Aware Crop, auto reframe): finds the important part of a picture, so a
// crop frame or a photo inside a shape can start on it instead of on the plain middle. Plain code,
// no download, on a small copy of the picture: places full of detail, places whose color stands out
// from the rest, and a mild pull toward the middle (where people usually put the main thing).

// Pictures are looked at this small; it takes a few milliseconds.
export const SALIENCY_SIDE = 128

// Spots less important than this don't pull a crop toward them.
const FLOOR = 0.2

export interface SaliencyMap {
  width: number
  height: number
  // How important each spot is, 0 to 1.
  values: Float32Array
}

// Averages each value with its neighbors `radius` away, across and then down.
function blur(values: Float32Array<ArrayBuffer>, w: number, h: number, radius: number): Float32Array<ArrayBuffer> {
  if (radius < 1) return values
  const across = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let k = Math.max(0, x - radius); k <= Math.min(w - 1, x + radius); k++) {
        sum += values[y * w + k]
        n++
      }
      across[y * w + x] = sum / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let k = Math.max(0, y - radius); k <= Math.min(h - 1, y + radius); k++) {
        sum += across[k * w + x]
        n++
      }
      out[y * w + x] = sum / n
    }
  }
  return out
}

function normalize(values: Float32Array): Float32Array {
  let max = 0
  for (const v of values) if (v > max) max = v
  if (max > 0) for (let i = 0; i < values.length; i++) values[i] /= max
  return values
}

// How important each spot of the picture is. See-through spots don't count.
export function saliencyMap(pixels: Pixels): SaliencyMap {
  const { width: w, height: h, data } = pixels
  const size = w * h
  // Brightness and two color directions (red against green, yellow against blue), roughly how
  // eyes see color.
  let light = new Float32Array(size)
  let redGreen = new Float32Array(size)
  let yellowBlue = new Float32Array(size)
  const alpha = new Float32Array(size)
  let weight = 0
  let meanL = 0
  let meanA = 0
  let meanB = 0
  for (let p = 0; p < size; p++) {
    const r = data[p * 4]
    const g = data[p * 4 + 1]
    const b = data[p * 4 + 2]
    const a = data[p * 4 + 3] / 255
    light[p] = (r + g + b) / 3
    redGreen[p] = r - g
    yellowBlue[p] = (r + g) / 2 - b
    alpha[p] = a
    weight += a
    meanL += light[p] * a
    meanA += redGreen[p] * a
    meanB += yellowBlue[p] * a
  }
  if (weight > 0) {
    meanL /= weight
    meanA /= weight
    meanB /= weight
  }
  // A little softening, so single specks and noise don't count as detail or color.
  const soft = Math.max(1, Math.round(Math.max(w, h) / 100))
  light = blur(light, w, h, soft)
  redGreen = blur(redGreen, w, h, soft)
  yellowBlue = blur(yellowBlue, w, h, soft)

  // Color that stands out from the picture's average color.
  const distinct = new Float32Array(size)
  for (let p = 0; p < size; p++) {
    distinct[p] = Math.hypot(light[p] - meanL, (redGreen[p] - meanA) * 1.2, (yellowBlue[p] - meanB) * 1.2)
  }
  // Detail: how sharply the brightness changes, spread over the area around it.
  let detail = new Float32Array(size)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      const gx = light[p - w + 1] + 2 * light[p + 1] + light[p + w + 1] - light[p - w - 1] - 2 * light[p - 1] - light[p + w - 1]
      const gy = light[p + w - 1] + 2 * light[p + w] + light[p + w + 1] - light[p - w - 1] - 2 * light[p - w] - light[p - w + 1]
      detail[p] = Math.hypot(gx, gy)
    }
  }
  detail = blur(detail, w, h, Math.max(1, Math.round(Math.max(w, h) / 25)))
  normalize(distinct)
  normalize(detail)

  const values = new Float32Array(size)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      // 0 in the middle, 1 in the corners.
      const dx = (x + 0.5) / w - 0.5
      const dy = (y + 0.5) / h - 0.5
      const fromMiddle = (dx * dx + dy * dy) * 2
      values[p] = (0.6 * distinct[p] + 0.4 * detail[p]) * (1 - 0.3 * fromMiddle) * alpha[p]
    }
  }
  return { width: w, height: h, values: normalize(values) }
}

// A window over part of the map, in shares of its width and height (0 to 1).
export interface Window {
  x: number
  y: number
  width: number
  height: number
}

// Where a window of the given size (shares of the map) best sits so it holds the most important
// part, staying inside `within` (shares too; the whole map when left out). Among places that hold
// about as much, the one centered on the important part wins.
export function bestWindow(map: SaliencyMap, width: number, height: number, within: Window = { x: 0, y: 0, width: 1, height: 1 }): Window {
  const { width: w, height: h } = map
  // Only what clearly stands out counts, so a large plain area never outweighs the main thing.
  const values = map.values.map((v) => Math.max(0, v - FLOOR))
  // Running totals, so the sum inside any window is four lookups.
  const sums = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += values[y * w + x]
      sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row
    }
  }
  const total = (x0: number, y0: number, x1: number, y1: number) =>
    sums[y1 * (w + 1) + x1] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0] + sums[y0 * (w + 1) + x0]

  const left = Math.max(0, Math.round(within.x * w))
  const top = Math.max(0, Math.round(within.y * h))
  const right = Math.min(w, Math.round((within.x + within.width) * w))
  const bottom = Math.min(h, Math.round((within.y + within.height) * h))
  const ww = Math.max(1, Math.min(right - left, Math.round(width * w)))
  const wh = Math.max(1, Math.min(bottom - top, Math.round(height * h)))

  // The middle of what's important inside the allowed area: where the window is centered when
  // several places hold the same.
  let cx = 0
  let cy = 0
  let mass = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const v = values[y * w + x]
      cx += (x + 0.5) * v
      cy += (y + 0.5) * v
      mass += v
    }
  }
  if (mass > 0) {
    cx /= mass
    cy /= mass
  } else {
    cx = (left + right) / 2
    cy = (top + bottom) / 2
  }

  let best = -1
  const places: { x: number; y: number; sum: number }[] = []
  for (let y = top; y + wh <= bottom; y++) {
    for (let x = left; x + ww <= right; x++) {
      const sum = total(x, y, x + ww, y + wh)
      places.push({ x, y, sum })
      if (sum > best) best = sum
    }
  }
  let chosen = { x: left, y: top }
  let nearest = Infinity
  for (const place of places) {
    if (place.sum < best * 0.97) continue
    const distance = Math.hypot(place.x + ww / 2 - cx, place.y + wh / 2 - cy)
    if (distance < nearest) {
      nearest = distance
      chosen = place
    }
  }
  // In shares again; the exact size asked for, kept inside the allowed area.
  const x = Math.min(Math.max(chosen.x / w + (ww / w - width) / 2, within.x), within.x + within.width - width)
  const y = Math.min(Math.max(chosen.y / h + (wh / h - height) / 2, within.y), within.y + within.height - height)
  return { x: Math.max(within.x, x), y: Math.max(within.y, y), width, height }
}

// The slide (-1 to 1, as a photo in a shape uses) that puts a window's middle as close to the
// shape's middle as it can go. `share` is how much of the photo the shape shows, 0 to 1.
export function slideFor(middle: number, share: number): number {
  if (share >= 1) return 0
  // The photo slides by (1 - share) / 2 of its size from one end to the other.
  const slide = (1 - 2 * middle) / (1 - share)
  return Math.max(-1, Math.min(1, Math.round(slide * 1000) / 1000))
}
