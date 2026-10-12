import { describe, expect, it } from 'vitest'
import { gradientLine, reverseGradient, sameGradient, stopAt, type Gradient } from './gradient.ts'

const g: Gradient = {
  type: 'linear',
  angle: 0,
  stops: [
    { at: 0, color: '#000000', opacity: 1 },
    { at: 1, color: '#ffffff', opacity: 0 },
  ],
}

describe('gradients', () => {
  it('runs across the whole shape, corner to corner when slanted', () => {
    expect(gradientLine(0, 200, 100)).toEqual({ x0: -100, y0: -0, x1: 100, y1: 0 })
    const slanted = gradientLine(45, 100, 100)
    expect(slanted.x1).toBeCloseTo(50)
    expect(slanted.y1).toBeCloseTo(50)
  })

  it('adds a color that matches what the gradient already shows there', () => {
    expect(stopAt(g, 0.5)).toEqual({ at: 0.5, color: '#808080', opacity: 0.5 })
    expect(stopAt(g, 0)).toEqual(g.stops[0])
  })

  it('flips its colors around', () => {
    const flipped = reverseGradient(g)
    expect(flipped.stops[0]).toEqual({ at: 0, color: '#ffffff', opacity: 0 })
    expect(sameGradient(reverseGradient(flipped), g)).toBe(true)
  })
})
