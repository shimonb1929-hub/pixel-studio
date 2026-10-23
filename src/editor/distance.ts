// How far each pixel is from a shape. Plain numbers only, so it also works away from the page.

const FAR = 1e20

// Distance along one row or column to the nearest point that's in the shape (squared). `f` holds 0
// for points in the shape and FAR for the rest. Felzenszwalb and Huttenlocher's method, which takes
// the same time however far things are.
function distances1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

// For every pixel, how far it is from the nearest pixel that's in the shape (0 inside it).
export function distanceToShape(inside: Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(width, height)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const grid = new Float64Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = inside[i] ? 0 : FAR
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    distances1d(f, height, d, v, z)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    distances1d(f, width, d, v, z)
    for (let x = 0; x < width; x++) out[row + x] = Math.sqrt(d[x])
  }
  return out
}
