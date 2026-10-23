import { describe, expect, it } from 'vitest'
import { refineEdge } from './refineEdge.ts'

// A picture with a red leaf shape on a gray-green ground, and what a blurry, slightly-off AI
// would say about it.
function scene(width: number, height: number) {
  const rgb = new Uint8Array(width * height * 3)
  const truth = new Uint8Array(width * height)
  const inside = (x: number, y: number) => Math.hypot((x - 50) / 30, (y - 40) / 18) <= 1 || (x > 70 && x < 90 && y > 36 && y < 42)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const yes = inside(x, y)
      truth[i] = yes ? 1 : 0
      const grain = ((x * 7 + y * 13) % 9) - 4
      rgb[i * 3] = yes ? 200 + grain : 90 + grain
      rgb[i * 3 + 1] = yes ? 40 + grain : 120 + grain
      rgb[i * 3 + 2] = yes ? 50 : 80
    }
  }
  // The AI's guess: the same shape seen soft and 3 pixels off to the side.
  const chance = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const sx = x + dx - 3
          const sy = y + dy
          count++
          if (sx >= 0 && sy >= 0 && sx < width && sy < height && inside(sx, sy)) sum++
        }
      }
      chance[y * width + x] = sum / count
    }
  }
  return { rgb, truth, chance }
}

const wrong = (found: Float32Array, truth: Uint8Array) => found.reduce((n, v, i) => n + ((v >= 0.5 ? 1 : 0) === truth[i] ? 0 : 1), 0)

describe('refineEdge', () => {
  it('moves a soft, slightly-off edge onto the real edge of the picture', () => {
    const width = 120
    const height = 80
    const { rgb, truth, chance } = scene(width, height)
    const before = wrong(chance, truth)
    const after = wrong(refineEdge(chance, rgb, width, height, { radius: 5 }), truth)
    expect(before).toBeGreaterThan(150)
    expect(after).toBeLessThan(before / 5)
  })

  it('also moves a hard yes/no edge that is off by a few pixels', () => {
    const width = 120
    const height = 80
    const { rgb, truth, chance } = scene(width, height)
    const hard = chance.map((c) => (c >= 0.5 ? 1 : 0))
    const before = wrong(hard, truth)
    const after = wrong(refineEdge(hard, rgb, width, height, { radius: 5 }), truth)
    expect(after).toBeLessThan(before / 3)
  })

  it('leaves a picture with nothing uncertain as it was', () => {
    const chance = new Float32Array(16).fill(1)
    expect(Array.from(refineEdge(chance, new Uint8Array(48), 4, 4))).toEqual(Array.from(chance))
  })
})
