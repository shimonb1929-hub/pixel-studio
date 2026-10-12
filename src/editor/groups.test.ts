import { describe, expect, it } from 'vitest'
import { boxInFrame } from './arrange.ts'
import { insertLayerAboveActive, keepTogether, moveLayersBy, moveLayersTo, pickedWith, removeLayers, takeApart, tidyGroups } from './layers.ts'
import type { EditorDocument, Layer } from './types.ts'

const layer = (id: string, group?: string): Layer => ({
  id,
  kind: 'raster',
  name: id,
  canvas: {} as HTMLCanvasElement,
  x: 0,
  y: 0,
  box: null,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  ...(group ? { group: { id: group, name: group } } : {}),
})

const doc = (layers: Layer[], active = ''): EditorDocument => ({ id: 'd', name: 'Test', width: 100, height: 100, background: null, layers, activeLayerId: active, selection: null })
const order = (d: EditorDocument) => d.layers.map((l) => (l.group ? `${l.id}:${l.group.id}` : l.id))

describe('keeping things together', () => {
  it('puts the chosen layers next to each other where the highest one was, in the same order', () => {
    const kept = keepTogether(doc([layer('a'), layer('b'), layer('c'), layer('d')]), ['a', 'c'], { id: 'g', name: 'Logo' })
    expect(order(kept)).toEqual(['b', 'a:g', 'c:g', 'd'])
    expect(kept.activeLayerId).toBe('c')
  })

  it('picking one picks the whole group', () => {
    const d = doc([layer('a', 'g'), layer('b', 'g'), layer('c')])
    expect(pickedWith(d, 'b')).toEqual(['a', 'b'])
    expect(pickedWith(d, 'c')).toEqual(['c'])
  })

  it('takes a group apart, and lets go of groups left with one layer or split up', () => {
    expect(order(takeApart(doc([layer('a', 'g'), layer('b', 'g')]), 'g'))).toEqual(['a', 'b'])
    expect(order(removeLayers(doc([layer('a', 'g'), layer('b', 'g'), layer('c')]), ['a']))).toEqual(['b', 'c'])
    expect(order(tidyGroups(doc([layer('a', 'g'), layer('b'), layer('c', 'g')])))).toEqual(['a', 'b', 'c'])
  })

  it('adds new layers above the whole group', () => {
    const d = insertLayerAboveActive(doc([layer('a', 'g'), layer('b', 'g'), layer('c')], 'a'), layer('n'))
    expect(order(d)).toEqual(['a:g', 'b:g', 'n', 'c'])
  })
})

describe('moving several layers', () => {
  it('moves a whole group past a whole group, keeping its order', () => {
    const d = doc([layer('a', 'g'), layer('b', 'g'), layer('c', 'h'), layer('d', 'h'), layer('e')])
    expect(order(moveLayersBy(d, ['a', 'b'], 1))).toEqual(['c:h', 'd:h', 'a:g', 'b:g', 'e'])
    expect(order(moveLayersTo(d, ['a', 'b'], 'front'))).toEqual(['c:h', 'd:h', 'e', 'a:g', 'b:g'])
  })

  it('moves several picked layers together', () => {
    const d = doc([layer('a'), layer('b'), layer('c'), layer('d')])
    expect(order(moveLayersBy(d, ['a', 'c'], 1))).toEqual(['b', 'a', 'd', 'c'])
    expect(order(moveLayersTo(d, ['b', 'd'], 'back'))).toEqual(['b', 'd', 'a', 'c'])
  })

  it('one layer of a group moves only inside its group', () => {
    const d = doc([layer('x'), layer('a', 'g'), layer('b', 'g'), layer('y')])
    expect(order(moveLayersBy(d, ['a'], 1))).toEqual(['x', 'b:g', 'a:g', 'y'])
    expect(moveLayersBy(d, ['b'], 1)).toBe(d)
    expect(order(moveLayersTo(d, ['b'], 'back'))).toEqual(['x', 'b:g', 'a:g', 'y'])
  })
})

describe('boxInFrame', () => {
  const frame = { cx: 50, cy: 50, width: 100, height: 100, rotation: 0 }
  const box = { cx: 25, cy: 25, width: 20, height: 10, rotation: 0 }

  it('moves with the frame', () => {
    expect(boxInFrame(box, frame, { ...frame, cx: 60, cy: 40 })).toEqual({ ...box, cx: 35, cy: 15 })
  })

  it('grows evenly from the frame', () => {
    const grown = boxInFrame(box, frame, { cx: 100, cy: 100, width: 200, height: 200, rotation: 0 })
    expect(grown).toEqual({ cx: 50, cy: 50, width: 40, height: 20, rotation: 0 })
  })

  it('turns around the middle of the frame', () => {
    const turned = boxInFrame(box, frame, { ...frame, rotation: Math.PI / 2 })
    expect(turned.cx).toBeCloseTo(75)
    expect(turned.cy).toBeCloseTo(25)
    expect(turned.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('flips with the frame', () => {
    const flipped = boxInFrame({ ...box, rotation: 0.3 }, frame, { ...frame, width: -100 })
    expect(flipped.cx).toBeCloseTo(75)
    expect(flipped.width).toBe(-20)
    expect(flipped.rotation).toBeCloseTo(-0.3)
  })
})
