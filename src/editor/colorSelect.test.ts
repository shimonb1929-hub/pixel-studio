import { describe, expect, it } from 'vitest'
import { colorMask } from './colorSelect.ts'

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
