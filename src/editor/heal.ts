import { createCanvas, getContext2d } from './document.ts'
import { distanceToShape } from './effects.ts'

// Fixing spots: the marked part of a picture is filled in from what's around it, so a spot, a
// scratch or a small thing disappears and the picture looks as if it was never there.
//
// It works like the professional "content-aware fill": the hole is filled with small pieces
// (patches) copied from the rest of the picture, picked so they fit together and with the edge of
// the hole. Finding fitting pieces uses PatchMatch (Barnes and others), which guesses at random and
// passes good guesses on to neighbors, so it's quick even on big pictures. Working from a small
// copy of the picture up to full size gets the overall shapes right first and the fine detail last.

const RADIUS = 3
// How far past the marks the fill reaches, in pixels.
const MARK_GROWTH = 2
const SIZE = RADIUS * 2 + 1

interface Level {
  width: number
  height: number
  // RGBA as floats, so averaging never rounds away detail.
  pixels: Float32Array
  // 1 where the picture is to be filled in.
  hole: Uint8Array
}

// A simple random number generator, so the same marks always give the same result.
function random(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function halve(level: Level): Level {
  const width = Math.max(1, level.width >> 1)
  const height = Math.max(1, level.height >> 1)
  const pixels = new Float32Array(width * height * 4)
  const hole = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = 0
      let anyHole = 0
      const sum = [0, 0, 0, 0]
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(level.width - 1, x * 2 + dx)
          const sy = Math.min(level.height - 1, y * 2 + dy)
          const i = sy * level.width + sx
          if (level.hole[i]) {
            anyHole = 1
            continue
          }
          for (let c = 0; c < 4; c++) sum[c] += level.pixels[i * 4 + c]
          count++
        }
      }
      const o = y * width + x
      // A small pixel counts as known only if everything it stands for is known.
      hole[o] = anyHole
      if (count > 0) for (let c = 0; c < 4; c++) pixels[o * 4 + c] = sum[c] / count
    }
  }
  return { width, height, pixels, hole }
}

// Fills the hole roughly, from its edge inward, each pixel the average of its filled neighbors.
function roughFill(level: Level): void {
  const { width, height, pixels, hole } = level
  const known = new Uint8Array(width * height)
  for (let i = 0; i < known.length; i++) known[i] = hole[i] ? 0 : 1
  const distance = distanceToShape(known, width, height)
  const order: number[] = []
  for (let i = 0; i < hole.length; i++) if (hole[i]) order.push(i)
  order.sort((a, b) => distance[a] - distance[b])
  const filled = Uint8Array.from(known)
  for (const i of order) {
    const x = i % width
    const y = (i / width) | 0
    let count = 0
    const sum = [0, 0, 0, 0]
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const n = ny * width + nx
        if (!filled[n]) continue
        for (let c = 0; c < 4; c++) sum[c] += pixels[n * 4 + c]
        count++
      }
    }
    if (count > 0) for (let c = 0; c < 4; c++) pixels[i * 4 + c] = sum[c] / count
    filled[i] = 1
  }
}

// Where pieces may be copied from: centers of patches with no part in the hole.
function sourceCenters(level: Level): { valid: Uint8Array; list: Int32Array } {
  const { width, height, hole } = level
  // Running totals of hole pixels, to count the hole pixels in any patch at once.
  const sums = new Int32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += hole[y * width + x]
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row
    }
  }
  const valid = new Uint8Array(width * height)
  const list: number[] = []
  for (let y = RADIUS; y < height - RADIUS; y++) {
    for (let x = RADIUS; x < width - RADIUS; x++) {
      const x0 = x - RADIUS
      const y0 = y - RADIUS
      const x1 = x + RADIUS + 1
      const y1 = y + RADIUS + 1
      const holes = sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0]
      if (holes === 0) {
        valid[y * width + x] = 1
        list.push(y * width + x)
      }
    }
  }
  return { valid, list: Int32Array.from(list) }
}

// The pixels whose patches touch the hole: these get a matching piece each.
function targets(level: Level): Int32Array {
  const { width, height, hole } = level
  const near = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!hole[y * width + x]) continue
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const nx = x + dx
          if (nx >= 0 && nx < width) near[ny * width + nx] = 1
        }
      }
    }
  }
  const list: number[] = []
  for (let i = 0; i < near.length; i++) if (near[i]) list.push(i)
  return Int32Array.from(list)
}

// How different two patches are (sum of squared differences), giving up once it's worse than `limit`.
function patchDistance(level: Level, t: number, s: number, limit: number): number {
  const { width, height, pixels } = level
  const tx = t % width
  const ty = (t / width) | 0
  const sx = s % width
  const sy = (s / width) | 0
  let total = 0
  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    const y = ty + dy
    if (y < 0 || y >= height) continue
    const rowT = y * width
    const rowS = (sy + dy) * width
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const x = tx + dx
      if (x < 0 || x >= width) continue
      const a = (rowT + x) * 4
      const b = (rowS + sx + dx) * 4
      const d0 = pixels[a] - pixels[b]
      const d1 = pixels[a + 1] - pixels[b + 1]
      const d2 = pixels[a + 2] - pixels[b + 2]
      const d3 = pixels[a + 3] - pixels[b + 3]
      total += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3
    }
    if (total >= limit) return total
  }
  return total
}

// Improves each target's matching piece: tries its neighbors' pieces (shifted by one), then pieces
// at random nearby, closer and closer.
function patchMatch(level: Level, tlist: Int32Array, nnf: Int32Array, cost: Float64Array, valid: Uint8Array, rand: () => number, passes: number): void {
  const { width, height } = level
  const tryCandidate = (t: number, s: number) => {
    if (s < 0 || s >= valid.length || !valid[s]) return
    const d = patchDistance(level, t, s, cost[t])
    if (d < cost[t]) {
      cost[t] = d
      nnf[t] = s
    }
  }
  for (let pass = 0; pass < passes; pass++) {
    const forward = pass % 2 === 0
    const step = forward ? 1 : -1
    for (let k = 0; k < tlist.length; k++) {
      const t = tlist[forward ? k : tlist.length - 1 - k]
      const x = t % width
      const y = (t / width) | 0
      // A neighbor's piece, moved over by one, often fits here too.
      const left = x - step
      if (left >= 0 && left < width && nnf[y * width + left] >= 0) {
        const s = nnf[y * width + left]
        const sx = (s % width) + step
        if (sx >= 0 && sx < width) tryCandidate(t, s + step)
      }
      const up = y - step
      if (up >= 0 && up < height && nnf[up * width + x] >= 0) {
        const s = nnf[up * width + x]
        const sy = ((s / width) | 0) + step
        if (sy >= 0 && sy < height) tryCandidate(t, s + step * width)
      }
      // Look around the current piece, closer and closer.
      const best = nnf[t]
      const bx = best % width
      const by = (best / width) | 0
      for (let r = Math.max(width, height); r >= 1; r >>= 1) {
        const cx = Math.round(bx + (rand() * 2 - 1) * r)
        const cy = Math.round(by + (rand() * 2 - 1) * r)
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
        tryCandidate(t, cy * width + cx)
      }
    }
  }
}

// Each hole pixel becomes the average of what the pieces covering it say it should be. Pieces that
// fit well count more.
function vote(level: Level, tlist: Int32Array, nnf: Int32Array, cost: Float64Array): void {
  const { width, height, pixels, hole } = level
  const sum = new Float64Array(width * height * 4)
  const weight = new Float64Array(width * height)
  // How different a typical good piece is, so weights don't depend on the picture's brightness.
  const costs = Array.from(tlist, (t) => cost[t]).sort((a, b) => a - b)
  const typical = Math.max(1, costs[Math.floor(costs.length * 0.75)] ?? 1)
  for (let k = 0; k < tlist.length; k++) {
    const t = tlist[k]
    const s = nnf[t]
    if (s < 0) continue
    const w = Math.exp(-cost[t] / (2 * typical))
    const tx = t % width
    const ty = (t / width) | 0
    const sx = s % width
    const sy = (s / width) | 0
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      const y = ty + dy
      if (y < 0 || y >= height) continue
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const x = tx + dx
        if (x < 0 || x >= width) continue
        const p = y * width + x
        if (!hole[p]) continue
        const q = ((sy + dy) * width + sx + dx) * 4
        sum[p * 4] += pixels[q] * w
        sum[p * 4 + 1] += pixels[q + 1] * w
        sum[p * 4 + 2] += pixels[q + 2] * w
        sum[p * 4 + 3] += pixels[q + 3] * w
        weight[p] += w
      }
    }
  }
  for (let p = 0; p < hole.length; p++) {
    if (!hole[p] || weight[p] <= 0) continue
    for (let c = 0; c < 4; c++) pixels[p * 4 + c] = sum[p * 4 + c] / weight[p]
  }
}

// Fills the pixels marked in `hole` (1 = fill in) from the rest of the picture. `data` is RGBA and
// is changed in place. False if there's nothing to copy from (the picture is all hole).
export function healPixels(data: Uint8ClampedArray, width: number, height: number, hole: Uint8Array, seed = 1): boolean {
  if (!hole.some((h) => h)) return true
  const finest: Level = { width, height, pixels: Float32Array.from(data), hole: Uint8Array.from(hole) }
  // Smaller and smaller copies, until the hole is only a few pixels thick.
  const levels: Level[] = [finest]
  for (;;) {
    const last = levels[levels.length - 1]
    if (last.width < SIZE * 4 || last.height < SIZE * 4) break
    const known = new Uint8Array(last.hole.length)
    for (let i = 0; i < known.length; i++) known[i] = last.hole[i] ? 0 : 1
    const distance = distanceToShape(known, last.width, last.height)
    let thickest = 0
    for (let i = 0; i < distance.length; i++) if (distance[i] > thickest) thickest = distance[i]
    if (thickest <= RADIUS) break
    const next = halve(last)
    // Stop before the hole swallows the whole picture.
    if (next.hole.every((h) => h)) break
    levels.push(next)
  }

  const rand = random(seed)
  let nnf: Int32Array | null = null
  let previous: Level | null = null
  for (let li = levels.length - 1; li >= 0; li--) {
    const level = levels[li]
    const { valid, list } = sourceCenters(level)
    if (list.length === 0) {
      if (li === levels.length - 1) roughFill(level)
      continue
    }
    const tlist = targets(level)
    const next = new Int32Array(level.width * level.height).fill(-1)
    const randomSource = () => list[Math.floor(rand() * list.length)]
    for (let k = 0; k < tlist.length; k++) {
      const t = tlist[k]
      let s = -1
      if (nnf && previous) {
        // Start from the smaller copy's pieces, twice as far.
        const x = t % level.width
        const y = (t / level.width) | 0
        const px = Math.min(previous.width - 1, x >> 1)
        const py = Math.min(previous.height - 1, y >> 1)
        const ps = nnf[py * previous.width + px]
        if (ps >= 0) {
          const sx = (ps % previous.width) * 2 + (x & 1)
          const sy = ((ps / previous.width) | 0) * 2 + (y & 1)
          if (sx < level.width && sy < level.height && valid[sy * level.width + sx]) s = sy * level.width + sx
        }
      }
      next[t] = s >= 0 ? s : randomSource()
    }
    if (!nnf) roughFill(level)
    else vote(level, tlist, next, new Float64Array(next.length).fill(1))

    const cost = new Float64Array(next.length)
    const rounds = li === levels.length - 1 ? 6 : li === 0 ? 2 : 4
    for (let round = 0; round < rounds; round++) {
      for (let k = 0; k < tlist.length; k++) cost[tlist[k]] = patchDistance(level, tlist[k], next[tlist[k]], Infinity)
      patchMatch(level, tlist, next, cost, valid, rand, 2)
      vote(level, tlist, next, cost)
    }
    nnf = next
    previous = level
  }

  for (let i = 0; i < hole.length; i++) {
    if (!hole[i]) continue
    for (let c = 0; c < 4; c++) data[i * 4 + c] = finest.pixels[i * 4 + c]
  }
  return true
}

// Fills in what `marks` covers (anything not see-through in it), on a layer's canvas, using the
// picture within `area` (design pixels). Marks are grown a little, so the soft edge of a spot goes too.
export function healRegion(
  ctx: CanvasRenderingContext2D,
  layer: { x: number; y: number; canvas: HTMLCanvasElement },
  area: { x: number; y: number; width: number; height: number },
  marks: { canvas: HTMLCanvasElement; x: number; y: number },
): void {
  const x = Math.max(0, Math.floor(area.x - layer.x))
  const y = Math.max(0, Math.floor(area.y - layer.y))
  const width = Math.min(layer.canvas.width, Math.ceil(area.x + area.width - layer.x)) - x
  const height = Math.min(layer.canvas.height, Math.ceil(area.y + area.height - layer.y)) - y
  if (width <= 0 || height <= 0) return
  const markCanvas = createCanvas(width, height)
  const markCtx = markCanvas.getContext('2d', { willReadFrequently: true }) ?? getContext2d(markCanvas)
  markCtx.drawImage(marks.canvas, marks.x - layer.x - x, marks.y - layer.y - y)
  const markAlpha = markCtx.getImageData(0, 0, width, height).data
  const marked = new Uint8Array(width * height)
  for (let i = 0; i < marked.length; i++) marked[i] = markAlpha[i * 4 + 3] > 0 ? 1 : 0
  const distance = distanceToShape(marked, width, height)
  const hole = new Uint8Array(width * height)
  for (let i = 0; i < hole.length; i++) hole[i] = distance[i] <= MARK_GROWTH ? 1 : 0
  const image = ctx.getImageData(x, y, width, height)
  healPixels(image.data, width, height, hole)
  ctx.putImageData(image, x, y)
}
