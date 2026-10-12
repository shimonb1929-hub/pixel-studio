import { describe, expect, it } from 'vitest'
import {
  blurValues,
  distanceToShape,
  EFFECT_LOOKS,
  effectPixels,
  effectsLabel,
  effectsReach,
  growShape,
  hasEffects,
  matchingEffectLook,
  NO_EFFECTS,
  sameEffects,
} from './effects.ts'

// A width × height picture, solid where `solid` says so.
function square(width: number, height: number, solid: (x: number, y: number) => boolean): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) alpha[y * width + x] = solid(x, y) ? 255 : 0
  return alpha
}

describe('distanceToShape', () => {
  it('measures straight-line distance to the nearest solid pixel', () => {
    const inside = new Uint8Array(9 * 9)
    inside[4 * 9 + 4] = 1
    const d = distanceToShape(inside, 9, 9)
    expect(d[4 * 9 + 4]).toBe(0)
    expect(d[4 * 9 + 7]).toBeCloseTo(3)
    expect(d[0]).toBeCloseTo(Math.hypot(4, 4))
  })
})

describe('growShape', () => {
  it('grows a shape outward by the given amount, with a soft edge', () => {
    const alpha = Float32Array.from(square(21, 1, (x) => x >= 10), (v) => v / 255)
    const grown = growShape(alpha, 21, 1, 3)
    expect(grown[10]).toBe(1)
    expect(grown[7]).toBe(1)
    expect(grown[6]).toBe(0)
    expect(growShape(alpha, 21, 1, 2.5)[7]).toBeCloseTo(0.5)
  })

  it('leaves the shape alone when there is nothing to grow', () => {
    const alpha = new Float32Array([0, 1, 0])
    expect(growShape(alpha, 3, 1, 0.2)).toBe(alpha)
  })
})

describe('blurValues', () => {
  it('keeps the total amount and fades out past the edges', () => {
    const values = new Float32Array(41 * 41)
    values[20 * 41 + 20] = 1
    const soft = blurValues(values, 41, 41, 3)
    const total = soft.reduce((sum, v) => sum + v, 0)
    expect(total).toBeCloseTo(1, 3)
    expect(soft[20 * 41 + 20]).toBeLessThan(0.1)
    expect(soft[0]).toBe(0)
  })
})

describe('effectPixels', () => {
  const size = 40
  const solid = (x: number, y: number) => x >= 15 && x < 25 && y >= 15 && y < 25
  const content = square(size, size, solid)

  it('puts an outline of the right color around the outside only', () => {
    const out = effectPixels(content, size, size, { shadow: null, glow: null, outline: { color: '#ff0000', width: 3 } })
    const at = (x: number, y: number) => Array.from(out.slice((y * size + x) * 4, (y * size + x) * 4 + 4))
    expect(at(13, 20)).toEqual([255, 0, 0, 255])
    expect(at(10, 20)[3]).toBe(0)
  })

  it('casts a shadow the right way', () => {
    const out = effectPixels(content, size, size, { shadow: { color: '#000000', opacity: 1, blur: 0, distance: 6, angle: 90 }, glow: null, outline: null })
    const alpha = (x: number, y: number) => out[(y * size + x) * 4 + 3]
    expect(alpha(20, 28)).toBe(255)
    expect(alpha(20, 12)).toBe(0)
    expect(alpha(28, 20)).toBe(0)
    // Nothing shows through the object itself.
    expect(alpha(20, 20)).toBe(0)
  })

  it('makes a glow that fades with distance', () => {
    const out = effectPixels(content, size, size, { shadow: null, glow: { color: '#ffff00', opacity: 1, size: 8 }, outline: null })
    const alpha = (x: number, y: number) => out[(y * size + x) * 4 + 3]
    expect(alpha(20, 26)).toBeGreaterThan(alpha(20, 30))
    expect(alpha(20, 30)).toBeGreaterThan(0)
    expect(out[(26 * size + 20) * 4 + 2]).toBe(0)
  })
})

describe('effect settings', () => {
  it('knows when there are no effects', () => {
    expect(hasEffects(null)).toBe(false)
    expect(hasEffects(NO_EFFECTS)).toBe(false)
    expect(hasEffects({ ...NO_EFFECTS, glow: { color: '#ffffff', opacity: 1, size: 4 } })).toBe(true)
  })

  it('reaches far enough for every effect', () => {
    expect(effectsReach(null)).toBe(0)
    expect(effectsReach({ ...NO_EFFECTS, shadow: { color: '#000000', opacity: 1, blur: 10, distance: 20, angle: 90 } })).toBeGreaterThanOrEqual(35)
    expect(effectsReach({ ...NO_EFFECTS, outline: { color: '#000000', width: 12 } })).toBeGreaterThanOrEqual(12)
  })

  it('recognizes ready-made effects and names them for Undo', () => {
    const sticker = EFFECT_LOOKS.find((look) => look.id === 'sticker')!
    expect(matchingEffectLook(sticker.effects(2), 2)?.id).toBe('sticker')
    expect(matchingEffectLook(null, 2)?.id).toBe('none')
    expect(effectsLabel(sticker.effects(2), 2)).toBe('Sticker effect')
    expect(effectsLabel(null, 2)).toBe('Remove effects')
    const changed = { ...sticker.effects(2), glow: { color: '#ffffff', opacity: 1, size: 3 } }
    expect(sameEffects(changed, sticker.effects(2))).toBe(false)
    expect(effectsLabel(changed, 2)).toBe('Change effects')
  })
})
