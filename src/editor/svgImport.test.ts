import { describe, expect, it } from 'vitest'
import { parsePathData } from './svgImport.ts'

const ends = (d: string) => parsePathData(d).map((o) => [o.start, ...o.curves.map((c) => c[2])].map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]))

describe('reading SVG path data', () => {
  it('reads moves, lines and closes, in big and small letters', () => {
    expect(ends('M10 10 L20 10 l0 10 H10 z')).toEqual([[[10, 10], [20, 10], [20, 20], [10, 20]]])
    const [outline] = parsePathData('M10 10 L20 10 l0 10 H10 z')
    expect(outline.closed).toBe(true)
  })

  it('treats numbers after a move as lines, and starts a new outline at each move', () => {
    expect(ends('M0 0 10 0 10 10 M50 50 h5')).toEqual([
      [[0, 0], [10, 0], [10, 10]],
      [[50, 50], [55, 50]],
    ])
  })

  it('reads numbers written close together', () => {
    expect(ends('M1.5-2.5.5.5')).toEqual([[[1.5, -2.5], [0.5, 0.5]]])
  })

  it('turns a half-circle arc into curves that pass through its top', () => {
    const [outline] = parsePathData('M0 0 A5 5 0 0 1 10 0')
    const end = outline.curves[outline.curves.length - 1][2]
    expect(end.x).toBeCloseTo(10)
    expect(end.y).toBeCloseTo(0)
    expect(outline.curves).toHaveLength(2)
    // Sweeping clockwise from the left end on screen goes over the top (y up is negative).
    expect(outline.curves[0][2].x).toBeCloseTo(5)
    expect(outline.curves[0][2].y).toBeCloseTo(-5)
  })

  it('mirrors the handle for smooth curves (S and T)', () => {
    const [outline] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0')
    expect(outline.curves[1][0].x).toBeCloseTo(10)
    expect(outline.curves[1][0].y).toBeCloseTo(-10)
  })
})

describe('fitting the view box', () => {
  const at = (m: { a: number; b: number; c: number; d: number; e: number; f: number }, x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
  it('scales evenly and centers by default, as browsers do', async () => {
    const { viewBoxMatrix } = await import('./svgImport.ts')
    const m = viewBoxMatrix([0, 0, 100, 100], 200, 100, null)
    expect(at(m, 0, 0)).toEqual([50, 0])
    expect(at(m, 100, 100)).toEqual([150, 100])
  })
  it('stretches with none, lines up with Min and Max, and fills with slice', async () => {
    const { viewBoxMatrix } = await import('./svgImport.ts')
    expect(at(viewBoxMatrix([0, 0, 100, 100], 200, 100, 'none'), 100, 100)).toEqual([200, 100])
    expect(at(viewBoxMatrix([0, 0, 100, 100], 200, 100, 'xMaxYMid meet'), 0, 0)).toEqual([100, 0])
    expect(at(viewBoxMatrix([10, 10, 100, 100], 200, 100, 'xMinYMin slice'), 10, 10)).toEqual([0, 0])
    expect(at(viewBoxMatrix([10, 10, 100, 100], 200, 100, 'xMinYMin slice'), 110, 110)).toEqual([200, 200])
  })
})
