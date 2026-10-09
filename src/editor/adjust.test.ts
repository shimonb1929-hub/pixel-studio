import { describe, expect, it } from 'vitest'
import {
  adjustColors,
  adjustmentLabel,
  adjustmentReach,
  adjustPixels,
  blurPixels,
  boxRadii,
  describeAdjustment,
  isNeutral,
  LOOKS,
  NO_ADJUSTMENTS,
  sharpenWith,
  toneTable,
  type Adjustments,
} from './adjust.ts'

function pixels(...colors: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat())
}

// A width × height image filled with one color.
function solid(width: number, height: number, color: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(color, i * 4)
  return data
}

const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

const set = (patch: Partial<Adjustments>): Adjustments => ({ ...NO_ADJUSTMENTS, ...patch })

describe('colors', () => {
  it('changes nothing when every slider is in the middle', () => {
    const data = pixels([12, 130, 250, 255], [255, 0, 0, 128], [0, 0, 0, 0])
    const before = data.slice()
    adjustPixels(data, 3, 1, NO_ADJUSTMENTS, 100)
    expect(data).toEqual(before)
    expect(Array.from(toneTable(0, 0))).toEqual(Array.from({ length: 256 }, (_, i) => i))
  })

  it('brightness lifts or lowers the middle tones and keeps black and white', () => {
    const lighter = toneTable(0.5, 0)
    const darker = toneTable(-0.5, 0)
    expect(lighter[128]).toBeGreaterThan(160)
    expect(darker[128]).toBeLessThan(96)
    for (const table of [lighter, darker]) {
      expect(table[0]).toBe(0)
      expect(table[255]).toBe(255)
    }
  })

  it('contrast pushes tones away from the middle, or pulls them in', () => {
    const more = toneTable(0, 0.5)
    const less = toneTable(0, -1)
    expect(more[64]).toBeLessThan(64)
    expect(more[192]).toBeGreaterThan(192)
    expect(Math.abs(less[0] - 128)).toBeLessThan(25)
    expect(Math.abs(less[255] - 128)).toBeLessThan(25)
  })

  it('color strength at the far left is black and white', () => {
    const data = pixels([200, 40, 90, 255])
    adjustColors(data, set({ saturation: -1 }))
    const [r, g, b, a] = data
    expect(Math.max(Math.abs(r - g), Math.abs(g - b))).toBeLessThanOrEqual(1)
    expect(a).toBe(255)
  })

  it('more color strength spreads the channels apart', () => {
    const data = pixels([150, 120, 100, 255])
    adjustColors(data, set({ saturation: 0.5 }))
    expect(data[0] - data[2]).toBeGreaterThan(50)
  })

  it('warmth tints toward orange or blue, and keeps the tint in black and white', () => {
    const warm = pixels([128, 128, 128, 255])
    adjustColors(warm, set({ warmth: 1 }))
    expect(warm[0]).toBeGreaterThan(warm[1])
    expect(warm[2]).toBeLessThan(warm[1])
    const cool = pixels([128, 128, 128, 255])
    adjustColors(cool, set({ warmth: -1 }))
    expect(cool[2]).toBeGreaterThan(cool[0])
    const sepia = pixels([30, 160, 220, 255])
    adjustColors(sepia, LOOKS.find((l) => l.id === 'old')!.settings)
    expect(sepia[0]).toBeGreaterThan(sepia[1])
    expect(sepia[1]).toBeGreaterThan(sepia[2])
  })

  it('leaves see-through pixels and opacity alone', () => {
    const data = pixels([10, 20, 30, 0], [100, 100, 100, 77])
    adjustColors(data, set({ brightness: 1, warmth: 1 }))
    expect(at(data, 2, 0, 0)).toEqual([10, 20, 30, 0])
    expect(data[7]).toBe(77)
  })
})

describe('blur', () => {
  it('splits a blur into three box sizes that grow with the strength', () => {
    expect(boxRadii(0.4).every((r) => r < 1)).toBe(true)
    const small = boxRadii(2)
    const big = boxRadii(10)
    expect(small).toHaveLength(3)
    expect(big[0]).toBeGreaterThan(small[0])
  })

  it('spreads a dot out and keeps its total amount', () => {
    const width = 21
    const data = solid(width, width, [0, 0, 0, 255])
    data.set([255, 255, 255, 255], (10 * width + 10) * 4)
    blurPixels(data, width, width, 2)
    expect(at(data, width, 10, 10)[0]).toBeLessThan(255)
    expect(at(data, width, 12, 10)[0]).toBeGreaterThan(0)
    let total = 0
    for (let i = 0; i < data.length; i += 4) total += data[i]
    expect(Math.abs(total - 255)).toBeLessThan(15)
  })

  it('keeps a solid picture solid right up to its edges', () => {
    const data = solid(30, 20, [40, 120, 200, 255])
    blurPixels(data, 30, 20, 6)
    for (const [x, y] of [[0, 0], [29, 19], [15, 10], [0, 19]]) expect(at(data, 30, x, y)).toEqual([40, 120, 200, 255])
  })

  it('blurs see-through edges without darkening the color', () => {
    const width = 20
    const data = solid(width, 1, [0, 0, 0, 0])
    for (let x = 0; x < 10; x++) data.set([255, 0, 0, 255], x * 4)
    blurPixels(data, width, 1, 2)
    const edge = at(data, width, 10, 0)
    expect(edge[3]).toBeGreaterThan(0)
    expect(edge[3]).toBeLessThan(255)
    expect(edge.slice(0, 3)).toEqual([255, 0, 0])
  })

  it('reaches further when stronger, scaled to the design', () => {
    expect(adjustmentReach(NO_ADJUSTMENTS, 1000)).toBe(0)
    expect(adjustmentReach(set({ blur: 1 }), 2000)).toBeGreaterThan(adjustmentReach(set({ blur: 1 }), 1000))
    expect(adjustmentReach(set({ blur: 1 }), 1000)).toBeGreaterThan(adjustmentReach(set({ blur: 0.3 }), 1000))
  })
})

describe('sharpen', () => {
  it('leaves flat areas alone and makes edges stand out', () => {
    const flat = solid(10, 10, [90, 90, 90, 255])
    adjustPixels(flat, 10, 10, set({ sharpen: 1 }), 3000)
    expect(at(flat, 10, 5, 5)).toEqual([90, 90, 90, 255])

    const width = 20
    const edge = solid(width, 1, [60, 60, 60, 255])
    for (let x = 10; x < width; x++) edge.set([180, 180, 180, 255], x * 4)
    const soft = edge.slice()
    blurPixels(soft, width, 1, 1.5)
    sharpenWith(edge, soft, 1.5)
    expect(at(edge, width, 9, 0)[0]).toBeLessThan(60)
    expect(at(edge, width, 10, 0)[0]).toBeGreaterThan(180)
    expect(at(edge, width, 0, 0)).toEqual([60, 60, 60, 255])
  })

  it('leaves see-through pixels and opacity alone', () => {
    const data = pixels([200, 0, 0, 0], [100, 100, 100, 50])
    sharpenWith(data, pixels([0, 0, 0, 0], [0, 0, 0, 0]), 1)
    expect(at(data, 2, 0, 0)).toEqual([200, 0, 0, 0])
    expect(at(data, 2, 1, 0)).toEqual([200, 200, 200, 50])
  })
})

describe('looks and words', () => {
  it('every look stays within the sliders, and Original changes nothing', () => {
    expect(isNeutral(LOOKS[0].settings)).toBe(true)
    for (const { settings } of LOOKS) {
      for (const value of Object.values(settings)) expect(Math.abs(value)).toBeLessThanOrEqual(1)
      expect(settings.blur).toBeGreaterThanOrEqual(0)
      expect(settings.sharpen).toBeGreaterThanOrEqual(0)
    }
  })

  it('names the change for undo', () => {
    const mono = LOOKS.find((l) => l.id === 'mono')!
    expect(adjustmentLabel(mono.settings)).toBe('Black & white look')
    expect(adjustmentLabel({ ...mono.settings, brightness: 0.2 })).toBe('Adjust colors')
    expect(adjustmentLabel(set({ brightness: 0.2 }))).toBe('Brightness')
    expect(adjustmentLabel(set({ blur: 0.5 }))).toBe('Blur')
  })

  it('says what each slider position means', () => {
    expect(describeAdjustment('brightness', 0)).toBe('No change.')
    expect(describeAdjustment('brightness', 0.2)).toBe('A little lighter.')
    expect(describeAdjustment('brightness', -0.9)).toBe('Much darker.')
    expect(describeAdjustment('saturation', -1)).toBe('Black and white.')
    expect(describeAdjustment('blur', 0.5)).toBe('Blurry.')
    expect(describeAdjustment('warmth', -0.5)).toBe('Cooler and more blue.')
  })
})
