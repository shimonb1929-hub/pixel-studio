import { describe, expect, it } from 'vitest'
import { rectPolygon } from './geometry.ts'
import { combineSelection, growAlpha, invertSelection, refineSelection, roughBounds, selectAll, softenAlpha, translateSelection } from './selection.ts'

const square = (x: number, y: number, size: number) => rectPolygon({ x, y, width: size, height: size })

describe('combineSelection', () => {
  it('starts fresh in replace mode', () => {
    const first = combineSelection(null, square(0, 0, 10), 'replace')!
    const second = combineSelection(first, square(20, 20, 10), 'replace')!
    expect(second.ops).toHaveLength(1)
    expect(roughBounds(second, 100, 100)).toEqual({ x: 20, y: 20, width: 10, height: 10 })
  })

  it('adds and removes shapes', () => {
    const first = combineSelection(null, square(0, 0, 10), 'replace')
    const added = combineSelection(first, square(20, 20, 10), 'add')!
    expect(roughBounds(added, 100, 100)).toEqual({ x: 0, y: 0, width: 30, height: 30 })
    const removed = combineSelection(added, square(0, 0, 10), 'subtract')!
    expect(removed.ops).toHaveLength(3)
  })

  it('adding to nothing selects the shape, removing from nothing selects nothing', () => {
    expect(combineSelection(null, square(0, 0, 10), 'add')?.ops).toHaveLength(1)
    expect(combineSelection(null, square(0, 0, 10), 'subtract')).toBeNull()
  })

  it('ignores shapes too small to have an area', () => {
    const first = combineSelection(null, square(0, 0, 10), 'replace')
    expect(combineSelection(first, [{ x: 1, y: 1 }], 'add')).toBe(first)
    expect(combineSelection(first, [{ x: 1, y: 1 }], 'replace')).toBeNull()
  })
})

describe('selectAll and invertSelection', () => {
  it('selects the whole design', () => {
    expect(roughBounds(selectAll(40, 30), 40, 30)).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('inverting nothing selects everything, and inverting covers the whole design', () => {
    expect(roughBounds(invertSelection(null, 40, 30)!, 40, 30)).toEqual({ x: 0, y: 0, width: 40, height: 30 })
    const inverted = invertSelection(combineSelection(null, square(5, 5, 5), 'replace'), 40, 30)!
    expect(roughBounds(inverted, 40, 30)).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })
})

describe('roughBounds and translateSelection', () => {
  it('trims to the design and snaps to whole pixels', () => {
    const selection = combineSelection(null, rectPolygon({ x: -5.5, y: 10.2, width: 20, height: 5 }), 'replace')!
    expect(roughBounds(selection, 100, 100)).toEqual({ x: 0, y: 10, width: 15, height: 6 })
  })

  it('is empty outside the design', () => {
    const selection = combineSelection(null, square(200, 200, 10), 'replace')!
    expect(roughBounds(selection, 100, 100)).toBeNull()
  })

  it('moves every shape', () => {
    const moved = translateSelection(combineSelection(null, square(0, 0, 10), 'replace')!, 5, -3)
    expect(roughBounds(moved, 100, 100)).toEqual({ x: 5, y: 0, width: 10, height: 7 })
  })
})

describe('edges', () => {
  // A 9 × 9 mask with a 3 × 3 square selected in the middle.
  const block = () => {
    const alpha = new Uint8ClampedArray(81)
    for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) alpha[y * 9 + x] = 255
    return alpha
  }
  const count = (alpha: Uint8ClampedArray) => alpha.filter((a) => a >= 128).length

  it('grows and shrinks the selected part', () => {
    const grown = block()
    growAlpha(grown, 9, 9, 1)
    // One pixel out on every side; the corners, a little further away, only partly.
    expect(count(grown)).toBe(25)
    expect(grown[4 * 9 + 2]).toBe(255)
    expect(grown[2 * 9 + 2]).toBeLessThan(255)
    expect(grown[4 * 9 + 1]).toBe(0)
    const shrunk = block()
    growAlpha(shrunk, 9, 9, -1)
    expect(count(shrunk)).toBe(1)
    expect(shrunk[4 * 9 + 4]).toBe(255)
  })

  it('softens the edge without moving it much', () => {
    const soft = block()
    softenAlpha(soft, 9, 9, 2)
    // The middle stays mostly selected, the corners far away stay out, and the edge is in between.
    expect(soft[4 * 9 + 4]).toBeGreaterThan(100)
    expect(soft[0]).toBe(0)
    expect(soft[4 * 9 + 2]).toBeGreaterThan(0)
    expect(soft[4 * 9 + 2]).toBeLessThan(soft[4 * 9 + 4])
  })

  it('a softened or grown selection reaches further', () => {
    const first = combineSelection(null, square(10, 10, 10), 'replace')!
    expect(roughBounds(refineSelection(first, { grow: 5, soften: 0 }), 100, 100)).toEqual({ x: 4, y: 4, width: 22, height: 22 })
    expect(roughBounds(refineSelection(first, { grow: -5, soften: 0 }), 100, 100)).toEqual({ x: 10, y: 10, width: 10, height: 10 })
    expect(refineSelection(first, { grow: 0, soften: 0 })).toBe(first)
  })
})
