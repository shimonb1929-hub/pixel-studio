import type { PathNode, ShapePath } from './path.ts'
import type { Point } from './types.ts'

// Turn a picture into shapes (pro: Image Trace): a logo, a sketch or a signature becomes sharp
// shapes that stay crisp at any size and can be recolored. The steps:
//   1. Sort every pixel into a few colors (or ink and paper), measuring colors the way eyes see them.
//   2. Tidy up: lone pixels and specks smaller than the detail allows join the color around them.
//   3. For each color, follow the edges of its areas, holes included, around the pixel corners.
//   4. Find the real corners and fit smooth curves through the rest, so the edges come out smooth
//      instead of in pixel steps.
// The colors stack like paper cut-outs: each color's shape reaches a little way in under the colors
// above it, so no thin gaps ever show between two colors that touch.
// Everything here is plain arithmetic on the picture's pixels, so it also runs inside a worker.

export interface TraceImage {
  width: number
  height: number
  // RGBA, four bytes a pixel, as canvas gives them.
  data: Uint8ClampedArray
}

// 'ink' is one dark color on paper (black and white); 'colors' keeps several colors.
export type TraceMode = 'ink' | 'colors'

export interface TraceOptions {
  mode: TraceMode
  // How many colors to keep in 'colors' mode, 2 to 16.
  colors: number
  // In 'ink' mode: anything darker than this (0 black to 1 white) is ink.
  cutoff: number
  // 0 gives smoother, simpler shapes; 1 copies the picture as closely as it can.
  detail: number
  // Leaves out the background: the color most of the picture's edge has (or the paper).
  dropBackground: boolean
}

export const DEFAULT_TRACE: TraceOptions = { mode: 'colors', colors: 6, cutoff: 0.5, detail: 0.5, dropBackground: true }

// One color of the result: its outlines, in the picture's pixels. With several outlines, a spot is
// inside when an odd number of them go around it (so holes stay holes).
export interface TracedColor {
  color: string
  paths: ShapePath[]
}

export interface TraceResult {
  width: number
  height: number
  // Bottom first.
  colors: TracedColor[]
}

const NONE = -1
// Colors closer than this (in OKLab) look the same.
const TWINS = 0.045
// Neighbors that differ by more than this (0 to 255) make an edge.
const EDGE_STEP = 24
// How much a pixel along an edge counts when choosing colors, against one inside an area.
const EDGE_WEIGHT = 0.2
// A color this close (in OKLab) to the line between two others can be a blend of them.
const BLEND_DISTANCE = 0.05
// Pixels less covered than this count as see-through.
const SOLID = 128

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

// ---------- Colors as eyes see them (OKLab) ----------

const LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = LINEAR[r]
  const lg = LINEAR[g]
  const lb = LINEAR[b]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function hex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

// How light a pixel looks on white paper, 0 to 1 (see-through counts as paper).
function lightness(data: Uint8ClampedArray, i: number): number {
  const a = data[i + 3] / 255
  const lum = 0.2126 * LINEAR[data[i]] + 0.7152 * LINEAR[data[i + 1]] + 0.0722 * LINEAR[data[i + 2]]
  // Back to how light it looks (not how much light it gives), so 0.5 sits in the middle.
  const seen = lum <= 0.0031308 ? lum * 12.92 : 1.055 * lum ** (1 / 2.4) - 0.055
  return 1 - a * (1 - seen)
}

// The cutoff that splits a picture's lightness best into dark and light (Otsu's method), as a
// starting point for Black & white.
export function suggestCutoff(image: TraceImage): number {
  const histogram = new Float64Array(256)
  const { data } = image
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(lightness(data, i) * 255)]++
    total++
  }
  if (total === 0) return 0.5
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let sumBelow = 0
  let below = 0
  let best = -1
  let bestAt = 128
  for (let i = 0; i < 256; i++) {
    below += histogram[i]
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    sumBelow += i * histogram[i]
    const meanBelow = sumBelow / below
    const meanAbove = (sum - sumBelow) / above
    const between = below * above * (meanBelow - meanAbove) ** 2
    if (between > best) {
      best = between
      bestAt = i
    }
  }
  // Ink is what's darker than the cutoff, so the cutoff sits just above the dark group.
  return clamp01((bestAt + 1) / 255)
}

// ---------- 1. Sorting pixels into colors ----------

interface Labels {
  // Which color each pixel is, or NONE where it's see-through.
  labels: Int16Array
  palette: { r: number; g: number; b: number }[]
}

function inkLabels(image: TraceImage, cutoff: number): Labels {
  const { data, width, height } = image
  const labels = new Int16Array(width * height)
  for (let p = 0, i = 0; p < labels.length; p++, i += 4) {
    if (lightness(data, i) < cutoff) labels[p] = 0
    else labels[p] = data[i + 3] < SOLID ? NONE : 1
  }
  return { labels, palette: [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }] }
}

// A small random number maker that always gives the same numbers, so tracing the same picture
// twice gives the same shapes.
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Picks `count` colors (k-means in OKLab). Pixels are first counted in small color boxes (5 bits
// a channel), so even a big picture only has a few thousand different colors to sort.
function colorLabels(image: TraceImage, count: number): Labels {
  const { data, width, height } = image
  const BOXES = 32768
  const boxCount = new Float64Array(BOXES)
  const sumR = new Float64Array(BOXES)
  const sumG = new Float64Array(BOXES)
  const sumB = new Float64Array(BOXES)
  // Pixels away from any edge. Pixels along edges are often a blend of the colors on either side
  // (smoothed edges), so they count for less when choosing the colors.
  const boxFlat = new Float64Array(BOXES)
  const boxOf = new Int32Array(width * height)
  const flatPixel = new Uint8Array(width * height)
  const differs = (i: number, j: number) => Math.max(Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]), Math.abs(data[i + 2] - data[j + 2]), Math.abs(data[i + 3] - data[j + 3])) > EDGE_STEP
  for (let p = 0, i = 0; p < boxOf.length; p++, i += 4) {
    if (data[i + 3] < SOLID) {
      boxOf[p] = -1
      continue
    }
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const box = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    boxOf[p] = box
    boxCount[box]++
    const x = p % width
    const edge = (x > 0 && differs(i, i - 4)) || (x < width - 1 && differs(i, i + 4)) || (p >= width && differs(i, i - width * 4)) || (p + width < boxOf.length && differs(i, i + width * 4))
    if (!edge) {
      boxFlat[box]++
      flatPixel[p] = 1
    }
    sumR[box] += r
    sumG[box] += g
    sumB[box] += b
  }
  const used: number[] = []
  for (let box = 0; box < BOXES; box++) if (boxCount[box] > 0) used.push(box)
  const n = used.length
  const weight = new Float64Array(n)
  const lab = new Float64Array(n * 3)
  used.forEach((box, j) => {
    const c = boxCount[box]
    weight[j] = boxFlat[box] + EDGE_WEIGHT * (c - boxFlat[box])
    const [L, A, B] = oklab(Math.round(sumR[box] / c), Math.round(sumG[box] / c), Math.round(sumB[box] / c))
    lab[j * 3] = L
    lab[j * 3 + 1] = A
    lab[j * 3 + 2] = B
  })
  const k = Math.max(1, Math.min(count, n))
  const centers = new Float64Array(k * 3)
  const dist = (j: number, c: number) => {
    const dl = lab[j * 3] - centers[c * 3]
    const da = lab[j * 3 + 1] - centers[c * 3 + 1]
    const db = lab[j * 3 + 2] - centers[c * 3 + 2]
    return dl * dl + da * da + db * db
  }
  // Start (k-means++): the most common color, then colors far from those picked so far.
  const random = seeded(n * 7919 + k)
  let first = 0
  for (let j = 1; j < n; j++) if (weight[j] > weight[first]) first = j
  centers.set(lab.subarray(first * 3, first * 3 + 3), 0)
  const nearest = new Float64Array(n).fill(Infinity)
  for (let c = 1; c < k; c++) {
    let total = 0
    for (let j = 0; j < n; j++) {
      nearest[j] = Math.min(nearest[j], dist(j, c - 1))
      total += nearest[j] * weight[j]
    }
    let target = random() * total
    let pick = n - 1
    for (let j = 0; j < n; j++) {
      target -= nearest[j] * weight[j]
      if (target <= 0) {
        pick = j
        break
      }
    }
    centers.set(lab.subarray(pick * 3, pick * 3 + 3), c * 3)
  }
  const assigned = new Int32Array(n)
  for (let round = 0; round < 16; round++) {
    let moved = 0
    for (let j = 0; j < n; j++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < k; c++) {
        const d = dist(j, c)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      if (assigned[j] !== best || round === 0) moved++
      assigned[j] = best
    }
    if (moved === 0) break
    const sums = new Float64Array(k * 4)
    for (let j = 0; j < n; j++) {
      const c = assigned[j]
      sums[c * 4] += lab[j * 3] * weight[j]
      sums[c * 4 + 1] += lab[j * 3 + 1] * weight[j]
      sums[c * 4 + 2] += lab[j * 3 + 2] * weight[j]
      sums[c * 4 + 3] += weight[j]
    }
    for (let c = 0; c < k; c++) {
      const w = sums[c * 4 + 3]
      if (w > 0) for (let d = 0; d < 3; d++) centers[c * 3 + d] = sums[c * 4 + d] / w
    }
  }
  // Asking for more colors than the picture has splits one color into near twins (by noise, or
  // by a photo's grain). Twins too close to tell apart become one color again.
  const sameAs = Array.from({ length: k }, (_, c) => c)
  const find = (c: number): number => (sameAs[c] === c ? c : (sameAs[c] = find(sameAs[c])))
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const dl = centers[a * 3] - centers[b * 3]
      const da = centers[a * 3 + 1] - centers[b * 3 + 1]
      const db = centers[a * 3 + 2] - centers[b * 3 + 2]
      if (dl * dl + da * da + db * db < TWINS * TWINS) sameAs[find(b)] = find(a)
    }
  }
  for (let j = 0; j < n; j++) assigned[j] = find(assigned[j])
  // A color found mostly along edges, that's a blend of two other colors, is the smoothing between
  // them, not a color of its own: its pixels go to the nearest real color.
  const total = new Float64Array(k)
  const flat = new Float64Array(k)
  used.forEach((box, j) => {
    total[assigned[j]] += boxCount[box]
    flat[assigned[j]] += boxFlat[box]
  })
  const alive = Array.from({ length: k }, (_, c) => total[c] > 0)
  const segmentDistance = (c: number, a: number, b: number) => {
    let ab = 0
    let ac = 0
    for (let d = 0; d < 3; d++) {
      const u = centers[b * 3 + d] - centers[a * 3 + d]
      ab += u * u
      ac += u * (centers[c * 3 + d] - centers[a * 3 + d])
    }
    const t = ab > 0 ? ac / ab : 0
    if (t < 0.1 || t > 0.9) return Infinity
    let sq = 0
    for (let d = 0; d < 3; d++) sq += (centers[a * 3 + d] + t * (centers[b * 3 + d] - centers[a * 3 + d]) - centers[c * 3 + d]) ** 2
    return Math.sqrt(sq)
  }
  for (let c = 0; c < k; c++) {
    if (!alive[c] || flat[c] > total[c] * 0.4) continue
    let blend = false
    for (let a = 0; a < k && !blend; a++) {
      for (let b = a + 1; b < k && !blend; b++) {
        if (a !== c && b !== c && alive[a] && alive[b] && segmentDistance(c, a, b) < BLEND_DISTANCE) blend = true
      }
    }
    if (blend) alive[c] = false
  }
  for (let j = 0; j < n; j++) {
    if (alive[assigned[j]]) continue
    let best = assigned[j]
    let bestDist = Infinity
    for (let c = 0; c < k; c++) {
      if (!alive[c]) continue
      const d = dist(j, c)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    assigned[j] = best
  }
  const boxLabel = new Int16Array(BOXES)
  used.forEach((box, j) => (boxLabel[box] = assigned[j]))
  const labels = new Int16Array(width * height)
  for (let p = 0; p < labels.length; p++) labels[p] = boxOf[p] < 0 ? NONE : boxLabel[boxOf[p]]
  // A pixel along an edge that's a blend of the colors either side (not close to any color) could
  // be nearest to some third color, which would leave a thin line of it along the edge. It takes the
  // nearest of the colors around it instead.
  const boxIndex = new Int32Array(BOXES)
  used.forEach((box, j) => (boxIndex[box] = j))
  const before = labels.slice()
  const nearby: number[] = []
  for (let p = 0; p < labels.length; p++) {
    if (flatPixel[p] || boxOf[p] < 0) continue
    const j = boxIndex[boxOf[p]]
    if (dist(j, before[p]) < BLEND_DISTANCE * BLEND_DISTANCE) continue
    const x = p % width
    const y = (p - x) / width
    nearby.length = 0
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= height) continue
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= width) continue
        const q = yy * width + xx
        if (flatPixel[q] && before[q] >= 0 && !nearby.includes(before[q])) nearby.push(before[q])
      }
    }
    if (nearby.length === 0) continue
    let best = nearby[0]
    for (const c of nearby) if (dist(j, c) < dist(j, best)) best = c
    labels[p] = best
  }
  // Each color shown is the true average of its pixels away from edges (where they blend with the
  // colors next to them), or of all its pixels when it has none of those.
  const sums = new Float64Array(k * 8)
  for (let p = 0, i = 0; p < labels.length; p++, i += 4) {
    const c = labels[p]
    if (c < 0) continue
    const at = c * 8 + (flatPixel[p] ? 0 : 4)
    sums[at] += data[i]
    sums[at + 1] += data[i + 1]
    sums[at + 2] += data[i + 2]
    sums[at + 3]++
  }
  const palette = Array.from({ length: k }, (_, c) => {
    const at = c * 8 + (sums[c * 8 + 3] > 0 ? 0 : 4)
    const count = sums[at + 3] || 1
    return { r: sums[at] / count, g: sums[at + 1] / count, b: sums[at + 2] / count }
  })
  return { labels, palette }
}

// ---------- 2. Tidying up ----------

// A pixel almost alone among another color (only itself and at most one neighbor) takes the color
// most of its neighbors have. This removes noise and stray edge pixels, but keeps lines one pixel
// thin.
function dropLonePixels(labels: Int16Array, width: number, height: number, colors: number): Int16Array {
  const out = new Int16Array(labels)
  const counts = new Int32Array(colors + 1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const own = labels[p]
      let same = 0
      counts.fill(0)
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue
          const l = labels[yy * width + xx]
          if (l === own) same++
          else counts[l + 1]++
        }
      }
      if (same > 1) continue
      let best = -2
      let bestCount = 0
      for (let c = 0; c <= colors; c++) {
        if (counts[c] > bestCount) {
          bestCount = counts[c]
          best = c - 1
        }
      }
      if (best !== -2 && bestCount >= 4) out[p] = best
    }
  }
  return out
}

// Patches of one color smaller than `minArea` pixels take the color around them most.
function dropSpecks(labels: Int16Array, width: number, minArea: number, colors: number): void {
  if (minArea <= 1) return
  const seen = new Uint8Array(labels.length)
  const stack = new Int32Array(labels.length)
  const patch: number[] = []
  const around = new Int32Array(colors + 1)
  for (let start = 0; start < labels.length; start++) {
    if (seen[start]) continue
    const own = labels[start]
    let top = 0
    stack[top++] = start
    seen[start] = 1
    patch.length = 0
    around.fill(0)
    let small = true
    while (top > 0) {
      const p = stack[--top]
      if (small) patch.push(p)
      if (patch.length >= minArea) small = false
      const x = p % width
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p + width < labels.length ? p + width : -1]
      for (const q of neighbors) {
        if (q < 0) continue
        const l = labels[q]
        if (l !== own) {
          if (small) around[l + 1]++
        } else if (!seen[q]) {
          seen[q] = 1
          stack[top++] = q
        }
      }
    }
    if (!small) continue
    let best = -2
    let bestCount = 0
    for (let c = 0; c <= colors; c++) {
      if (around[c] > bestCount) {
        bestCount = around[c]
        best = c - 1
      }
    }
    if (best !== -2) for (const p of patch) labels[p] = best
  }
}

// The color most of the picture's edge has, when it's clearly the background (or NONE).
function edgeColor(labels: Int16Array, width: number, height: number, colors: number): number {
  const counts = new Int32Array(colors + 1)
  let total = 0
  const add = (p: number) => {
    counts[labels[p] + 1]++
    total++
  }
  for (let x = 0; x < width; x++) {
    add(x)
    add((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    add(y * width)
    add(y * width + width - 1)
  }
  let best = 0
  for (let c = 1; c <= colors; c++) if (counts[c] > counts[best]) best = c
  return counts[best] >= total * 0.3 ? best - 1 : NONE
}

// How many steps (counting diagonal steps as one) each pixel is from the nearest pixel at `level`,
// up to `limit`.
function distanceTo(level: Int8Array, target: number, width: number, height: number, limit: number): Uint8Array {
  const far = Math.min(255, limit + 1)
  const d = new Uint8Array(level.length)
  for (let p = 0; p < level.length; p++) d[p] = level[p] === target ? 0 : far
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      let v = d[p]
      if (v === 0) continue
      if (x > 0) v = Math.min(v, d[p - 1] + 1)
      if (y > 0) {
        v = Math.min(v, d[p - width] + 1)
        if (x > 0) v = Math.min(v, d[p - width - 1] + 1)
        if (x < width - 1) v = Math.min(v, d[p - width + 1] + 1)
      }
      d[p] = v
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x
      let v = d[p]
      if (v === 0) continue
      if (x < width - 1) v = Math.min(v, d[p + 1] + 1)
      if (y < height - 1) {
        v = Math.min(v, d[p + width] + 1)
        if (x < width - 1) v = Math.min(v, d[p + width + 1] + 1)
        if (x > 0) v = Math.min(v, d[p + width - 1] + 1)
      }
      d[p] = v
    }
  }
  return d
}

// ---------- 3. Following edges ----------

const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

interface Loop {
  // The middle of each pixel edge along the outline, x and y in turn. Using the middles turns
  // pixel steps along a slope into a straight slope.
  points: Float64Array
  // Positive around a filled area, negative around a hole.
  area: number
}

// Every outline of the filled pixels: around each area and each hole. The edges go along the
// pixel corners with the filled side on the right, so outlines go clockwise and holes the other way.
// Where two filled pixels touch only at a corner, they count as joined.
export function outlineLoops(filled: Uint8Array, width: number, height: number): Loop[] {
  const W = width + 1
  const out = new Uint8Array(W * (height + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (!filled[p]) continue
      if (y === 0 || !filled[p - width]) out[y * W + x] |= 1
      if (x === width - 1 || !filled[p + 1]) out[y * W + x + 1] |= 2
      if (y === height - 1 || !filled[p + width]) out[(y + 1) * W + x + 1] |= 4
      if (x === 0 || !filled[p - 1]) out[(y + 1) * W + x] |= 8
    }
  }
  const loops: Loop[] = []
  const points: number[] = []
  for (let start = 0; start < out.length; start++) {
    while (out[start]) {
      const sx = start % W
      const sy = (start - sx) / W
      const firstDir = Math.log2(out[start] & -out[start])
      let x = sx
      let y = sy
      let dir = firstDir
      let twice = 0
      points.length = 0
      // The first edge stays marked until the end, so coming back to the start can tell whether
      // the outline is closed or goes on through a corner touch.
      let first = true
      for (;;) {
        if (!first) out[y * W + x] &= ~(1 << dir)
        first = false
        const nx = x + DX[dir]
        const ny = y + DY[dir]
        points.push(x + DX[dir] / 2, y + DY[dir] / 2)
        twice += x * ny - nx * y
        x = nx
        y = ny
        const here = out[y * W + x]
        const left = (dir + 3) & 3
        const right = (dir + 1) & 3
        dir = here & (1 << left) ? left : here & (1 << dir) ? dir : right
        if (x === sx && y === sy && dir === firstDir) {
          out[start] &= ~(1 << firstDir)
          break
        }
        if (!here) break
      }
      loops.push({ points: Float64Array.from(points), area: twice / 2 })
    }
  }
  return loops
}

// ---------- 4. Corners and smooth curves ----------

interface Cubic {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}
function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}
function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s }
}
function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}
function length(a: Point): number {
  return Math.hypot(a.x, a.y)
}
function unit(a: Point): Point {
  const l = length(a) || 1
  return { x: a.x / l, y: a.y / l }
}

// How far p is from the straight line through a and b.
function lineDistance(p: Point, a: Point, b: Point): number {
  const d = sub(b, a)
  const l = length(d)
  if (l < 1e-9) return length(sub(p, a))
  return Math.abs(d.x * (p.y - a.y) - d.y * (p.x - a.x)) / l
}

// The few points that keep an open run of points within `tolerance` (Ramer-Douglas-Peucker).
function simplify(pts: Point[], first: number, last: number, tolerance: number, keep: number[]): void {
  let worst = -1
  let worstDistance = tolerance
  for (let i = first + 1; i < last; i++) {
    const d = lineDistance(pts[i], pts[first], pts[last])
    if (d > worstDistance) {
      worstDistance = d
      worst = i
    }
  }
  if (worst < 0) return
  simplify(pts, first, worst, tolerance, keep)
  keep.push(worst)
  simplify(pts, worst, last, tolerance, keep)
}

// Which points of a closed outline are sharp corners. A corner turns a lot within a few pixels and
// stands out clearly from the outline around it; round parts turn slowly.
function findCorners(pts: Point[], tolerance: number): number[] {
  const n = pts.length
  if (n < 8) return []
  // Simplify both halves of the outline, from the first point and the point farthest from it.
  let far = 0
  for (let i = 1; i < n; i++) if (length(sub(pts[i], pts[0])) > length(sub(pts[far], pts[0]))) far = i
  const ring = [...pts, pts[0]]
  const keep = [0]
  simplify(ring, 0, far, tolerance, keep)
  keep.push(far)
  simplify(ring, far, n, tolerance, keep)
  const corners: number[] = []
  const m = keep.length
  if (m < 3) return []
  for (let k = 0; k < m; k++) {
    const i = keep[k]
    const before = keep[(k + m - 1) % m]
    const after = keep[(k + 1) % m]
    const gapBefore = (i - before + n) % n
    const gapAfter = (after - i + n) % n
    const reach = Math.max(2, Math.min(6, Math.floor(gapBefore / 2), Math.floor(gapAfter / 2)))
    const a = pts[(i - reach + n) % n]
    const b = pts[(i + reach) % n]
    const into = unit(sub(pts[i], a))
    const outOf = unit(sub(b, pts[i]))
    const turn = Math.acos(Math.max(-1, Math.min(1, dot(into, outOf))))
    // How far the point sticks out past the line between its neighbors: a round bend of the same
    // size sticks out much less than a corner.
    const sticksOut = lineDistance(pts[i], a, b)
    if (turn > (55 * Math.PI) / 180 && sticksOut > Math.max(0.9, reach * 0.3)) corners.push(i)
  }
  return corners
}

// Where the straight lines coming into and going out of a corner meet: the corner's true tip.
// (The outline runs through the middles of pixel edges, which cut a corner off slightly.)
function cornerTip(pts: Point[], i: number): Point {
  const n = pts.length
  const a0 = pts[(i - 4 + n) % n]
  const a1 = pts[(i - 1 + n) % n]
  const b0 = pts[(i + 1) % n]
  const b1 = pts[(i + 4) % n]
  const d1 = sub(a1, a0)
  const d2 = sub(b1, b0)
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-9) return pts[i]
  const t = ((b0.x - a0.x) * d2.y - (b0.y - a0.y) * d2.x) / cross
  const tip = add(a0, scale(d1, t))
  return length(sub(tip, pts[i])) <= 1.5 ? tip : pts[i]
}

// Bezier curve fitting (Schneider's method): one cubic curve through a run of points, split where
// it strays further than the tolerance, with smooth joins at the splits.
function bezierPoint(c: Cubic, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return { x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x, y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y }
}

function generateBezier(pts: Point[], first: number, last: number, u: number[], tan1: Point, tan2: Point): Cubic {
  const p0 = pts[first]
  const p3 = pts[last]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < u.length; i++) {
    const t = u[i]
    const s = 1 - t
    const b0 = s * s * s
    const b1 = 3 * t * s * s
    const b2 = 3 * t * t * s
    const b3 = t * t * t
    const a1 = scale(tan1, b1)
    const a2 = scale(tan2, b2)
    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)
    const tmp = sub(pts[first + i], add(scale(p0, b0 + b1), scale(p3, b2 + b3)))
    x0 += dot(a1, tmp)
    x1 += dot(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  let alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0
  let alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0
  const span = length(sub(p3, p0))
  const epsilon = 1e-6 * span
  if (alpha1 < epsilon || alpha2 < epsilon || alpha1 > span * 2 || alpha2 > span * 2) {
    alpha1 = span / 3
    alpha2 = span / 3
  }
  return { p0, p1: add(p0, scale(tan1, alpha1)), p2: add(p3, scale(tan2, alpha2)), p3 }
}

function chordLengths(pts: Point[], first: number, last: number): number[] {
  const u = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + length(sub(pts[i], pts[i - 1])))
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

// One Newton step closer to the curve's nearest point for each point.
function reparameterize(c: Cubic, pts: Point[], first: number, u: number[]): number[] {
  const d1 = [scale(sub(c.p1, c.p0), 3), scale(sub(c.p2, c.p1), 3), scale(sub(c.p3, c.p2), 3)]
  const d2 = [scale(sub(d1[1], d1[0]), 2), scale(sub(d1[2], d1[1]), 2)]
  return u.map((t, i) => {
    const p = bezierPoint(c, t)
    const s = 1 - t
    const q1 = add(add(scale(d1[0], s * s), scale(d1[1], 2 * s * t)), scale(d1[2], t * t))
    const q2 = add(scale(d2[0], s), scale(d2[1], t))
    const diff = sub(p, pts[first + i])
    const den = dot(q1, q1) + dot(diff, q2)
    if (Math.abs(den) < 1e-12) return t
    return Math.min(1, Math.max(0, t - dot(diff, q1) / den))
  })
}

function maxError(c: Cubic, pts: Point[], first: number, u: number[]): { error: number; at: number } {
  let error = 0
  let at = first + Math.floor(u.length / 2)
  for (let i = 1; i < u.length - 1; i++) {
    const d = length(sub(bezierPoint(c, u[i]), pts[first + i]))
    if (d > error) {
      error = d
      at = first + i
    }
  }
  return { error, at }
}

function fitCubic(pts: Point[], first: number, last: number, tan1: Point, tan2: Point, tolerance: number, out: Cubic[], depth: number): void {
  const p0 = pts[first]
  const p3 = pts[last]
  if (last - first < 2) {
    const d = length(sub(p3, p0)) / 3
    out.push({ p0, p1: add(p0, scale(tan1, d)), p2: add(p3, scale(tan2, d)), p3 })
    return
  }
  let u = chordLengths(pts, first, last)
  let curve = generateBezier(pts, first, last, u, tan1, tan2)
  let { error, at } = maxError(curve, pts, first, u)
  if (error <= tolerance) {
    out.push(curve)
    return
  }
  if (error <= tolerance * 4) {
    for (let round = 0; round < 6; round++) {
      u = reparameterize(curve, pts, first, u)
      curve = generateBezier(pts, first, last, u, tan1, tan2)
      ;({ error, at } = maxError(curve, pts, first, u))
      if (error <= tolerance) {
        out.push(curve)
        return
      }
    }
  }
  if (depth > 40) {
    out.push(curve)
    return
  }
  at = Math.min(last - 1, Math.max(first + 1, at))
  // The direction at the split, judged over several points either side so pixel steps don't tilt it.
  const span = Math.max(2, Math.min(TANGENT_SPAN, at - first, last - at))
  const center = unit(sub(pts[at - span], pts[at + span]))
  fitCubic(pts, first, at, tan1, center, tolerance, out, depth + 1)
  fitCubic(pts, at, last, scale(center, -1), tan2, tolerance, out, depth + 1)
}

// How many points either side judge which way an outline is heading.
const TANGENT_SPAN = 6

// The direction a run of points sets off in from its start, judged over a few points.
function startTangent(pts: Point[], first: number, last: number): Point {
  return unit(sub(pts[Math.min(last, first + TANGENT_SPAN)], pts[first]))
}

// A run of points between two corners, as curves (or one straight line when it is straight).
function fitRun(pts: Point[], tolerance: number, out: Cubic[]): void {
  const last = pts.length - 1
  const p0 = pts[0]
  const p3 = pts[last]
  let straight = true
  for (let i = 1; i < last && straight; i++) if (lineDistance(pts[i], p0, p3) > tolerance * 0.6) straight = false
  if (straight && length(sub(p3, p0)) > 0) {
    out.push({ p0, p1: p0, p2: p3, p3 })
    return
  }
  const tan1 = startTangent(pts, 0, last)
  const tan2 = unit(sub(pts[Math.max(0, last - TANGENT_SPAN)], p3))
  fitCubic(pts, 0, last, tan1, tan2, tolerance, out, 0)
}

// A light smoothing that evens out the tiny wobble pixel steps leave, without moving corners.
function soften(pts: Point[], fixed: Set<number>): Point[] {
  const n = pts.length
  return pts.map((p, i) => {
    if (fixed.has(i)) return p
    const a = pts[(i - 1 + n) % n]
    const b = pts[(i + 1) % n]
    return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 }
  })
}

// One outline as a smooth closed path: corners stay sharp, everything else becomes curves.
export function smoothOutline(flat: Float64Array, tolerance: number): ShapePath {
  const raw: Point[] = []
  for (let i = 0; i < flat.length; i += 2) raw.push({ x: flat[i], y: flat[i + 1] })
  const n = raw.length
  const corners = findCorners(raw, tolerance)
  const pts = soften(raw, new Set(corners))
  const curves: Cubic[] = []
  const cornerStarts = new Set<number>()
  if (corners.length === 0) {
    // A round outline: start anywhere, and make the join there as smooth as the rest.
    const ring = [...pts, pts[0]]
    const span = Math.min(TANGENT_SPAN, Math.floor(n / 4))
    const tangent = unit(sub(pts[Math.max(1, span)], pts[(n - Math.max(1, span)) % n]))
    if (n < 3) return { closed: true, nodes: raw.map((p) => node(p, p, p, false)) }
    fitCubic(ring, 0, n, tangent, scale(tangent, -1), tolerance, curves, 0)
  } else {
    const tips = corners.map((i) => cornerTip(raw, i))
    for (let k = 0; k < corners.length; k++) {
      const from = corners[k]
      const to = corners[(k + 1) % corners.length]
      const run: Point[] = [tips[k]]
      for (let i = (from + 1) % n; i !== to; i = (i + 1) % n) run.push(pts[i])
      run.push(tips[(k + 1) % corners.length])
      cornerStarts.add(curves.length)
      if (run.length === 2 && length(sub(run[0], run[1])) === 0) continue
      fitRun(run, tolerance, curves)
    }
  }
  const count = curves.length
  const nodes: PathNode[] = curves.map((c, i) => node(c.p0, curves[(i - 1 + count) % count].p2, c.p1, !cornerStarts.has(i)))
  return { closed: true, nodes }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

function node(p: Point, before: Point, after: Point, smooth: boolean): PathNode {
  return { x: round(p.x), y: round(p.y), in: { x: round(before.x), y: round(before.y) }, out: { x: round(after.x), y: round(after.y) }, smooth }
}

// ---------- All together ----------

// How the detail setting (0 to 1) turns into sizes, for a picture whose longer side is `side`
// pixels. Sizes grow with the picture, so a small preview and the full picture look the same.
export function traceSizes(side: number, detail: number): { tolerance: number; minArea: number; lonePixels: boolean } {
  const d = clamp01(detail)
  const u = side / 1000
  return {
    // How far curves may stray from the pixels' edge.
    tolerance: Math.max(0.75, u * 3 * (0.4 / 3) ** d),
    // Patches smaller than this many pixels join the color around them.
    minArea: Math.max(2, u * u * 400 * (1 / 400) ** d),
    lonePixels: d < 0.85,
  }
}

// Turns a picture into colored outlines. `progress` hears how far along it is, 0 to 1.
export function traceImage(image: TraceImage, options: TraceOptions, progress?: (share: number) => void): TraceResult {
  const { width, height } = image
  const sizes = traceSizes(Math.max(width, height), options.detail)
  const sorted = options.mode === 'ink' ? inkLabels(image, options.cutoff) : colorLabels(image, Math.round(Math.min(16, Math.max(2, options.colors))))
  const colorCount = sorted.palette.length
  progress?.(0.2)
  let { labels } = sorted
  if (sizes.lonePixels) labels = dropLonePixels(labels, width, height, colorCount)
  dropSpecks(labels, width, sizes.minArea, colorCount)
  progress?.(0.35)

  const counts = new Int32Array(colorCount)
  for (const l of labels) if (l >= 0) counts[l]++
  // The background: the paper in Black & white, or the color most of the edge has.
  const background = options.mode === 'ink' ? 1 : edgeColor(labels, width, height, colorCount)
  const kept: number[] = []
  for (let c = 0; c < colorCount; c++) if (counts[c] > 0 && !(options.dropBackground && c === background)) kept.push(c)
  // Biggest first, at the bottom; a kept background always goes under everything.
  kept.sort((a, b) => (a === background ? -1 : b === background ? 1 : counts[b] - counts[a]))
  const rank = new Int8Array(colorCount).fill(-1)
  kept.forEach((c, r) => (rank[c] = r))
  const level = new Int8Array(labels.length)
  for (let p = 0; p < labels.length; p++) level[p] = labels[p] >= 0 ? rank[labels[p]] : -1

  const colors: TracedColor[] = []
  const filled = new Uint8Array(labels.length)
  // How far each color reaches in under the colors above it: further than its curves can stray.
  const reach = Math.ceil(sizes.tolerance * 2) + 1
  kept.forEach((c, r) => {
    // This color, reaching a little way in under the colors stacked above it.
    const near = distanceTo(level, r, width, height, reach)
    for (let p = 0; p < labels.length; p++) filled[p] = level[p] === r || (level[p] > r && near[p] <= reach) ? 1 : 0
    const loops = outlineLoops(filled, width, height)
      .filter((loop) => Math.abs(loop.area) >= Math.max(2, sizes.minArea / 4))
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area))
    const paths = loops.map((loop) => smoothOutline(loop.points, sizes.tolerance)).filter((path) => path.nodes.length >= 2)
    const { r: red, g, b } = sorted.palette[c]
    if (paths.length) colors.push({ color: hex(red, g, b), paths })
    progress?.(0.35 + (0.65 * (r + 1)) / kept.length)
  })
  return { width, height, colors }
}
