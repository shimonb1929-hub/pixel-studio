import { describe, expect, it } from 'vitest'
import { gridLines, gridPositions, gridStep, niceStep, rulerSpacing } from './grid.ts'

describe('grid', () => {
  it('picks round numbers', () => {
    expect(niceStep(0.7)).toBe(1)
    expect(niceStep(1.3)).toBe(2)
    expect(niceStep(2.2)).toBe(2.5)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(7)).toBe(10)
    expect(niceStep(48)).toBe(50)
    expect(niceStep(120)).toBe(200)
  })

  it('makes about twenty squares across the long side', () => {
    expect(gridStep(1080, 1080)).toBe(100)
    expect(gridStep(400, 300)).toBe(20)
    expect(gridStep(1000, 500)).toBe(50)
    expect(gridStep(10, 10)).toBe(1)
  })

  it('puts lines inside the page only', () => {
    expect(gridPositions(100, 25)).toEqual([25, 50, 75])
    expect(gridLines(100, 50, 25)).toEqual([
      { x: 25, y: 0, width: 0, height: 50 },
      { x: 50, y: 0, width: 0, height: 50 },
      { x: 75, y: 0, width: 0, height: 50 },
      { x: 0, y: 25, width: 100, height: 0 },
    ])
  })

  it('spaces ruler numbers so they never crowd', () => {
    // At 100%, numbers every 100 pixels with marks every 10.
    expect(rulerSpacing(1)).toEqual({ step: 100, minor: 10 })
    // Zoomed out to 25%, every 500 pixels.
    expect(rulerSpacing(4)).toEqual({ step: 500, minor: 5 })
    expect(rulerSpacing(0.5)).toEqual({ step: 50, minor: 5 })
  })
})
