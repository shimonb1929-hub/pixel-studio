// Straighten (pro: Auto Straighten, Upright level): finds the long straight lines in a photo (the
// horizon, walls, table edges) and works out how far they lean, so the photo can be turned level.
// Plain code, no download: edges are found with a Sobel filter on a small copy of the photo, and a
// Hough transform counts how many edge points sit on each straight line at each small angle. The
// angle with the longest lines wins.

// Pixels to look at: RGBA, like ImageData.
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface Tilt {
  // How far the photo's lines lean, in degrees, clockwise on screen. Turning the photo by minus
  // this makes them level.
  angle: number
  // Whether the lines found run across (a horizon) or up and down (walls).
  lines: 'across' | 'upright'
}

// How far a photo can lean and still be straightened. More than this is a photo turned on purpose.
export const MAX_TILT = 20
// Photos are looked at this small: plenty to find long lines, and quick.
export const STRAIGHTEN_SIDE = 480

const STEP = 0.1
// An edge point votes for angles this close to the way its edge runs. Sobel's direction is only
// roughly right: along a gently leaning line, the pixels form little steps that each look level.
const WINDOW = 10
// A line must be at least this share of the photo's width (or height, for upright lines) to count.
const MIN_LINE = 0.25

function luminance(data: Pixels['data'], i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

interface Edges {
  // Positions and the way each edge runs (degrees, -90 to 90, 0 is across).
  xs: Int32Array
  ys: Int32Array
  angles: Float32Array
  count: number
}

// The strong edges of a picture. Edges next to see-through parts are left out: the outline of a
// cut-out photo is not a line in the photo.
function findEdges(pixels: Pixels): Edges {
  const { width: w, height: h, data } = pixels
  const gray = new Float32Array(w * h)
  const solid = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    gray[p] = luminance(data, p * 4)
    solid[p] = data[p * 4 + 3] >= 250 ? 1 : 0
  }
  const magnitude = new Float32Array(w * h)
  const gxs = new Float32Array(w * h)
  const gys = new Float32Array(w * h)
  let strongest = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (!(solid[p - w - 1] & solid[p - w] & solid[p - w + 1] & solid[p - 1] & solid[p] & solid[p + 1] & solid[p + w - 1] & solid[p + w] & solid[p + w + 1])) continue
      const gx = gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1]
      const gy = gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1]
      const m = Math.sqrt(gx * gx + gy * gy)
      magnitude[p] = m
      gxs[p] = gx
      gys[p] = gy
      if (m > strongest) strongest = m
    }
  }
  // Only clear edges: faint texture (grass, noise, sky) would drown the lines.
  const threshold = Math.max(60, strongest * 0.2)
  let count = 0
  for (let p = 0; p < w * h; p++) if (magnitude[p] >= threshold) count++
  const edges: Edges = { xs: new Int32Array(count), ys: new Int32Array(count), angles: new Float32Array(count), count }
  let n = 0
  for (let p = 0; p < w * h; p++) {
    if (magnitude[p] < threshold) continue
    // The edge runs across its gradient.
    let a = (Math.atan2(gys[p], gxs[p]) * 180) / Math.PI + 90
    if (a >= 90) a -= 180
    if (a < -90) a += 180
    edges.xs[n] = p % w
    edges.ys[n] = Math.floor(p / w)
    edges.angles[n] = a
    n++
  }
  return edges
}

// The angles tested: from `from` to `to` degrees, `step` apart.
interface Angles {
  from: number
  to: number
  step: number
}

interface Strengths {
  // The longest line at each angle, as a share of the photo's width (or height, for upright lines).
  best: Float32Array
  // How much that line stands out from the rest of the picture at that angle.
  contrast: Float32Array
}

// For one family of lines (across or upright), how long and clear the longest line is at each
// tested angle.
function lineStrengths(edges: Edges, w: number, h: number, upright: boolean, range: Angles): Strengths {
  const angles = Math.round((range.to - range.from) / range.step) + 1
  const diagonal = Math.ceil(Math.hypot(w, h))
  const bins = 2 * diagonal + 3
  const votes = new Float32Array(angles * bins)
  const cos = new Float64Array(angles)
  const sin = new Float64Array(angles)
  for (let i = 0; i < angles; i++) {
    const tilt = ((range.from + i * range.step) * Math.PI) / 180
    cos[i] = Math.cos(tilt)
    sin[i] = Math.sin(tilt)
  }
  for (let n = 0; n < edges.count; n++) {
    let a = edges.angles[n]
    // An upright edge leaning clockwise by `tilt` runs at 90 + tilt, which wraps round to -90 + tilt.
    if (upright) a = a > 0 ? a - 90 : a + 90
    const from = Math.max(0, Math.ceil((a - WINDOW - range.from) / range.step))
    const to = Math.min(angles - 1, Math.floor((a + WINDOW - range.from) / range.step))
    if (from > to) continue
    const x = edges.xs[n] - w / 2
    const y = edges.ys[n] - h / 2
    for (let i = from; i <= to; i++) {
      // The distance of the line through this point from the middle, measured across the line.
      const rho = upright ? x * cos[i] + y * sin[i] : -x * sin[i] + y * cos[i]
      votes[i * bins + Math.round(rho) + diagonal + 1]++
    }
  }
  const length = upright ? h : w
  const best = new Float32Array(angles)
  const contrast = new Float32Array(angles)
  for (let i = 0; i < angles; i++) {
    const row = i * bins
    let top = 0
    let total = 0
    for (let b = 1; b < bins - 1; b++) {
      // A Sobel edge is about two pixels thick, so a line's points fall into neighboring rows.
      const sum = votes[row + b - 1] + votes[row + b] + votes[row + b + 1]
      if (sum > top) top = sum
      total += votes[row + b]
    }
    // How many rows the photo spans at this angle: the busiest line against an average three rows.
    const rows = upright ? w * Math.abs(cos[i]) + h * Math.abs(sin[i]) : h * Math.abs(cos[i]) + w * Math.abs(sin[i])
    // Thick edges count about twice along a line.
    best[i] = top / 2 / length
    contrast[i] = total > 0 ? top / ((3 * total) / rows) : 0
  }
  return { best, contrast }
}

// Lines that clearly stand out: a long line is much busier than the rows around it, while a busy
// texture (grass, leaves) fills every row about the same.
function clear(s: Strengths, i: number): number {
  return s.best[i] >= MIN_LINE && s.contrast[i] >= 4 ? s.best[i] : 0
}

// The tested angle with the longest clear lines, across and upright together, or null.
function strongestAngle(edges: Edges, w: number, h: number, range: Angles): Tilt | null {
  const across = lineStrengths(edges, w, h, false, range)
  const upright = lineStrengths(edges, w, h, true, range)
  let index = -1
  let bestScore = 0
  for (let i = 0; i < across.best.length; i++) {
    const score = clear(across, i) + clear(upright, i)
    if (score > bestScore) {
      bestScore = score
      index = i
    }
  }
  if (index < 0) return null
  // A smooth peak between the tested angles.
  let offset = 0
  if (index > 0 && index < across.best.length - 1) {
    const raw = (i: number) => across.best[i] + upright.best[i]
    const left = raw(index - 1)
    const middle = raw(index)
    const right = raw(index + 1)
    const curve = left - 2 * middle + right
    if (curve < 0) offset = Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curve))
  }
  return { angle: range.from + (index + offset) * range.step, lines: clear(across, index) >= clear(upright, index) ? 'across' : 'upright' }
}

// How far the photo leans, or null when it has no clear long straight lines to go by.
export function findTilt(pixels: Pixels, maxTilt = MAX_TILT): Tilt | null {
  const { width: w, height: h } = pixels
  if (w < 8 || h < 8) return null
  const edges = findEdges(pixels)
  if (edges.count < Math.min(w, h) * MIN_LINE) return null
  // First every half degree, then every tenth of a degree around the best: much quicker than
  // testing every tenth of a degree from the start.
  const rough = strongestAngle(edges, w, h, { from: -maxTilt, to: maxTilt, step: 0.5 })
  if (!rough) return null
  const near = Math.round(rough.angle * 2) / 2
  const fine = strongestAngle(edges, w, h, { from: Math.max(-maxTilt, near - 1), to: Math.min(maxTilt, near + 1), step: STEP }) ?? rough
  return { angle: Math.round(fine.angle * 100) / 100, lines: fine.lines }
}
