import { describe, expect, it } from 'vitest'
import { colorMask, paintedMask } from './colorSelect.ts'

// A 4 × 1 strip: red, red, blue, red.
const strip = new Uint8ClampedArray([255, 0, 0, 255, 250, 5, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255])

describe('colorMask', () => {
  it('picks only the touching similar colors', () => {
    expect([...colorMask(strip, 4, 1, 0, 0, 10, true)!]).toEqual([1, 1, 0, 0])
  })

  it('picks that color everywhere when touching is off', () => {
    expect([...colorMask(strip, 4, 1, 0, 0, 10, false)!]).toEqual([1, 1, 0, 1])
  })

  it('a low tolerance picks only the exact color', () => {
    expect([...colorMask(strip, 4, 1, 0, 0, 0, false)!]).toEqual([1, 0, 0, 1])
  })

  it('nothing off the design', () => {
    expect(colorMask(strip, 4, 1, 9, 0, 10, true)).toBeNull()
  })
})

// 10 × 10: a red square from (2,2) to (6,6) on white, with a lighter red pixel inside it.
function picture(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(255)
  for (let y = 2; y <= 6; y++) {
    for (let x = 2; x <= 6; x++) {
      const p = (y * 10 + x) * 4
      data.set([220, 20, 20, 255], p)
    }
  }
  data.set([235, 35, 30, 255], (4 * 10 + 5) * 4)
  return data
}

const count = (mask: Uint8Array) => mask.reduce((n, v) => n + v, 0)

describe('paintedMask', () => {
  it('a small stroke inside spreads to the whole square and stops at its edge', () => {
    const mask = paintedMask(picture(), 10, 10, [{ x: 3.5, y: 3.5 }, { x: 4.5, y: 3.5 }], 0.8, 40)!
    expect(count(mask)).toBe(25)
    expect(mask[0]).toBe(0)
    expect(mask[4 * 10 + 5]).toBe(1)
  })

  it('a stroke over red and white picks both', () => {
    const mask = paintedMask(picture(), 10, 10, [{ x: 0.5, y: 4.5 }, { x: 3.5, y: 4.5 }], 0.8, 40)!
    expect(count(mask)).toBe(100)
  })

  it('nothing for a stroke off the design', () => {
    expect(paintedMask(picture(), 10, 10, [{ x: 50, y: 50 }], 2, 40)).toBeNull()
  })
})
