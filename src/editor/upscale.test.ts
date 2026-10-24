import { describe, expect, it } from 'vitest'
import type { PixelLayer } from './types.ts'
import { busiestSpot, printDetail, upscalePart, upscalePixels, upscalePlan, withUpscaledPixels, type Pixels } from './upscale.ts'

function picture(width: number, height: number, color: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = color(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

function at(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4
  return Array.from(p.data.subarray(i, i + 4))
}

// A repeatable "random" number from 0 to 1, so the noise is the same every run.
function noise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function spread(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

describe('upscalePixels', () => {
  it('makes the picture two or four times as wide and tall', () => {
    const source = picture(5, 3, () => [10, 20, 30])
    expect(upscalePixels(source, 2)).toMatchObject({ width: 10, height: 6 })
    const four = upscalePixels(source, 4)
    expect(four).toMatchObject({ width: 20, height: 12 })
    expect(four.data.length).toBe(20 * 12 * 4)
  })

  it('keeps one plain color exactly the same', () => {
    const big = upscalePixels(picture(8, 8, () => [200, 120, 40]), 2)
    for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) expect(at(big, x, y)).toEqual([200, 120, 40, 255])
  })

  it('keeps a hard edge crisp without light or dark rims', () => {
    const source = picture(16, 4, (x) => (x < 8 ? [30, 30, 30] : [220, 220, 220]))
    const big = upscalePixels(source, 4)
    const row = Array.from({ length: big.width }, (_, x) => at(big, x, 6)[0])
    // No rim much brighter or darker than the two sides.
    expect(Math.min(...row)).toBeGreaterThanOrEqual(22)
    expect(Math.max(...row)).toBeLessThanOrEqual(228)
    // The step from dark to light is short: only a few new pixels lie in between.
    const between = row.filter((v) => v > 60 && v < 190).length
    expect(between).toBeLessThanOrEqual(4)
    // Far from the edge the colors are the old ones.
    expect(row[2]).toBe(30)
    expect(row[big.width - 3]).toBe(220)
  })

  it('makes edges steeper than plain resampling', () => {
    const source = picture(24, 4, (x) => [x < 12 ? 40 : 200, x < 12 ? 40 : 200, x < 12 ? 40 : 200])
    const plain = upscalePixels(source, 2, { sharpen: 0 })
    const sharp = upscalePixels(source, 2)
    const steepest = (p: Pixels) => Math.max(...Array.from({ length: p.width - 1 }, (_, x) => Math.abs(at(p, x + 1, 3)[0] - at(p, x, 3)[0])))
    expect(steepest(sharp)).toBeGreaterThan(steepest(plain))
  })

  it('does not make grain in flat areas stronger', () => {
    const source = picture(32, 32, (x, y) => {
      const v = 128 + Math.round((noise(x * 31 + y) - 0.5) * 8)
      return [v, v, v]
    })
    const plain = upscalePixels(source, 2, { sharpen: 0 })
    const sharp = upscalePixels(source, 2)
    const values = (p: Pixels) => Array.from({ length: p.width * p.height }, (_, i) => p.data[i * 4])
    expect(spread(values(sharp))).toBeLessThanOrEqual(spread(values(plain)) * 1.05)
  })

  it('keeps see-through edges free of a dark fringe', () => {
    // Red on the left, fully see-through (stored as black) on the right.
    const source = picture(12, 4, (x) => (x < 6 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const big = upscalePixels(source, 2)
    for (let x = 0; x < big.width; x++) {
      const [r, g, b, a] = at(big, x, 3)
      if (a === 0) continue
      expect(r).toBeGreaterThanOrEqual(250)
      expect(Math.max(g, b)).toBeLessThanOrEqual(3)
    }
    expect(at(big, 1, 1)[3]).toBe(255)
    expect(at(big, big.width - 2, 1)[3]).toBe(0)
  })

  it('tells how far along it is', () => {
    const shares: number[] = []
    upscalePixels(picture(20, 20, () => [0, 0, 0]), 2, { onProgress: (s) => shares.push(s) })
    expect(shares.length).toBeGreaterThan(2)
    expect(shares[shares.length - 1]).toBe(1)
    expect([...shares].sort((a, b) => a - b)).toEqual(shares)
  })
})

describe('upscalePart', () => {
  it('matches the same spot of the whole result', () => {
    const source = picture(30, 30, (x, y) => [(x * 37 + y * 11) % 256, (x * x + y) % 256, (y * 53) % 256])
    const whole = upscalePixels(source, 2)
    const part = upscalePart(source, 2, 10, 12, 8)
    expect(part).toMatchObject({ width: 16, height: 16 })
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(at(part, x, y)).toEqual(at(whole, 20 + x, 24 + y))
  })
})

describe('busiestSpot', () => {
  it('finds the detailed part of a mostly plain picture', () => {
    const source = picture(64, 64, (x, y) => (x >= 40 && y >= 40 && (x + y) % 2 ? [0, 0, 0] : [255, 255, 255]))
    const spot = busiestSpot(source, 16)
    expect(spot.x).toBeGreaterThanOrEqual(32)
    expect(spot.y).toBeGreaterThanOrEqual(32)
  })
})

describe('upscalePlan', () => {
  it('says when a result is fine, large or too big', () => {
    expect(upscalePlan(3000, 2000, 2)).toMatchObject({ width: 6000, height: 4000, verdict: 'ok' })
    expect(upscalePlan(4000, 4000, 2).verdict).toBe('large')
    expect(upscalePlan(4000, 3000, 4).verdict).toBe('too-big')
    // Too wide for the browser, even though not many pixels.
    expect(upscalePlan(9000, 10, 2).verdict).toBe('too-big')
  })

  it('works out how many photo pixels fall on an inch of paper', () => {
    expect(printDetail(600, 900, 300)).toBe(200)
    expect(printDetail(1200, 900, 300)).toBe(400)
  })
})

describe('withUpscaledPixels', () => {
  const canvas = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement
  const layer = (box: PixelLayer['box']): PixelLayer => ({
    id: 'p',
    kind: 'raster',
    name: 'Photo',
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    canvas: canvas(100, 50),
    x: 10,
    y: 20,
    box,
  })

  it('keeps a photo at plain x, y in the same place and size', () => {
    const bigger = canvas(200, 100)
    const next = withUpscaledPixels(layer(null), bigger)
    expect(next.canvas).toBe(bigger)
    expect(next.box).toEqual({ cx: 60, cy: 45, width: 100, height: 50, rotation: 0 })
  })

  it('keeps a resized or turned photo in its box', () => {
    const box = { cx: 5, cy: 6, width: -300, height: 150, rotation: 0.4 }
    expect(withUpscaledPixels(layer(box), canvas(400, 200)).box).toEqual(box)
  })
})
