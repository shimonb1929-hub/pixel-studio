import { describe, expect, it } from 'vitest'
import { gapArea, gapHole, mostlySolid } from './gapFill.ts'

describe('gapHole', () => {
  it('covers the selected pixels and a little past their edge', () => {
    const marked = new Uint8Array(20 * 20)
    for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) marked[y * 20 + x] = 255
    const hole = gapHole(marked, 20, 20, 2)
    expect(hole[10 * 20 + 10]).toBe(1)
    expect(hole[10 * 20 + 6]).toBe(1)
    expect(hole[10 * 20 + 4]).toBe(0)
    expect(hole[0]).toBe(0)
  })

  it('counts a softly selected edge as part of the gap', () => {
    const marked = new Uint8Array(10)
    marked[5] = 40
    expect(gapHole(marked, 10, 1, 0)[5]).toBe(1)
  })
})

describe('gapArea', () => {
  it('looks around the gap, but never past the layer', () => {
    const area = gapArea({ x: 100, y: 100, width: 40, height: 40 }, { x: 0, y: 0, width: 400, height: 300 })!
    expect(area.x).toBeLessThan(100 - 40)
    expect(area.x + area.width).toBeGreaterThan(140 + 40)
    const edge = gapArea({ x: 0, y: 0, width: 40, height: 40 }, { x: 0, y: 0, width: 400, height: 300 })!
    expect(edge.x).toBe(0)
    expect(edge.y).toBe(0)
  })
})

describe('mostlySolid', () => {
  const rgba = (alphas: number[]) => new Uint8ClampedArray(alphas.flatMap((a) => [0, 0, 0, a]))
  it('is true for a photo around the gap', () => {
    expect(mostlySolid(rgba([255, 255, 0, 255]), Uint8Array.from([0, 0, 1, 0]))).toBe(true)
  })
  it('is false for a drawing with see-through paper around the gap', () => {
    expect(mostlySolid(rgba([255, 0, 0, 0]), Uint8Array.from([1, 0, 0, 0]))).toBe(false)
  })
})
