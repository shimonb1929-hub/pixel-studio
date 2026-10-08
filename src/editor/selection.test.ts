import { describe, expect, it } from 'vitest'
import { rectPolygon } from './geometry.ts'
import { combineSelection, invertSelection, roughBounds, selectAll, translateSelection } from './selection.ts'

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
