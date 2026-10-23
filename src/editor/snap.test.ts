import { describe, expect, it } from 'vitest'
import { linedUp, snapLines, snapMove } from './snap.ts'

const page = { x: 0, y: 0, width: 400, height: 300 }
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('snapMove', () => {
  it('clicks into the middle of the page when close, and shows the line', () => {
    // A 40 × 40 square moved to sit 3 pixels right of the page's middle.
    const result = snapMove(rect(0, 0, 40, 40), 183, 50, [], page, 6, true)
    expect(result.dx).toBe(180)
    expect(result.dy).toBe(50)
    expect(result.guides).toContainEqual({ axis: 'x', at: 200, from: 0, to: 300 })
  })

  it('leaves the move alone when nothing is close', () => {
    const result = snapMove(rect(0, 0, 40, 40), 120, 63, [], page, 6, true)
    expect([result.dx, result.dy]).toEqual([120, 63])
    expect(result.guides).toEqual([])
  })

  it('lines edges and middles up with other things, and the line spans both', () => {
    const other = rect(100, 200, 50, 50)
    // Left edges 2 apart, far from anything on the other axis.
    const result = snapMove(rect(0, 0, 30, 30), 102, 33, [other], page, 6, true)
    expect(result.dx).toBe(100)
    expect(result.guides).toContainEqual({ axis: 'x', at: 100, from: 33, to: 250 })
  })

  it('the closest line wins', () => {
    const result = snapMove(rect(0, 0, 10, 10), 97, 40, [rect(100, 200, 20, 20), rect(95, 250, 20, 20)], page, 6, true)
    expect(result.dx).toBe(95)
  })

  it('evens out the gaps between two neighbors', () => {
    const left = rect(0, 100, 50, 50)
    const right = rect(200, 100, 50, 50)
    // Halfway leaves 50 on each side: x 100 to 150.
    const result = snapMove(rect(0, 0, 50, 50), 103, 110, [left, right], { x: 0, y: 0, width: 1000, height: 1000 }, 6, true)
    expect(result.dx).toBe(100)
    expect(result.spacing).toEqual([{ axis: 'x', across: 130, gaps: [{ start: 50, end: 100 }, { start: 150, end: 200 }] }])
  })

  it('takes one more even step after two evenly spaced things', () => {
    const a = rect(0, 0, 40, 40)
    const b = rect(60, 0, 40, 40)
    // Gap 20, so the next one goes at 120.
    const result = snapMove(rect(0, 0, 40, 40), 124, 5, [a, b], { x: 0, y: 0, width: 1000, height: 1000 }, 6, true)
    expect(result.dx).toBe(120)
    expect(result.spacing[0].gaps).toEqual([
      { start: 40, end: 60 },
      { start: 100, end: 120 },
    ])
  })

  it('keeps fractions for shapes, whole pixels for pictures', () => {
    const other = rect(10.5, 200, 20, 20)
    expect(snapMove(rect(0, 0, 10, 10), 12, 40, [other], page, 6, false).dx).toBe(10.5)
    expect(snapMove(rect(0, 0, 10, 10), 12, 40, [other], page, 6, true).dx).toBe(11)
  })
})

describe('snapLines', () => {
  it('moves a pulled corner onto the nearest edge or middle, on each axis on its own', () => {
    const other = rect(100, 200, 50, 50)
    expect(snapLines(147, 13, [other], page, 6)).toEqual({ dx: 3, dy: null })
    expect(snapLines(null, 297, [other], page, 6)).toEqual({ dx: null, dy: 3 })
  })

  it('shows what a resized rectangle lines up with', () => {
    const guides = linedUp(rect(10, 10, 190, 40), [], page).guides
    expect(guides).toContainEqual({ axis: 'x', at: 200, from: 0, to: 300 })
  })
})
