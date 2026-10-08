import { describe, expect, it } from 'vitest'
import { traceOutline } from './outline.ts'

// Builds a grid from rows like '.##.', where # is selected.
function grid(rows: string[]) {
  const width = rows[0].length
  const height = rows.length
  const data = new Uint8Array(width * height)
  rows.forEach((row, y) => [...row].forEach((c, x) => (data[y * width + x] = c === '#' ? 1 : 0)))
  return { data, width, height }
}

function trace(rows: string[], offsetX = 0, offsetY = 0) {
  const g = grid(rows)
  return traceOutline(g.data, g.width, g.height, offsetX, offsetY)
}

describe('traceOutline', () => {
  it('finds nothing in an empty grid', () => {
    expect(trace(['...', '...'])).toEqual({ loops: [], bounds: null })
  })

  it('outlines a single pixel with its four corners', () => {
    const { loops, bounds } = trace(['#'])
    expect(loops).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]])
    expect(bounds).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('keeps only the corners of a block', () => {
    const { loops, bounds } = trace(['....', '.##.', '.##.', '....'])
    expect(loops).toHaveLength(1)
    expect(loops[0]).toHaveLength(4)
    expect(bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('follows an L shape around six corners', () => {
    const { loops } = trace(['#.', '##'])
    expect(loops).toHaveLength(1)
    expect(loops[0]).toHaveLength(6)
  })

  it('outlines a hole as its own loop', () => {
    const { loops, bounds } = trace(['###', '#.#', '###'])
    expect(loops).toHaveLength(2)
    expect(loops.map((l) => l.length).sort()).toEqual([4, 4])
    expect(bounds).toEqual({ x: 0, y: 0, width: 3, height: 3 })
  })

  it('keeps pixels that only touch at a corner as separate shapes', () => {
    const { loops } = trace(['#.', '.#'])
    expect(loops).toHaveLength(2)
    expect(loops.every((l) => l.length === 4)).toBe(true)
  })

  it('moves the result by the offset', () => {
    const { loops, bounds } = trace(['#'], 10, 20)
    expect(loops[0][0]).toEqual({ x: 10, y: 20 })
    expect(bounds).toEqual({ x: 10, y: 20, width: 1, height: 1 })
  })

  it('handles selections touching the grid edges', () => {
    const { loops } = trace(['##', '##'])
    expect(loops).toEqual([[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]])
  })
})
