// Cutting a photo into small squares for the AI enlarger and putting the bigger squares back
// together. The AI works on one square at a time (it needs a lot of memory per pixel), with a rim
// of the photo around each square so it sees what's next to it; only the middle of each bigger
// square is kept, so no seams show where squares meet.

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

// The squares' size, and the rim around each, in photo pixels. The AI needs sizes it can split
// into 8 × 8 windows, so a square with its rim is always a whole number of 8s.
export const TILE = 64
export const RIM = 8

export interface Tile {
  // The part of the photo this square fills in the result (before enlarging).
  x: number
  y: number
  width: number
  height: number
  // The part read for it, rim included (may reach past the photo's edges: those are mirrored).
  readX: number
  readY: number
  readSize: number
}

export function tilePlan(width: number, height: number): Tile[] {
  const tiles: Tile[] = []
  const readSize = TILE + 2 * RIM
  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      tiles.push({ x, y, width: Math.min(TILE, width - x), height: Math.min(TILE, height - y), readX: x - RIM, readY: y - RIM, readSize })
    }
  }
  return tiles
}

// A photo position kept inside it by mirroring at its edges (…2 1 0 1 2…).
function mirror(i: number, size: number): number {
  if (size === 1) return 0
  const period = 2 * (size - 1)
  let m = ((i % period) + period) % period
  if (m >= size) m = period - m
  return m
}

// The square's colors for the AI: red, then green, then blue planes, each 0 to 1. See-through
// parts count as their own color (their see-through is enlarged separately).
export function tileInput(source: Pixels, tile: Tile): Float32Array {
  const n = tile.readSize
  const out = new Float32Array(3 * n * n)
  for (let ty = 0; ty < n; ty++) {
    const sy = mirror(tile.readY + ty, source.height)
    for (let tx = 0; tx < n; tx++) {
      const sx = mirror(tile.readX + tx, source.width)
      const at = (sy * source.width + sx) * 4
      const o = ty * n + tx
      out[o] = source.data[at] / 255
      out[n * n + o] = source.data[at + 1] / 255
      out[2 * n * n + o] = source.data[at + 2] / 255
    }
  }
  return out
}

// Puts the middle of one bigger square (the AI's answer, planes of 0 to 1, `factor` times the
// square's size) into the result. See-through stays as it is in `result`.
export function placeTile(result: Pixels, tile: Tile, planes: Float32Array, factor: number): void {
  const n = tile.readSize * factor
  const rim = RIM * factor
  for (let y = 0; y < tile.height * factor; y++) {
    const ry = tile.y * factor + y
    for (let x = 0; x < tile.width * factor; x++) {
      const rx = tile.x * factor + x
      const o = (y + rim) * n + (x + rim)
      const at = (ry * result.width + rx) * 4
      result.data[at] = planes[o] * 255
      result.data[at + 1] = planes[n * n + o] * 255
      result.data[at + 2] = planes[2 * n * n + o] * 255
    }
  }
}
