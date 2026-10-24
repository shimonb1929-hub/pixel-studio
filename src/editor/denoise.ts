// Clean grain (what professionals call Reduce Noise or Denoise): takes away the fine speckles a
// photo taken in low light gets, while edges stay sharp. It's a "guided filter": in each small
// window, the cleaned light is a straight-line copy of the original light, so where the light
// hardly changes (a wall, the sky) it becomes its average, and where it changes a lot (an edge)
// it stays as it is. Colored speckles get a stronger cleaning, following the edges of the light.
// Everything is done with running averages, so it takes the same time whatever the strength.

// The pixels' light is split into lightness and two color parts, with the same lightness weights
// as the rest of Adjust.
const KR = 0.2126
const KG = 0.7152
const KB = 0.0722
const CB = 2 * (1 - KB)
const CR = 2 * (1 - KR)

// Photos with more pixels than this are cleaned the quick way (see cleanColors).
const QUICK_PIXELS = 2_500_000

// How far the cleaning of lightness looks, in the pixels being worked on. `size` is the design's
// longer side in those pixels, so a quick small preview looks like the finished picture.
export function denoiseRadius(amount: number, size: number): number {
  return Math.max(1, Math.round(size * 0.0006 * (0.5 + amount)))
}

// Color speckles are cleaned on a half-size copy, this far around (in its pixels).
function colorRadius(amount: number, size: number): number {
  return Math.max(1, Math.round(denoiseRadius(amount, size) * 1.5))
}

// How far past a pixel the cleaning looks, in the pixels being worked on.
export function denoiseLookAround(amount: number, size: number): number {
  if (amount <= 0) return 0
  return Math.max(2 * denoiseRadius(amount, size), 4 * colorRadius(amount, size) + 3)
}

// Averages each value with its neighbors within `r` along its row, then down its column, in place.
// Past the ends, the end value repeats. `ring` keeps the rows already written over, so no second
// copy of the whole picture is needed.
function boxInPlace(v: Float32Array, width: number, height: number, r: number, row: Float32Array, sums: Float32Array, ring: Float32Array): void {
  const scale = 1 / (2 * r + 1)
  const last = width - 1
  // `row` holds one row with its end values repeated r + 1 times on each side, so the running sum
  // never needs to check where the row ends.
  const off = r + 1
  for (let y = 0; y < height; y++) {
    const o = y * width
    row.set(v.subarray(o, o + width), off)
    const first = v[o]
    const end = v[o + last]
    for (let k = 0; k < off; k++) {
      row[k] = first
      row[off + width + k] = end
    }
    let s = 0
    for (let k = off - r; k <= off + r; k++) s += row[k]
    for (let x = 0; x < width; x++) {
      v[o + x] = s * scale
      s += row[off + x + r + 1] - row[off + x - r]
    }
  }
  const lastRow = height - 1
  for (let x = 0; x < width; x++) sums[x] = v[x] * (r + 1)
  for (let k = 1; k <= r; k++) {
    const o = Math.min(k, lastRow) * width
    for (let x = 0; x < width; x++) sums[x] += v[o + x]
  }
  const slots = r + 1
  for (let y = 0; y < height; y++) {
    const o = y * width
    // Row y as it was, for when it leaves the window r rows from now.
    ring.set(v.subarray(o, o + width), (y % slots) * width)
    const add = Math.min(y + r + 1, lastRow) * width
    const sub = (Math.max(y - r, 0) % slots) * width
    for (let x = 0; x < width; x++) {
      v[o + x] = sums[x] * scale
      // The row coming in hasn't been written over yet; the one leaving is kept in the ring.
      sums[x] += v[add + x] - ring[sub + x]
    }
  }
}

// Running averages over windows of one radius, reusing the same scratch space.
function averager(width: number, height: number, r: number) {
  const row = new Float32Array(width + 2 * r + 2)
  const sums = new Float32Array(width)
  const ring = new Float32Array((r + 1) * width)
  return (v: Float32Array) => boxInPlace(v, width, height, r, row, sums, ring)
}

// Cleans grain from `data` (RGBA) in place. `amount` is 0 to 1; `size` is the design's longer side
// in these pixels. See-through pixels don't count, so a photo's edge isn't darkened by the empty
// space beyond it, and how see-through each pixel is never changes.
export function denoisePixels(data: Uint8ClampedArray, width: number, height: number, amount: number, size: number): void {
  if (amount <= 0 || width < 2 || height < 2) return
  let opaque = true
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false
      break
    }
  }
  const strength = Math.min(1, 3 * amount)
  const lightRadius = denoiseRadius(amount, size)
  const lightEps = (0.085 * amount) ** 2
  // A big photo has its lightness cleaned on the half-size copy too.
  const quick = width * height > QUICK_PIXELS
  const smallLight = quick ? { r: Math.max(1, Math.round(lightRadius / 2)), eps: lightEps } : null
  const colors = cleanColors(data, width, height, opaque, colorRadius(amount, size), (0.07 * amount) ** 2, smallLight)
  const light = quick ? null : cleanLight(data, width, height, opaque, lightRadius, lightEps, strength)
  const { sw, sh, solid, acb, bcb, acr, bcr, lit } = colors
  const colorStrength = Math.min(1, 1.3 * strength)
  // Back to full detail by blending the four nearest small pixels: first between two rows of the
  // small copy, into these, then along the row.
  const sources = lit ? [solid, acb, bcb, acr, bcr, lit.solid, lit.a, lit.b] : [solid, acb, bcb, acr, bcr]
  const rows = sources.map(() => new Float32Array(sw))
  const [rowSolid, rowAcb, rowBcb, rowAcr, rowBcr, rowLit, rowAl, rowBl] = rows
  const x0s = new Int32Array(width)
  const x1s = new Int32Array(width)
  const txs = new Float32Array(width)
  for (let px = 0; px < width; px++) {
    const fx = Math.min(sw - 1, Math.max(0, (px - 0.5) / 2))
    x0s[px] = Math.floor(fx)
    x1s[px] = Math.min(sw - 1, x0s[px] + 1)
    txs[px] = fx - x0s[px]
  }
  for (let py = 0; py < height; py++) {
    const fy = Math.min(sh - 1, Math.max(0, (py - 0.5) / 2))
    const y0 = Math.floor(fy)
    const row0 = y0 * sw
    const row1 = Math.min(sh - 1, y0 + 1) * sw
    const ty = fy - y0
    for (let k = 0; k < sources.length; k++) {
      const src = sources[k]
      const dst = rows[k]
      for (let sx = 0; sx < sw; sx++) dst[sx] = src[row0 + sx] + (src[row1 + sx] - src[row0 + sx]) * ty
    }
    const o = py * width
    for (let px = 0; px < width; px++) {
      const i = (o + px) * 4
      if (data[i + 3] === 0) continue
      const a = x0s[px]
      const b = x1s[px]
      const t = txs[px]
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const bl = data[i + 2] / 255
      const y = KR * r + KG * g + KB * bl
      let cb = (bl - y) / CB
      let cr = (r - y) / CR
      let ny = y
      if (light) ny = light[o + px]
      else {
        const lt = rowLit[a] + (rowLit[b] - rowLit[a]) * t
        if (lt > 1e-4) ny += (((rowAl[a] + (rowAl[b] - rowAl[a]) * t) * y + rowBl[a] + (rowBl[b] - rowBl[a]) * t) / lt - y) * strength
      }
      const total = rowSolid[a] + (rowSolid[b] - rowSolid[a]) * t
      if (total > 1e-4) {
        const ab = rowAcb[a] + (rowAcb[b] - rowAcb[a]) * t
        const bb = rowBcb[a] + (rowBcb[b] - rowBcb[a]) * t
        const ar = rowAcr[a] + (rowAcr[b] - rowAcr[a]) * t
        const br = rowBcr[a] + (rowBcr[b] - rowBcr[a]) * t
        cb += ((ab * ny + bb) / total - cb) * colorStrength
        cr += ((ar * ny + br) / total - cr) * colorStrength
      }
      const nr = ny + CR * cr
      const nb = ny + CB * cb
      data[i] = nr * 255
      data[i + 1] = ((ny - KR * nr - KB * nb) / KG) * 255
      data[i + 2] = nb * 255
    }
  }
}

// The cleaned lightness of every pixel (0 to 1), already mixed with the original by `strength`.
function cleanLight(data: Uint8ClampedArray, width: number, height: number, opaque: boolean, r: number, eps: number, strength: number): Float32Array {
  const count = width * height
  const light = new Float32Array(count)
  const mean = new Float32Array(count)
  const square = new Float32Array(count)
  const weight = opaque ? null : new Float32Array(count)
  const kr = KR / 255
  const kg = KG / 255
  const kb = KB / 255
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    const l = kr * data[i] + kg * data[i + 1] + kb * data[i + 2]
    light[p] = l
    if (weight) {
      const w = data[i + 3] / 255
      weight[p] = w
      mean[p] = w * l
      square[p] = w * l * l
    } else {
      mean[p] = l
      square[p] = l * l
    }
  }
  const average = averager(width, height, r)
  average(mean)
  average(square)
  if (weight) average(weight)
  // In each window: how much of the light to keep (a) and the even light to add (b).
  for (let p = 0; p < count; p++) {
    const total = weight ? weight[p] : 1
    if (total < 1e-4) {
      mean[p] = 0
      square[p] = 0
      continue
    }
    const m = mean[p] / total
    const variance = Math.max(0, square[p] / total - m * m)
    const a = variance / (variance + eps)
    const w = weight ? data[p * 4 + 3] / 255 : 1
    mean[p] = w * a
    square[p] = w * (m - a * m)
  }
  // Each pixel takes the average a and b of every window it's in.
  average(mean)
  average(square)
  for (let p = 0; p < count; p++) {
    const l = light[p]
    const total = weight ? weight[p] : 1
    if (total < 1e-4) continue
    light[p] = l + ((mean[p] * l + square[p]) / total - l) * strength
  }
  return light
}

// How the color parts follow the lightness, worked out on a half-size copy (color speckles are
// cleaned over a wider area anyway). In each window, each color part is a straight-line copy of
// the lightness (a × light + b), so colors keep to the edges of the light. Each a and b is
// weighted by how solid its pixels are; `solid` is what to divide by.
//
// With `light`, the lightness is cleaned on the half-size copy too, the same way but guided by
// itself: far quicker for a big photo, and the result is applied to every pixel's own lightness,
// so edges stay just as sharp.
function cleanColors(data: Uint8ClampedArray, width: number, height: number, opaque: boolean, r: number, eps: number, light: { r: number; eps: number } | null) {
  const sw = Math.ceil(width / 2)
  const sh = Math.ceil(height / 2)
  const small = sw * sh
  // Each small pixel is the average of up to four, weighted by how solid they are.
  const own = new Float32Array(small)
  const y = new Float32Array(small)
  const cb = new Float32Array(small)
  const cr = new Float32Array(small)
  for (let py = 0; py < height; py++) {
    const srow = (py >> 1) * sw
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4
      const alpha = opaque ? 1 : data[i + 3] / 255
      if (alpha === 0) continue
      const rr = data[i] / 255
      const gg = data[i + 1] / 255
      const bb = data[i + 2] / 255
      const l = KR * rr + KG * gg + KB * bb
      const s = srow + (px >> 1)
      own[s] += alpha
      y[s] += alpha * l
      cb[s] += alpha * ((bb - l) / CB)
      cr[s] += alpha * ((rr - l) / CR)
    }
  }
  const yy = new Float32Array(small)
  const ycb = new Float32Array(small)
  const ycr = new Float32Array(small)
  for (let s = 0; s < small; s++) {
    const total = own[s]
    if (total === 0) continue
    const l = y[s] / total
    // From here on, each small pixel counts as much as its four were solid, on average.
    const k = total / 4
    own[s] = k
    y[s] = k * l
    yy[s] = k * l * l
    cb[s] = (k * cb[s]) / total
    cr[s] = (k * cr[s]) / total
    ycb[s] = l * cb[s]
    ycr[s] = l * cr[s]
  }
  const lit = light && cleanSmallLight(own, y, yy, sw, sh, light.r, light.eps)
  const solid = own.slice()
  const average = averager(sw, sh, r)
  for (const v of [solid, y, yy, cb, ycb, cr, ycr]) average(v)
  // Reusing the arrays: cb and ycb become a and b for one color part, cr and ycr for the other.
  for (let s = 0; s < small; s++) {
    const total = solid[s]
    if (total < 1e-4) {
      cb[s] = ycb[s] = cr[s] = ycr[s] = 0
      continue
    }
    const my = y[s] / total
    const variance = Math.max(0, yy[s] / total - my * my)
    const mcb = cb[s] / total
    const mcr = cr[s] / total
    const acb = (ycb[s] / total - my * mcb) / (variance + eps)
    const acr = (ycr[s] / total - my * mcr) / (variance + eps)
    const k = own[s]
    cb[s] = k * acb
    ycb[s] = k * (mcb - acb * my)
    cr[s] = k * acr
    ycr[s] = k * (mcr - acr * my)
  }
  // Each pixel takes the average a and b of every window it's in.
  for (const v of [cb, ycb, cr, ycr]) average(v)
  return { sw, sh, solid, acb: cb, bcb: ycb, acr: cr, bcr: ycr, lit }
}

// The guided filter for lightness on the half-size copy: `own` is how solid each small pixel is,
// `y` and `yy` its lightness and its square, both already weighted by `own`.
function cleanSmallLight(own: Float32Array, y: Float32Array, yy: Float32Array, sw: number, sh: number, r: number, eps: number) {
  const solid = own.slice()
  const a = y.slice()
  const b = yy.slice()
  const average = averager(sw, sh, r)
  for (const v of [solid, a, b]) average(v)
  for (let s = 0; s < solid.length; s++) {
    const total = solid[s]
    if (total < 1e-4) {
      a[s] = b[s] = 0
      continue
    }
    const m = a[s] / total
    const variance = Math.max(0, b[s] / total - m * m)
    const k = variance / (variance + eps)
    a[s] = own[s] * k
    b[s] = own[s] * (m - k * m)
  }
  average(a)
  average(b)
  return { solid, a, b }
}
