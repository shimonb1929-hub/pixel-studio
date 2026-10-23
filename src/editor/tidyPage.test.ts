import { describe, expect, it } from 'vitest'
import { tidyPage, tidyShifts, tidyTolerance, type TidyThing } from './tidyPage.ts'
import type { EditorDocument, Layer } from './types.ts'

const thing = (x: number, y: number, width: number, height: number, fixed = false): TidyThing => ({ rect: { x, y, width, height }, fixed })
const PAGE = { width: 1000, height: 800 }

describe('tidying the whole page', () => {
  it('knows how near is almost', () => {
    expect(tidyTolerance(1080, 1080)).toBeCloseTo(5.4)
    expect(tidyTolerance(200, 100)).toBe(2)
  })

  it('lines up left edges that are a few pixels apart, with the biggest thing staying put', () => {
    const shifts = tidyShifts([thing(100, 100, 300, 50), thing(103, 200, 100, 40), thing(98, 300, 120, 40)], PAGE)
    expect(shifts.map((s) => s.dx)).toEqual([0, -3, 2])
    expect(shifts.every((s) => s.dy === 0)).toBe(true)
  })

  it('snaps a nearly centered thing to the middle of the page', () => {
    const [s] = tidyShifts([thing(447, 100, 100, 40)], PAGE)
    expect(s.dx).toBe(3)
  })

  it('never moves anything far, and leaves things that already line up', () => {
    // 20 pixels off is a choice, not a slip.
    expect(tidyShifts([thing(100, 100, 50, 50), thing(120, 300, 50, 50)], PAGE).every((s) => s.dx === 0 && s.dy === 0)).toBe(true)
    // b lines up exactly with c already, so they stay, and a (close to them) comes to them.
    const shifts = tidyShifts([thing(102, 100, 400, 50), thing(100, 300, 50, 50), thing(100, 500, 50, 50)], PAGE)
    expect(shifts.map((s) => s.dx)).toEqual([-2, 0, 0])
  })

  it('never moves fixed things', () => {
    const shifts = tidyShifts([thing(103, 100, 50, 50, true), thing(100, 300, 50, 50)], PAGE)
    expect(shifts).toEqual([
      { dx: 0, dy: 0 },
      { dx: 3, dy: 0 },
    ])
  })

  it('evens out gaps that are almost the same', () => {
    // A row lined up by their tops, with gaps of 50, 52 and 48.
    const shifts = tidyShifts([thing(100, 211, 100, 60), thing(250, 211, 100, 60), thing(402, 211, 100, 60), thing(550, 211, 100, 60)], PAGE)
    expect(shifts.map((s) => s.dx)).toEqual([0, 0, -2, 0])
  })
})

const shape = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer =>
  ({
    id,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: x + w / 2, cy: y + h / 2, width: w, height: h, rotation: 0 },
    geometry: { type: 'rectangle', corners: 0, sides: 5, arrow: false },
    fill: { kind: 'color', color: '#000000' },
    outline: null,
    ...extra,
  }) as Layer

const doc = (layers: Layer[]): EditorDocument => ({ id: 'd', name: 'Test', width: 1000, height: 800, background: '#ffffff', layers, activeLayerId: '', selection: null })
const left = (d: EditorDocument, id: string) => {
  const l = d.layers.find((x) => x.id === id)!
  return l.kind === 'shape' ? l.box.cx - l.box.width / 2 : NaN
}

describe('tidyPage', () => {
  it('moves things on the design, skipping hidden and locked ones and the background', () => {
    const d = doc([
      shape('bg', 0, 0, 1000, 800),
      shape('a', 100, 100, 300, 50),
      shape('b', 103, 200, 100, 40),
      shape('hidden', 98, 400, 100, 40, { visible: false }),
      shape('locked', 97, 500, 100, 40, { locked: true }),
    ])
    const { doc: next, moved } = tidyPage(d)
    expect(left(next, 'b')).toBe(100)
    expect(left(next, 'hidden')).toBe(98)
    expect(left(next, 'locked')).toBe(97)
    expect(left(next, 'bg')).toBe(0)
    expect(moved).toBe(1)
  })

  it('returns the same design when everything is tidy', () => {
    const d = doc([shape('a', 100, 100, 50, 50), shape('b', 100, 300, 50, 50)])
    expect(tidyPage(d)).toEqual({ doc: d, moved: 0 })
  })
})
