import { describe, expect, it } from 'vitest'
import { drawnSize, PATTERN_KINDS, patternPath, softTint, startingPattern, type Pattern } from './pattern.ts'

// Counts what the pattern draws.
class Counter {
  shapes = 0
  points: [number, number][] = []
  moveTo(x: number, y: number) {
    this.shapes++
    this.points.push([x, y])
  }
  lineTo(x: number, y: number) {
    this.points.push([x, y])
  }
  bezierCurveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) {
    this.points.push([x, y])
  }
  closePath() {}
  roundRect() {}
  ellipse(x: number, y: number) {
    this.points.push([x, y])
  }
}

const dots: Pattern = { kind: 'dots', color: '#ff0000', background: null, size: 20, angle: 0 }

describe('pattern fills', () => {
  it('covers the whole shape, however it is turned', () => {
    for (const kind of PATTERN_KINDS) {
      for (const angle of [0, 30, 45, 90]) {
        const { points } = patternPath({ ...dots, kind, angle }, 200, 100, new Counter())
        const xs = points.map((p) => p[0])
        const ys = points.map((p) => p[1])
        expect(Math.min(...xs), `${kind} ${angle}`).toBeLessThanOrEqual(-100)
        expect(Math.max(...xs), `${kind} ${angle}`).toBeGreaterThanOrEqual(100)
        expect(Math.min(...ys), `${kind} ${angle}`).toBeLessThanOrEqual(-50)
        expect(Math.max(...ys), `${kind} ${angle}`).toBeGreaterThanOrEqual(50)
      }
    }
  })

  it('keeps its size when the shape grows: more dots, not bigger ones', () => {
    const small = patternPath(dots, 100, 100, new Counter()).shapes
    const big = patternPath(dots, 200, 200, new Counter()).shapes
    expect(big).toBeGreaterThan(small * 2.5)
  })

  it('draws checks on every other square only', () => {
    const all = patternPath({ ...dots, kind: 'dots' }, 100, 100, new Counter()).shapes
    const checks = patternPath({ ...dots, kind: 'checks' }, 100, 100, new Counter()).shapes
    expect(Math.abs(checks - all / 2)).toBeLessThanOrEqual(1)
  })

  it('never draws too many little shapes on a huge shape', () => {
    const tiny = { ...dots, size: 1 }
    expect(drawnSize(tiny, 10000, 10000)).toBeGreaterThan(1)
    expect(patternPath(tiny, 10000, 10000, new Counter()).shapes).toBeLessThan(8000)
  })

  it('starts with about eight repeats across the shape, and a soft tint behind', () => {
    expect(startingPattern('#000000', null, 400, 200).size).toBe(25)
    expect(startingPattern('#000000', null, 400, 200, 'stripes').angle).toBe(45)
    expect(softTint('#000000')).toBe('#cccccc')
    expect(softTint('#ff0000')).toBe('#ffcccc')
  })
})
