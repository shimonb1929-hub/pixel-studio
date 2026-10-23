import { describe, expect, it } from 'vitest'
import { layoutFrames, marginFor, marginSize } from './pageLayout.ts'
import { snapMove } from './snap.ts'

describe('margins and columns', () => {
  it('names margins by share of the shorter side', () => {
    expect(marginFor('medium', 1000, 2000)).toBe(70)
    expect(marginSize(70, 1000, 2000)).toBe('medium')
    expect(marginSize(71, 1000, 2000)).toBeNull()
  })

  it('splits the space inside the margins into equal columns', () => {
    const frames = layoutFrames({ width: 1000, height: 800, layout: { margin: 100, columns: 2, gap: 40 } })!
    expect(frames.inside).toEqual({ x: 100, y: 100, width: 800, height: 600 })
    expect(frames.columns).toEqual([
      { x: 100, y: 100, width: 380, height: 600 },
      { x: 520, y: 100, width: 380, height: 600 },
    ])
    expect(layoutFrames({ width: 1000, height: 800, layout: { margin: 0, columns: 1, gap: 40 } })).toBeNull()
    expect(layoutFrames({ width: 1000, height: 800 })).toBeNull()
  })

  it('things moved near a margin click to it, with a line along the page', () => {
    const page = { x: 0, y: 0, width: 1000, height: 800 }
    const inside = { x: 100, y: 100, width: 800, height: 600 }
    const box = { x: 300, y: 300, width: 50, height: 50 }
    const lined = snapMove(box, -196, 0, [], [page, inside], 8, true)
    expect(lined.dx).toBe(-200)
    expect(lined.guides).toContainEqual({ axis: 'x', at: 100, from: 100, to: 700 })
  })
})
