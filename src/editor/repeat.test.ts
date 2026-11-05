import { describe, expect, it } from 'vitest'
import { circleRadius, makeCopies, repeatFrames, repeatTotal, startingRepeat, type RepeatSettings } from './repeat.ts'
import type { EditorDocument, ShapeLayer } from './types.ts'

const base = { visible: true, opacity: 1, locked: false, adjust: null }
const shape = (id: string, cx = 50, cy = 50): ShapeLayer => ({
  ...base,
  id,
  kind: 'shape',
  name: id,
  box: { cx, cy, width: 20, height: 10, rotation: 0 },
  geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
  fill: { kind: 'color', color: '#ff0000' },
  outline: null,
})
const design = (layers: EditorDocument['layers']): EditorDocument => ({ id: 'd', name: 'd', width: 400, height: 400, background: '#ffffff', layers, activeLayerId: '', selection: null })
const frame = { cx: 50, cy: 50, width: 20, height: 10, rotation: 0 }
const settings = (patch: Partial<RepeatSettings>): RepeatSettings => ({ ...startingRepeat(frame), gap: 5, ...patch })
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe('where copies go', () => {
  it('puts copies in a row with even gaps, to the left for Hebrew and Yiddish', () => {
    expect(repeatFrames(frame, settings({ kind: 'row', count: 3 })).map((f) => f.cx)).toEqual([75, 100])
    expect(repeatFrames(frame, settings({ kind: 'row', count: 3 }), true).map((f) => f.cx)).toEqual([25, 0])
    expect(repeatFrames(frame, settings({ kind: 'column', count: 3 })).map((f) => f.cy)).toEqual([65, 80])
  })

  it('fills a grid row by row', () => {
    const frames = repeatFrames(frame, settings({ kind: 'grid', across: 2, down: 2 }))
    expect(frames.map((f) => [f.cx, f.cy])).toEqual([
      [75, 50],
      [50, 65],
      [75, 65],
    ])
    expect(repeatTotal(settings({ kind: 'grid', across: 4, down: 3 }))).toBe(12)
  })

  it('goes around a circle, turning each copy to face the middle', () => {
    const frames = repeatFrames(frame, settings({ kind: 'circle', count: 4, radius: 100, turn: true }))
    // The middle is below the original; a quarter of the way round is to the right of it.
    close(frames[0].cx, 150)
    close(frames[0].cy, 150)
    close(frames[0].rotation, Math.PI / 2)
    close(frames[1].cx, 50)
    close(frames[1].cy, 250)
    close(frames[2].cx, -50)
    const still = repeatFrames(frame, settings({ kind: 'circle', count: 4, radius: 100, turn: false }))
    expect(still.every((f) => f.rotation === 0)).toBe(true)
  })

  it('mirrors one copy beside the original, flipped', () => {
    expect(repeatFrames(frame, settings({ kind: 'mirror' }))).toEqual([{ ...frame, cx: 75, width: -20 }])
  })

  it('starts with a circle wide enough for the copies', () => {
    expect(circleRadius(20, 4)).toBe(20)
    expect(circleRadius(20, 30)).toBeGreaterThan((30 * 20) / (2 * Math.PI))
  })
})

describe('making copies', () => {
  it('adds copies above the original, kept together with it and picked', () => {
    const doc = design([shape('below', 300, 300), shape('a'), shape('above', 300, 300)])
    const next = makeCopies(doc, ['a'], settings({ kind: 'row', count: 3 }), 'Copies')
    expect(next.layers.map((l) => l.name)).toEqual(['below', 'a', 'a', 'a', 'above'])
    const kept = next.layers.slice(1, 4)
    expect(new Set(kept.map((l) => l.group?.id)).size).toBe(1)
    expect(kept[0].group?.name).toBe('Copies')
    expect(next.layers[0].group).toBeUndefined()
    expect(kept.map((l) => (l as ShapeLayer).box.cx)).toEqual([50, 75, 100])
    expect(next.activeLayerId).toBe(kept[2].id)
    // Every copy is its own thing.
    expect(new Set(next.layers.map((l) => l.id)).size).toBe(5)
  })

  it('copies several things as one, keeping their places to each other', () => {
    const doc = design([shape('a', 50, 50), shape('b', 80, 50)])
    const next = makeCopies(doc, ['a', 'b'], settings({ kind: 'column', count: 2 }), 'Copies')
    expect(next.layers.map((l) => [l.name, (l as ShapeLayer).box.cx, (l as ShapeLayer).box.cy])).toEqual([
      ['a', 50, 50],
      ['b', 80, 50],
      ['a', 50, 65],
      ['b', 80, 65],
    ])
  })

  it('leaves the design alone when nothing is chosen', () => {
    const doc = design([shape('a')])
    expect(makeCopies(doc, [], settings({}), 'Copies')).toBe(doc)
  })
})
