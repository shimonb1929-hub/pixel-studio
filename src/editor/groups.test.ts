import { describe, expect, it } from 'vitest'
import { boxInFrame } from './arrange.ts'
import { insertLayerAboveActive, keepTogether, layersToJoin, moveLayersBy, moveLayersNextTo, moveLayersTo, pickedWith, removeLayers, takeApart, tidyGroups } from './layers.ts'
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

describe('dragging layers in the list', () => {
  it('puts a dragged layer right above or below the one it is dropped on', () => {
    const d = doc([layer('a'), layer('b'), layer('c'), layer('d')])
    expect(order(moveLayersNextTo(d, ['a'], ['c'], 'above'))).toEqual(['b', 'c', 'a', 'd'])
    expect(order(moveLayersNextTo(d, ['d'], ['b'], 'below'))).toEqual(['a', 'd', 'b', 'c'])
    expect(order(moveLayersNextTo(d, ['d'], ['a'], 'below'))).toEqual(['d', 'a', 'b', 'c'])
    expect(moveLayersNextTo(d, ['b'], ['a'], 'above')).toBe(d)
    expect(moveLayersNextTo(d, ['b'], ['b'], 'above')).toBe(d)
  })

  it('gathers several dragged layers together, in their order', () => {
    const d = doc([layer('a'), layer('b'), layer('c'), layer('d'), layer('e')])
    expect(order(moveLayersNextTo(d, ['a', 'c'], ['e'], 'above'))).toEqual(['b', 'd', 'e', 'a', 'c'])
    expect(order(moveLayersNextTo(d, ['b', 'e'], ['a'], 'below'))).toEqual(['b', 'e', 'a', 'c', 'd'])
  })

  it('moves a whole group as one, and never drops a layer into the middle of a group', () => {
    const d = doc([layer('x'), layer('a', 'g'), layer('b', 'g'), layer('y')])
    expect(order(moveLayersNextTo(d, ['a', 'b'], ['y'], 'above'))).toEqual(['x', 'y', 'a:g', 'b:g'])
    expect(order(moveLayersNextTo(d, ['y'], ['a'], 'above'))).toEqual(['x', 'a:g', 'b:g', 'y'])
    expect(order(moveLayersNextTo(d, ['y'], ['b'], 'below'))).toEqual(['x', 'y', 'a:g', 'b:g'])
  })

  it('a part of a group moves inside its group', () => {
    const d = doc([layer('a', 'g'), layer('b', 'g'), layer('c', 'g'), layer('y')])
    expect(order(moveLayersNextTo(d, ['a'], ['c'], 'above'))).toEqual(['b:g', 'c:g', 'a:g', 'y'])
    expect(order(moveLayersNextTo(d, ['c'], ['a'], 'below'))).toEqual(['c:g', 'a:g', 'b:g', 'y'])
    expect(order(moveLayersNextTo(d, ['c'], ['a'], 'above'))).toEqual(['a:g', 'c:g', 'b:g', 'y'])
    expect(order(moveLayersNextTo(d, ['a'], ['y'], 'above'))).toEqual(['b:g', 'c:g', 'a:g', 'y'])
  })
})

describe('what Join into one layer joins', () => {
  it('one layer joins with the layer below it; several picked join together', () => {
    const d = doc([layer('a'), layer('b'), layer('c')])
    expect(layersToJoin(d, ['b'])).toEqual(['a', 'b'])
    expect(layersToJoin(d, ['c', 'b'])).toEqual(['b', 'c'])
  })

  it('only joins layers with nothing showing between them, and never one that mixes with what is below', () => {
    const d = doc([layer('a'), layer('b'), layer('c')])
    expect(layersToJoin(d, ['c', 'a'])).toHaveProperty('reason')
    const hiddenBetween = doc([layer('a'), { ...layer('b'), visible: false }, layer('c')])
    expect(layersToJoin(hiddenBetween, ['c', 'a'])).toEqual(['a', 'c'])
    const mixing = doc([layer('a'), { ...layer('b'), blend: 'multiply' }])
    expect(layersToJoin(mixing, ['b'])).toHaveProperty('reason')
  })

  it('explains why when there is nothing to join', () => {
    const d = doc([layer('a'), { ...layer('b'), visible: false }, { ...layer('c'), everyPage: 'e1' }, layer('d')])
    expect(layersToJoin(d, [])).toHaveProperty('reason')
    expect(layersToJoin(d, ['a'])).toHaveProperty('reason')
    expect(layersToJoin(d, ['b'])).toHaveProperty('reason')
    expect(layersToJoin(d, ['d'])).toHaveProperty('reason')
  })
})
