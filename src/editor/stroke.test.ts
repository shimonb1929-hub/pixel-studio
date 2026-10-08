import { describe, expect, it } from 'vitest'
import { clampRect, unionRect } from './stroke.ts'

describe('rectangles', () => {
  it('joins two rectangles', () => {
    expect(unionRect(null, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    expect(unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: -5, width: 10, height: 10 })).toEqual({
      x: 0,
      y: -5,
      width: 15,
      height: 15,
    })
  })

  it('snaps outward to whole pixels and trims to the design', () => {
    expect(clampRect({ x: 1.5, y: 2.2, width: 3, height: 3 }, 100, 100)).toEqual({ x: 1, y: 2, width: 4, height: 4 })
    expect(clampRect({ x: -10, y: -10, width: 20, height: 20 }, 5, 5)).toEqual({ x: 0, y: 0, width: 5, height: 5 })
    expect(clampRect({ x: 95, y: 95, width: 20, height: 20 }, 100, 100)).toEqual({ x: 95, y: 95, width: 5, height: 5 })
  })

  it('returns nothing for rectangles outside the design', () => {
    expect(clampRect({ x: 200, y: 0, width: 10, height: 10 }, 100, 100)).toBeNull()
    expect(clampRect({ x: -30, y: -30, width: 10, height: 10 }, 100, 100)).toBeNull()
  })
})
