import { describe, expect, it } from 'vitest'
import { combineAreas, combinedShape } from './combine.ts'
import type { ShapeLayer } from './types.ts'

function square(id: string, x: number, y: number, size: number, type: 'rectangle' | 'ellipse' = 'rectangle'): ShapeLayer {
  return {
    id,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: x + size / 2, cy: y + size / 2, width: size, height: size, rotation: 0 },
    geometry: { type, corners: 0, sides: 6, arrow: false },
    fill: { kind: 'color', color: '#ff0000' },
    outline: null,
  }
}

// The area inside outlines, where an odd number of them go around.
function area(outlines: { x: number; y: number }[][]): number {
  let total = 0
  for (const ring of outlines) {
    let sum = 0
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]
      sum += p.x * q.y - q.x * p.y
    })
    total += sum / 2
  }
  return Math.abs(total)
}

describe('making one shape out of several', () => {
  // Two 100 × 100 squares overlapping by a 50 × 50 corner.
  const a = square('a', 0, 0, 100)
  const b = square('b', 50, 50, 100)

  it('joins, cuts out, keeps the overlap, or cuts it away', () => {
    expect(area(combineAreas([a, b], 'join'))).toBeCloseTo(17500, 0)
    expect(area(combineAreas([a, b], 'cut'))).toBeCloseTo(7500, 0)
    expect(area(combineAreas([a, b], 'overlap'))).toBeCloseTo(2500, 0)
    // Apart: two L shapes, each 7500.
    expect(combineAreas([a, b], 'apart').length).toBeGreaterThanOrEqual(2)
  })

  it('cutting a smaller shape out of the middle leaves a hole', () => {
    const big = square('big', 0, 0, 100)
    const hole = square('hole', 25, 25, 50, 'ellipse')
    const outlines = combineAreas([big, hole], 'cut')
    expect(outlines).toHaveLength(2)
    expect(Math.abs(area([outlines[0]]) - area([outlines[1]]))).toBeCloseTo(10000 - Math.PI * 625, -1)
    const shape = combinedShape(big, outlines, 'new', 'Shape 1')!
    expect(shape.box).toEqual({ cx: 50, cy: 50, width: 100, height: 100, rotation: 0 })
    expect(shape.geometry.parts).toHaveLength(1)
    expect(shape.fill).toEqual(big.fill)
  })

  it('nothing is left of shapes that do not overlap', () => {
    expect(combineAreas([square('a', 0, 0, 10), square('b', 50, 50, 10)], 'overlap')).toEqual([])
  })
})
