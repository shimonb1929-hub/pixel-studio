import { describe, expect, it } from 'vitest'
import { ENLARGE_MAX_PIXELS, enlargePixels, enlargeStep, type Pixels } from './enlarge.ts'

function picture(width: number, height: number, color: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4)
  }
  return { width, height, data }
}

const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4))

describe('enlargeStep', () => {
  it('leaves pictures shown about their own size alone', () => {
    expect(enlargeStep(100, 100, 1)).toBeNull()
    expect(enlargeStep(100, 100, 1.1)).toBeNull()
  })

  it('picks the next copy size up', () => {
    expect(enlargeStep(100, 100, 1.4)).toBe(1.5)
    expect(enlargeStep(100, 100, 2)).toBe(2)
    expect(enlargeStep(100, 100, 2.6)).toBe(3)
    expect(enlargeStep(100, 100, 20)).toBe(8)
  })

  it('keeps copies to a size memory can hold', () => {
    const step = enlargeStep(2000, 2000, 5)!
    expect(2000 * step * 2000 * step).toBeLessThanOrEqual(ENLARGE_MAX_PIXELS)
    expect(enlargeStep(4000, 4000, 3)).toBeNull()
  })
})

describe('enlargePixels', () => {
  it('keeps one color the same color', () => {
    const out = enlargePixels(picture(5, 4, () => [200, 40, 90, 255]), 20, 16)
    for (let i = 0; i < out.data.length; i += 4) expect(Array.from(out.data.slice(i, i + 4))).toEqual([200, 40, 90, 255])
  })

  it('keeps an edge crisp, with no light or dark rims beside it', () => {
    const src = picture(8, 1, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const out = enlargePixels(src, 64, 1)
    const row = Array.from({ length: 64 }, (_, x) => at(out, x, 0)[0])
    // Never past black or white (the Lanczos way alone would ring there).
    expect(Math.min(...row)).toBe(0)
    expect(Math.max(...row)).toBe(255)
    // Far from the edge it's exactly the color it was.
    expect(row.slice(0, 20).every((v) => v === 0)).toBe(true)
    expect(row.slice(44).every((v) => v === 255)).toBe(true)
    // Goes from dark to light in fewer steps than plain blending (which takes 8 here).
    const between = row.filter((v) => v > 20 && v < 235).length
    expect(between).toBeLessThan(7)
  })

  it('gives see-through edges no dark fringe', () => {
    const src = picture(4, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const out = enlargePixels(src, 16, 1)
    for (let x = 0; x < 16; x++) {
      const [r, g, b, a] = at(out, x, 0)
      if (a > 0) expect([r, g, b]).toEqual([255, 0, 0])
    }
  })

  it('makes the size it is asked for', () => {
    const out = enlargePixels(picture(3, 7, (x, y) => [x * 80, y * 30, 0, 255]), 7, 20)
    expect(out.width).toBe(7)
    expect(out.height).toBe(20)
    expect(out.data.length).toBe(7 * 20 * 4)
  })
})
