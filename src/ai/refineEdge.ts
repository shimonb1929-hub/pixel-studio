// Makes what the AI found follow the real edges of the picture, down to the fine detail.
//
// The AI sees the picture small, so its edge is soft and a little off: it cuts through a sleeve or
// leaves a bit of sky by an ear. This moves the edge to where the colors really change (a "guided
// filter": near the edge, each pixel is judged by how much its color looks like the inside or the
// outside nearby). Away from the edge nothing changes.

// Sums each square of (2r+1)×(2r+1) pixels around every pixel, divided by how many pixels it holds
// (squares are cut short at the sides of the picture).
function boxMean(src: Float32Array, width: number, height: number, r: number, out: Float32Array, row: Float32Array) {
  // Across each row first, then down each column, with running sums so any size costs the same.
  for (let y = 0; y < height; y++) {
    const base = y * width
    let sum = 0
    for (let x = 0; x <= Math.min(r, width - 1); x++) sum += src[base + x]
    for (let x = 0; x < width; x++) {
      const left = x - r
      const right = x + r
      row[x] = sum / (Math.min(right, width - 1) - Math.max(left, 0) + 1)
      if (right + 1 < width) sum += src[base + right + 1]
      if (left >= 0) sum -= src[base + left]
    }
    out.set(row.subarray(0, width), base)
  }
  const column = new Float32Array(height)
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = 0; y <= Math.min(r, height - 1); y++) sum += out[y * width + x]
    for (let y = 0; y < height; y++) {
      const top = y - r
      const bottom = y + r
      column[y] = sum / (Math.min(bottom, height - 1) - Math.max(top, 0) + 1)
      if (bottom + 1 < height) sum += out[(bottom + 1) * width + x]
      if (top >= 0) sum -= out[top * width + x]
    }
    for (let y = 0; y < height; y++) out[y * width + x] = column[y]
  }
}

export interface RefineOptions {
  // How far (in pixels) the edge may move to find the real one.
  radius?: number
  // Smaller follows colors more closely; bigger keeps the AI's own edge more.
  smoothness?: number
}

// `chance` says, from 0 to 1, how sure the AI is that each pixel is part of the thing. `rgb` is the
// picture, three numbers a pixel. The answer is the same kind of 0-to-1 grid, with edges that hug
// the picture. Only the part around the edge is worked on, so a small thing in a big picture is quick.
export function refineEdge(chance: Float32Array, rgb: ArrayLike<number>, width: number, height: number, options: RefineOptions = {}): Float32Array {
  const r = options.radius ?? Math.max(2, Math.round(Math.max(width, height) / 220))
  const eps = options.smoothness ?? 4e-4
  const result = Float32Array.from(chance)

  // The box around every pixel the AI wasn't sure of, with room for the filter to look around.
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = chance[y * width + x]
      // Where the AI's answer changes from yes to no (or isn't sure) is the edge.
      const right = x + 1 < width ? chance[y * width + x + 1] : c
      const below = y + 1 < height ? chance[(y + 1) * width + x] : c
      if ((c > 0.02 && c < 0.98) || Math.abs(c - right) > 0.5 || Math.abs(c - below) > 0.5) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return result
  const pad = r * 2 + 1
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(width - 1, x1 + pad)
  y1 = Math.min(height - 1, y1 + pad)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const n = w * h

  const I = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  const p = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const j = (y + y0) * width + (x + x0)
      p[i] = chance[j]
      for (let c = 0; c < 3; c++) I[c][i] = rgb[j * 3 + c] / 255
    }
  }

  const row = new Float32Array(w)
  const tmp = new Float32Array(n)
  const mean = (src: Float32Array) => {
    const out = new Float32Array(n)
    boxMean(src, w, h, r, out, row)
    return out
  }
  const product = (a: Float32Array, b: Float32Array) => {
    for (let i = 0; i < n; i++) tmp[i] = a[i] * b[i]
    return mean(tmp)
  }

  const meanI = I.map(mean)
  const meanP = mean(p)
  const covIp = I.map((Ic, c) => {
    const m = product(Ic, p)
    for (let i = 0; i < n; i++) m[i] -= meanI[c][i] * meanP[i]
    return m
  })
  // How the three colors vary together around each pixel (a 3×3 table; six numbers, as it's symmetric).
  const pairs: [number, number][] = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
    [2, 2],
  ]
  const variance = pairs.map(([a, b]) => {
    const m = product(I[a], I[b])
    for (let i = 0; i < n; i++) m[i] -= meanI[a][i] * meanI[b][i]
    return m
  })

  // For each pixel: the best straight-line rule "chance = a · color + b" for the colors around it.
  const A = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  const B = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const rr = variance[0][i] + eps
    const rg = variance[1][i]
    const rb = variance[2][i]
    const gg = variance[3][i] + eps
    const gb = variance[4][i]
    const bb = variance[5][i] + eps
    // The inverse of the symmetric table, written out.
    const i00 = gg * bb - gb * gb
    const i01 = rb * gb - rg * bb
    const i02 = rg * gb - rb * gg
    const i11 = rr * bb - rb * rb
    const i12 = rb * rg - rr * gb
    const i22 = rr * gg - rg * rg
    const det = rr * i00 + rg * i01 + rb * i02
    const c0 = covIp[0][i]
    const c1 = covIp[1][i]
    const c2 = covIp[2][i]
    const a0 = (i00 * c0 + i01 * c1 + i02 * c2) / det
    const a1 = (i01 * c0 + i11 * c1 + i12 * c2) / det
    const a2 = (i02 * c0 + i12 * c1 + i22 * c2) / det
    A[0][i] = a0
    A[1][i] = a1
    A[2][i] = a2
    B[i] = meanP[i] - a0 * meanI[0][i] - a1 * meanI[1][i] - a2 * meanI[2][i]
  }
  const meanA = A.map(mean)
  const meanB = mean(B)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const q = meanA[0][i] * I[0][i] + meanA[1][i] * I[1][i] + meanA[2][i] * I[2][i] + meanB[i]
      result[(y + y0) * width + (x + x0)] = Math.min(1, Math.max(0, q))
    }
  }
  return result
}
