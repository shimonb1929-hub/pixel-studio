import { describe, expect, it } from 'vitest'
import { applyPerspective, combinePerspective, facing, frontSize, invertPerspective, isConvex, quadArea, scaleMove, squareToQuad, warpPixels, type Quad } from './corners.ts'

const slanted: Quad = [
  { x: 10, y: 20 },
  { x: 110, y: 5 },
  { x: 130, y: 90 },
  { x: 0, y: 100 },
]

describe('perspective maps', () => {
  it('take the square’s corners onto the four corners', () => {
    const m = squareToQuad(slanted)
    const corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ].map((p) => applyPerspective(m, p))
    corners.forEach((p, i) => {
      expect(p.x).toBeCloseTo(slanted[i].x, 6)
      expect(p.y).toBeCloseTo(slanted[i].y, 6)
    })
  })

  it('a parallelogram needs no perspective', () => {
    const m = squareToQuad([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 5 },
      { x: 5, y: 5 },
    ])
    expect(m[6]).toBe(0)
    expect(m[7]).toBe(0)
    expect(applyPerspective(m, { x: 0.5, y: 0.5 })).toEqual({ x: 7.5, y: 2.5 })
  })

  it('turned around, they take each point back', () => {
    const m = squareToQuad(slanted)
    const back = invertPerspective(m)
    const p = applyPerspective(back, applyPerspective(m, { x: 0.3, y: 0.8 }))
    expect(p.x).toBeCloseTo(0.3, 9)
    expect(p.y).toBeCloseTo(0.8, 9)
  })

  it('face the side a point is on', () => {
    const m = invertPerspective(squareToQuad(slanted))
    const flipped = m.map((v) => -v) as typeof m
    const inside = { x: 60, y: 50 }
    const w = (p: typeof m) => p[6] * inside.x + p[7] * inside.y + p[8]
    expect(w(facing(m, inside))).toBeGreaterThan(0)
    expect(w(facing(flipped, inside))).toBeGreaterThan(0)
  })

  it('combine with the second one first', () => {
    const m = combinePerspective(scaleMove(2, 2, 0, 0), scaleMove(1, 1, 5, 0))
    expect(applyPerspective(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 })
  })
})

describe('shapes', () => {
  it('only shapes with no dents or crossed sides count', () => {
    expect(isConvex(slanted)).toBe(true)
    const crossed: Quad = [slanted[0], slanted[2], slanted[1], slanted[3]]
    expect(isConvex(crossed)).toBe(false)
    const dented: Quad = [slanted[0], { x: 60, y: 60 }, slanted[2], slanted[3]]
    expect(isConvex(dented)).toBe(false)
  })

  it('measure their area and front size', () => {
    const square: Quad = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
    ]
    expect(quadArea(square)).toBe(1200)
    expect(frontSize(square)).toEqual({ width: 40, height: 30 })
  })
})

describe('warpPixels', () => {
  // A 2 × 2 picture: red, green / blue, white, all solid.
  const source = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  }

  it('copies pixels exactly when nothing moves', () => {
    expect([...warpPixels(source, scaleMove(1, 1, 0, 0), 2, 2)]).toEqual([...source.data])
  })

  it('mirrors when the map mirrors', () => {
    const out = warpPixels(source, scaleMove(-1, 1, 2, 0), 2, 2)
    expect([...out.slice(0, 4)]).toEqual([0, 255, 0, 255])
  })

  it('leaves what shows nothing see-through and fades the edge', () => {
    // The new picture is 4 wide; the source covers only its left half.
    const out = warpPixels(source, scaleMove(1, 1, 0, 0), 4, 2)
    expect(out[2 * 4 + 3]).toBe(0)
    expect(out[3 * 4 + 3]).toBe(0)
    expect(out[1 * 4 + 3]).toBe(255)
  })

  it('leaves what is past two edges at once see-through too', () => {
    const out = warpPixels(source, scaleMove(1, 1, 0, 0), 4, 4)
    expect(out[(3 * 4 + 3) * 4 + 3]).toBe(0)
  })

  it('never darkens colors next to see-through pixels', () => {
    const half = { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]) }
    // Halfway between the two pixels.
    const out = warpPixels(half, scaleMove(1, 1, 0.5, 0), 1, 1)
    expect([...out.slice(0, 3)]).toEqual([255, 255, 255])
    expect(out[3]).toBeGreaterThan(100)
    expect(out[3]).toBeLessThan(150)
  })
})
