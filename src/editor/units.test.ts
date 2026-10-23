import { describe, expect, it } from 'vitest'
import { changeBox } from './arrange.ts'
import { decimalInput, formatInUnit, signedDecimalInput, unitToPixels } from './units.ts'

describe('units', () => {
  it('turns pixels into inches, centimeters and millimeters and back', () => {
    // A4 at 300 pixels per inch.
    expect(formatInUnit(2480, 'in', 300)).toBe('8.27')
    expect(formatInUnit(2480, 'cm', 300)).toBe('21')
    expect(formatInUnit(3508, 'mm', 300)).toBe('297')
    expect(formatInUnit(2550, 'in', 300)).toBe('8.5')
    expect(formatInUnit(12.6, 'px', 300)).toBe('13')
    expect(unitToPixels(8.5, 'in', 300)).toBe(2550)
    expect(unitToPixels(21, 'cm', 300)).toBe(2480)
    expect(unitToPixels(297, 'mm', 300)).toBe(3508)
    expect(unitToPixels(3, 'in', 72)).toBe(216)
  })

  it('reads typed numbers', () => {
    expect(decimalInput('8.5.1')).toBe('8.51')
    expect(decimalInput('8,5 in')).toBe('8.5')
    expect(signedDecimalInput('-0.25')).toBe('-0.25')
    expect(signedDecimalInput('1-2')).toBe('12')
  })
})

describe('changeBox', () => {
  const box = { cx: 150, cy: 100, width: 100, height: 50, rotation: 0 }

  it('keeps the top-left corner when the size changes', () => {
    expect(changeBox(box, { width: 200 }, false)).toEqual({ cx: 200, cy: 100, width: 200, height: 50, rotation: 0 })
  })

  it('keeps the shape when asked', () => {
    expect(changeBox(box, { width: 200 }, true)).toEqual({ cx: 200, cy: 125, width: 200, height: 100, rotation: 0 })
    expect(changeBox(box, { height: 25 }, true)).toMatchObject({ width: 50, height: 25 })
  })

  it('never gets thinner than a pixel, and the kept shape follows the size really used', () => {
    expect(changeBox(box, { width: 0 }, true)).toMatchObject({ width: 1, height: 1 })
    expect(changeBox(box, { width: -5 }, false)).toMatchObject({ width: 1, height: 50 })
    expect(changeBox(box, { height: 0.5 }, true)).toMatchObject({ width: 2, height: 1 })
  })

  it('moves, turns, and keeps a flip', () => {
    expect(changeBox(box, { x: 0, y: 0 }, true)).toMatchObject({ cx: 50, cy: 25 })
    expect(changeBox(box, { angle: 90 }, true).rotation).toBeCloseTo(Math.PI / 2)
    expect(changeBox({ ...box, width: -100 }, { width: 40 }, false).width).toBe(-40)
  })
})
