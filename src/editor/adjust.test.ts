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
  SLIDER_KEYS,
  adjustLocalLight,
  autoColor,
  autoLight,
  channelTables,
  colorRangeWeights,
  curveTable,
  finishPixels,
  sameAdjustments,
  tidyAdjustments,
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
      for (const key of SLIDER_KEYS) expect(Math.abs(settings[key])).toBeLessThanOrEqual(1)
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

// A gray picture whose left half is `dark` and right half `light`.
function halves(width: number, height: number, dark: number, light: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(x < width / 2 ? [dark, dark, dark, 255] : [light, light, light, 255], (y * width + x) * 4)
  }
  return data
}

describe('dark parts, bright parts and clear details', () => {
  it('dark parts lifts the dark half and barely touches the bright half', () => {
    const data = halves(80, 20, 40, 220)
    adjustLocalLight(data, 80, 20, set({ shadows: 1 }), 80)
    expect(at(data, 80, 5, 10)[0]).toBeGreaterThan(80)
    expect(Math.abs(at(data, 80, 75, 10)[0] - 220)).toBeLessThan(6)
  })

  it('calming bright parts darkens the bright half and barely touches the dark half', () => {
    const data = halves(80, 20, 40, 230)
    adjustLocalLight(data, 80, 20, set({ highlights: -1 }), 80)
    expect(at(data, 80, 75, 10)[0]).toBeLessThan(200)
    expect(Math.abs(at(data, 80, 5, 10)[0] - 40)).toBeLessThan(6)
  })

  it('keeps colors, black, white and see-through pixels as they are', () => {
    const data = pixels([200, 60, 30, 255], [0, 0, 0, 255], [255, 255, 255, 255], [9, 9, 9, 0])
    adjustLocalLight(data, 4, 1, set({ shadows: 0.6 }), 4)
    const [r, g, b] = at(data, 4, 0, 0)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(at(data, 4, 1, 0)).toEqual([0, 0, 0, 255])
    expect(at(data, 4, 2, 0)).toEqual([255, 255, 255, 255])
    expect(at(data, 4, 3, 0)).toEqual([9, 9, 9, 0])
  })

  it('clear details make an edge stand out, and leave a flat picture alone', () => {
    const edge = halves(80, 4, 100, 150)
    adjustLocalLight(edge, 80, 4, set({ clarity: 1 }), 80)
    expect(at(edge, 80, 39, 2)[0]).toBeLessThan(100)
    expect(at(edge, 80, 40, 2)[0]).toBeGreaterThan(150)
    const flat = solid(20, 20, [120, 120, 120, 255])
    adjustLocalLight(flat, 20, 20, set({ clarity: 1 }), 20)
    expect(Math.abs(at(flat, 20, 10, 10)[0] - 120)).toBeLessThanOrEqual(1)
  })

  it('looks further around than it reaches', () => {
    expect(adjustmentReach(set({ shadows: 1 }), 1000)).toBe(0)
  })
})

describe('whites, blacks and the light curve', () => {
  it('whites and blacks move their own end most, and keep the other end', () => {
    const [whites] = channelTables(set({ whites: 1 }))
    expect(whites[200]).toBe(255)
    expect(whites[200] - 200).toBeGreaterThan(whites[64] - 64)
    expect(whites[0]).toBe(0)
    const [blacks] = channelTables(set({ blacks: -1 }))
    expect(blacks[50]).toBe(0)
    expect(blacks[255]).toBe(255)
    const [dim] = channelTables(set({ whites: -1 }))
    expect(dim[255]).toBeLessThan(190)
    const [faded] = channelTables(set({ blacks: 1 }))
    expect(faded[0]).toBeGreaterThan(60)
  })

  it('a curve runs through its points without wobbling', () => {
    const table = curveTable([
      [0, 0],
      [0.25, 0.4],
      [1, 1],
    ])
    expect(table[0]).toBeCloseTo(0)
    expect(table[64]).toBeCloseTo(0.4, 1)
    expect(table[255]).toBeCloseTo(1)
    for (let i = 1; i < 256; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1] - 1e-6)
    const straight = curveTable([
      [0, 0],
      [1, 1],
    ])
    for (let i = 0; i < 256; i += 15) expect(straight[i] * 255).toBeCloseTo(i, 3)
  })

  it('a curve for one color changes only that color', () => {
    const data = pixels([100, 100, 100, 255])
    adjustColors(data, set({ curve: { blue: [[0, 0], [0.5, 0.75], [1, 1]] } }))
    expect(data[0]).toBe(100)
    expect(data[1]).toBe(100)
    expect(data[2]).toBeGreaterThan(140)
  })

  it('an inverted curve makes a negative', () => {
    const data = pixels([30, 30, 30, 255])
    adjustColors(data, set({ curve: { all: [[0, 1], [1, 0]] } }))
    expect(data[0]).toBe(225)
  })
})

describe('colors', () => {
  it('green or pink tints the way it says', () => {
    const pink = pixels([128, 128, 128, 255])
    adjustColors(pink, set({ tint: 1 }))
    expect(pink[0]).toBeGreaterThan(pink[1])
    expect(pink[2]).toBeGreaterThan(pink[1])
    const green = pixels([128, 128, 128, 255])
    adjustColors(green, set({ tint: -1 }))
    expect(green[1]).toBeGreaterThan(green[0])
  })

  it('a gentle color boost lifts dull colors more than strong ones', () => {
    const dull = pixels([140, 120, 110, 255])
    const strong = pixels([230, 40, 30, 255])
    adjustColors(dull, set({ vibrance: 1 }))
    adjustColors(strong, set({ vibrance: 1 }))
    expect((dull[0] - dull[2]) / 30).toBeGreaterThan(1.8)
    expect(strong[0] - strong[2]).toBeLessThan(260)
  })

  it('changing one color leaves the others alone', () => {
    const blueAndRed = pixels([40, 80, 220, 255], [220, 30, 30, 255], [128, 128, 128, 255])
    adjustColors(blueAndRed, set({ colors: { blue: { hue: 0, strength: -1, light: 0 } } }))
    const [r, g, b] = at(blueAndRed, 3, 0, 0)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(10)
    expect(at(blueAndRed, 3, 1, 0)).toEqual([220, 30, 30, 255])
    expect(at(blueAndRed, 3, 2, 0)).toEqual([128, 128, 128, 255])
  })

  it('one color shifts its shade toward a neighbor and changes its light', () => {
    const blue = pixels([40, 80, 220, 255])
    adjustColors(blue, set({ colors: { blue: { hue: 1, strength: 0, light: 0 } } }))
    expect(blue[0]).toBeGreaterThan(80)
    const darker = pixels([40, 80, 220, 255])
    adjustColors(darker, set({ colors: { blue: { hue: 0, strength: 0, light: -1 } } }))
    expect(darker[2]).toBeLessThan(180)
  })

  it('splits every hue between two neighboring color families', () => {
    expect(colorRangeWeights(0)).toEqual({ first: 0, second: 1, mix: 0 })
    expect(colorRangeWeights(222).first).toBe(5)
    const between = colorRangeWeights(340)
    expect(between.first).toBe(7)
    expect(between.second).toBe(0)
    expect(between.mix).toBeGreaterThan(0)
    expect(between.mix).toBeLessThan(1)
  })
})

describe('dark corners and grain', () => {
  const place = (size: number) => ({ x: 0, y: 0, scale: 1, frame: { x: 0, y: 0, width: size, height: size }, size })

  it('darkens the corners and leaves the middle', () => {
    const data = solid(41, 41, [200, 200, 200, 255])
    finishPixels(data, 41, 41, set({ vignette: 1 }), place(41))
    expect(at(data, 41, 20, 20)[0]).toBe(200)
    expect(at(data, 41, 0, 0)[0]).toBeLessThan(80)
    const light = solid(41, 41, [100, 100, 100, 255])
    finishPixels(light, 41, 41, set({ vignette: -1 }), place(41))
    expect(at(light, 41, 0, 0)[0]).toBeGreaterThan(200)
  })

  it('adds even grain that is the same every time, and keeps the overall light', () => {
    const one = solid(60, 60, [128, 128, 128, 255])
    const two = solid(60, 60, [128, 128, 128, 255])
    finishPixels(one, 60, 60, set({ grain: 1 }), place(60))
    finishPixels(two, 60, 60, set({ grain: 1 }), place(60))
    expect(one).toEqual(two)
    let total = 0
    let spread = 0
    for (let i = 0; i < one.length; i += 4) {
      total += one[i]
      spread += Math.abs(one[i] - 128)
      expect(one[i]).toBe(one[i + 1])
    }
    expect(Math.abs(total / 3600 - 128)).toBeLessThan(4)
    expect(spread / 3600).toBeGreaterThan(4)
  })
})

describe('automatic fixes', () => {
  it('Fix light opens up big dark areas without darkening the rest', () => {
    const data = halves(40, 10, 35, 215)
    const fix = autoLight(data)
    expect(fix.shadows).toBeGreaterThan(0.3)
    expect(fix.brightness).toBe(0)
  })

  it('Fix light brightens a dark, dull photo and stretches it to black and white', () => {
    const data = new Uint8ClampedArray(100 * 4)
    for (let i = 0; i < 100; i++) data.set([30 + i, 30 + i, 30 + i, 255], i * 4)
    const fix = autoLight(data)
    expect(fix.brightness).toBeGreaterThan(0)
    expect(fix.whites).toBeGreaterThan(0)
    expect(fix.blacks).toBeLessThan(0)
    const out = data.slice()
    adjustColors(out, set(fix))
    expect(out[99 * 4]).toBeGreaterThan(200)
  })

  it('Fix light leaves a well-lit photo nearly alone', () => {
    // Mostly middle tones, with a little of everything from black to white.
    const tones: number[] = []
    for (let v = 0; v < 256; v++) for (let k = 0; k < 1 + Math.round(20 * Math.exp(-(((v - 120) / 50) ** 2))); k++) tones.push(v)
    const data = new Uint8ClampedArray(tones.length * 4)
    tones.forEach((v, i) => data.set([v, v, v, 255], i * 4))
    const fix = autoLight(data)
    for (const value of Object.values(fix)) expect(Math.abs(value as number)).toBeLessThan(0.15)
  })

  it('Fix colors takes away a cast so grays come out gray', () => {
    const data = new Uint8ClampedArray(50 * 4)
    for (let i = 0; i < 50; i++) data.set([120 + i, 125 + i, 95 + i, 255], i * 4)
    const fix = autoColor(data)
    expect(fix.warmth).toBeLessThan(0)
    const out = data.slice()
    adjustColors(out, set(fix))
    const before = Math.abs(data[0] - data[2])
    expect(Math.abs(out[0] - out[2])).toBeLessThan(before / 2)
  })

  it('finds nothing to fix in an empty picture', () => {
    expect(autoLight(new Uint8ClampedArray(40))).toEqual({})
    expect(autoColor(new Uint8ClampedArray(40))).toEqual({})
  })
})

describe('settings', () => {
  it('a straight curve or an unchanged color is the same as none', () => {
    const plain = set({ brightness: 0.2 })
    const extras = set({ brightness: 0.2, curve: { all: [[0, 0], [1, 1]] }, colors: { red: { hue: 0, strength: 0, light: 0 } } })
    expect(sameAdjustments(plain, extras)).toBe(true)
    expect(tidyAdjustments(extras)).toEqual(plain)
    expect(isNeutral(set({ curve: { red: [[0, 0], [0.5, 0.5], [1, 1]] } }))).toBe(true)
    expect(isNeutral(set({ curve: { red: [[0, 0.1], [1, 1]] } }))).toBe(false)
  })

  it('names a single change for undo', () => {
    expect(adjustmentLabel(set({ shadows: 0.4 }))).toBe('Dark parts')
    expect(adjustmentLabel(set({ curve: { all: [[0, 0.1], [1, 1]] } }))).toBe('Light curve')
    expect(adjustmentLabel(set({ colors: { blue: { hue: 0.2, strength: 0, light: 0 } } }))).toBe('Change one color')
    expect(describeAdjustment('vignette', 0.5)).toBe('Dark corners.')
    expect(describeAdjustment('grain', 0)).toBe('No grain.')
  })
})
