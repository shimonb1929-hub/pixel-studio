import { describe, expect, it } from 'vitest'
import { pathBounds } from './path.ts'
import type { ShapeGeometry } from './types.ts'
import { isWarped, warpedPaths } from './warp.ts'

const rect: ShapeGeometry = { type: 'rectangle', corners: 0, sides: 4, arrow: false }

describe('bending shapes', () => {
  it('leaves a straight shape as it is', () => {
    expect(isWarped(rect)).toBe(false)
    expect(isWarped({ ...rect, warp: { kind: 'arch', amount: 0 } })).toBe(false)
    expect(warpedPaths(rect, 100, 50, [])[0].nodes).toHaveLength(4)
  })

  it('arches up in the middle and stays inside its box', () => {
    const [path] = warpedPaths({ ...rect, warp: { kind: 'arch', amount: 0.5 } }, 100, 50, [])
    const b = pathBounds(path)!
    expect(b.minX).toBeCloseTo(-0.5, 6)
    expect(b.maxX).toBeCloseTo(0.5, 6)
    expect(b.minY).toBeCloseTo(-0.5, 6)
    expect(b.maxY).toBeCloseTo(0.5, 6)
    const top = path.nodes.filter((n) => n.y < 0)
    const middle = top.reduce((a, n) => (Math.abs(n.x) < Math.abs(a.x) ? n : a))
    const corner = top.reduce((a, n) => (n.x < a.x ? n : a))
    expect(middle.y).toBeLessThan(corner.y - 0.15)
  })

  it('bends every kind, both ways, without losing the shape', () => {
    for (const kind of ['arch', 'bulge', 'wave', 'flag', 'twist'] as const) {
      for (const amount of [-1, 1]) {
        const paths = warpedPaths({ ...rect, warp: { kind, amount } }, 80, 80, [])
        expect(paths[0].closed).toBe(true)
        expect(paths[0].nodes.length).toBe(32)
        for (const n of paths[0].nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
      }
    }
  })
})
