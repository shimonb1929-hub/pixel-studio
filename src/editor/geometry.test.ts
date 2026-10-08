import { describe, expect, it } from 'vitest'
import {
  clampRect,
  containsRect,
  ellipsePolygon,
  intersectRect,
  pointInRect,
  polygonBounds,
  rectFromCorners,
  rectPolygon,
  snapRect,
  squareFromCorners,
  unionRect,
} from './geometry.ts'

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

  it('finds where two rectangles overlap', () => {
    expect(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 5,
    })
    expect(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBeNull()
  })

  it('knows when one rectangle holds another', () => {
    expect(containsRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 2, y: 2, width: 8, height: 8 })).toBe(true)
    expect(containsRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 2, y: 2, width: 9, height: 8 })).toBe(false)
  })

  it('snaps outward to whole pixels and trims to the design', () => {
    expect(snapRect({ x: 1.5, y: 2.2, width: 3, height: 3 })).toEqual({ x: 1, y: 2, width: 4, height: 4 })
    expect(clampRect({ x: 1.5, y: 2.2, width: 3, height: 3 }, 100, 100)).toEqual({ x: 1, y: 2, width: 4, height: 4 })
    expect(clampRect({ x: -10, y: -10, width: 20, height: 20 }, 5, 5)).toEqual({ x: 0, y: 0, width: 5, height: 5 })
    expect(clampRect({ x: 95, y: 95, width: 20, height: 20 }, 100, 100)).toEqual({ x: 95, y: 95, width: 5, height: 5 })
  })

  it('returns nothing for rectangles outside the design', () => {
    expect(clampRect({ x: 200, y: 0, width: 10, height: 10 }, 100, 100)).toBeNull()
    expect(clampRect({ x: -30, y: -30, width: 10, height: 10 }, 100, 100)).toBeNull()
  })

  it('builds rectangles from two corners in any order', () => {
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, width: 6, height: 18 })
    expect(squareFromCorners({ x: 10, y: 10 }, { x: 4, y: 30 })).toEqual({ x: -10, y: 10, width: 20, height: 20 })
  })

  it('tests points against rectangles', () => {
    expect(pointInRect({ x: 0, y: 0 }, { x: 0, y: 0, width: 1, height: 1 })).toBe(true)
    expect(pointInRect({ x: 1, y: 0 }, { x: 0, y: 0, width: 1, height: 1 })).toBe(false)
  })
})

describe('polygons', () => {
  it('turns a rectangle into four corners', () => {
    expect(polygonBounds(rectPolygon({ x: 1, y: 2, width: 3, height: 4 }))).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('makes round ellipses that fill their box', () => {
    const points = ellipsePolygon({ x: 0, y: 0, width: 200, height: 100 })
    expect(points.length).toBeGreaterThanOrEqual(48)
    const bounds = polygonBounds(points)!
    expect(bounds.x).toBeCloseTo(0)
    expect(bounds.width).toBeCloseTo(200)
    expect(bounds.height).toBeGreaterThan(99.5)
  })

  it('has no bounds when empty', () => {
    expect(polygonBounds([])).toBeNull()
  })
})
