import { describe, expect, it } from 'vitest'
import { cornerNode } from '../editor/path.ts'
import { flatten, topOfPath } from './textCurve.ts'

const square = { closed: true, nodes: [cornerNode({ x: -10, y: -10 }), cornerNode({ x: 10, y: -10 }), cornerNode({ x: 10, y: 10 }), cornerNode({ x: -10, y: 10 })] }

describe('text along an edge', () => {
  it('measures the edge all the way round', () => {
    expect(flatten(square).total).toBeCloseTo(80)
  })

  it('starts words at the top, upright when the edge runs left to right there', () => {
    // The top of a square that goes round clockwise is its first side, running right.
    const top = topOfPath(square)
    expect(top.flip).toBe(false)
    expect(top.at).toBeLessThan(0.25)
    // Going the other way round, the words are turned so they still stand upright.
    const backwards = { ...square, nodes: [...square.nodes].reverse() }
    expect(topOfPath(backwards).flip).toBe(true)
  })

  it('puts words on the middle of an open line', () => {
    const line = { closed: false, nodes: [cornerNode({ x: 0, y: 0 }), cornerNode({ x: 100, y: 0 })] }
    expect(topOfPath(line)).toEqual({ at: 0.5, flip: false })
  })
})
