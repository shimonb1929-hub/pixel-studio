import { describe, expect, it } from 'vitest'
import { placeTile, RIM, TILE, tileInput, tilePlan, type Pixels } from './enlargeTiles.ts'

function photo(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4)
  return { data, width, height }
}

// Stands in for the AI: each pixel becomes a factor × factor block of itself.
function blocks(planes: Float32Array, n: number, factor: number): Float32Array {
  const m = n * factor
  const out = new Float32Array(3 * m * m)
  for (let c = 0; c < 3; c++) for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) out[c * m * m + y * m + x] = planes[c * n * n + Math.floor(y / factor) * n + Math.floor(x / factor)]
  return out
}

describe('AI enlarger squares', () => {
  it('cover the whole photo once, in sizes the AI can use', () => {
    const tiles = tilePlan(150, 70)
    let area = 0
    for (const t of tiles) {
      area += t.width * t.height
      expect(t.readSize % 8).toBe(0)
      expect(t.readX).toBe(t.x - RIM)
      expect(t.width).toBeLessThanOrEqual(TILE)
    }
    expect(area).toBe(150 * 70)
  })

  it('go back together without seams', () => {
    const source = photo(150, 70)
    const result = { width: 300, height: 140, data: new Uint8ClampedArray(300 * 140 * 4).fill(255) }
    for (const tile of tilePlan(source.width, source.height)) placeTile(result, tile, blocks(tileInput(source, tile), tile.readSize, 2), 2)
    for (let y = 0; y < 140; y++) {
      for (let x = 0; x < 300; x++) {
        const want = Array.from(source.data.slice(((y >> 1) * 150 + (x >> 1)) * 4, ((y >> 1) * 150 + (x >> 1)) * 4 + 3))
        expect(Array.from(result.data.slice((y * 300 + x) * 4, (y * 300 + x) * 4 + 3))).toEqual(want)
      }
    }
  })

  it('mirror the photo past its edges, so the AI sees no black border', () => {
    const source = photo(5, 5)
    const tile = tilePlan(5, 5)[0]
    const input = tileInput(source, tile)
    const n = tile.readSize
    // Read position -1 is the photo's pixel 1.
    expect(input[(RIM - 1) * n + (RIM - 1)]).toBeCloseTo(source.data[(1 * 5 + 1) * 4] / 255)
  })
})
