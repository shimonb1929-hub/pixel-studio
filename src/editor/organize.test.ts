import { describe, expect, it } from 'vitest'
import { duplicateLayers } from './layers.ts'
import { lineUp, spreadOut, thingCount, tidyUp } from './organize.ts'
import type { EditorDocument, Layer, LayerGroup } from './types.ts'

// A shape whose top-left corner is at x, y.
const shape = (id: string, x: number, y: number, width: number, height: number, group?: string): Layer =>
  ({
    id,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: x + width / 2, cy: y + height / 2, width, height, rotation: 0 },
    geometry: { type: 'rectangle', corners: 0, sides: 5, arrow: false },
    fill: { kind: 'color', color: '#000000' },
    outline: null,
    ...(group ? { group: { id: group, name: group } } : {}),
  }) as Layer

const doc = (layers: Layer[]): EditorDocument => ({ id: 'd', name: 'Test', width: 400, height: 300, background: null, layers, activeLayerId: '', selection: null })

// Where each layer's top-left corner is.
const corners = (d: EditorDocument) =>
  Object.fromEntries(d.layers.map((l) => [l.id, l.kind === 'shape' ? [l.box.cx - l.box.width / 2, l.box.cy - l.box.height / 2] : null]))

describe('lining things up', () => {
  it('lines several things up with each other', () => {
    const d = doc([shape('a', 10, 10, 20, 20), shape('b', 50, 40, 40, 10)])
    expect(corners(lineUp(d, ['a', 'b'], 'left'))).toEqual({ a: [10, 10], b: [10, 40] })
    expect(corners(lineUp(d, ['a', 'b'], 'right'))).toEqual({ a: [70, 10], b: [50, 40] })
    expect(corners(lineUp(d, ['a', 'b'], 'middle'))).toEqual({ a: [10, 20], b: [50, 25] })
    expect(corners(lineUp(d, ['a', 'b'], 'bottom'))).toEqual({ a: [10, 30], b: [50, 40] })
  })

  it('lines one thing up with the page', () => {
    const d = doc([shape('a', 10, 10, 20, 20)])
    expect(corners(lineUp(d, ['a'], 'right'))).toEqual({ a: [380, 10] })
    expect(corners(lineUp(d, ['a'], 'center'))).toEqual({ a: [190, 10] })
  })

  it('moves things kept together as one', () => {
    const d = doc([shape('a', 0, 0, 10, 10, 'g'), shape('b', 20, 0, 10, 10, 'g'), shape('c', 100, 50, 10, 10)])
    // The group's right edge is at 30; c lines up with it, and the group stays as it is.
    expect(corners(lineUp(d, ['a', 'b', 'c'], 'left'))).toEqual({ a: [0, 0], b: [20, 0], c: [0, 50] })
    expect(thingCount(d, ['a', 'b', 'c'])).toBe(2)
    // On its own, the group lines up with the page.
    expect(corners(lineUp(d, ['a', 'b'], 'right'))).toEqual({ a: [370, 0], b: [390, 0], c: [100, 50] })
  })

  it('changes nothing when they already line up', () => {
    const d = doc([shape('a', 10, 10, 20, 20), shape('b', 10, 40, 40, 10)])
    expect(lineUp(d, ['a', 'b'], 'left')).toBe(d)
  })
})

describe('even spacing', () => {
  it('spaces things evenly between the first and the last', () => {
    const d = doc([shape('a', 0, 0, 10, 10), shape('b', 15, 0, 30, 10), shape('c', 90, 0, 10, 10)])
    // 100 wide in all, 50 of it things, so two gaps of 25.
    expect(corners(spreadOut(d, ['a', 'b', 'c'], 'x'))).toEqual({ a: [0, 0], b: [35, 0], c: [90, 0] })
  })

  it('needs three things', () => {
    const d = doc([shape('a', 0, 0, 10, 10), shape('b', 15, 0, 30, 10)])
    expect(spreadOut(d, ['a', 'b'], 'x')).toBe(d)
  })

  it('tidies a rough row into a neat one', () => {
    const d = doc([shape('a', 0, 0, 10, 10), shape('b', 20, 6, 10, 10), shape('c', 100, 2, 10, 10)])
    // A row (they are spread out more across than down): even gaps of 40, middles lined up at 8.
    expect(corners(tidyUp(d, ['a', 'b', 'c']))).toEqual({ a: [0, 3], b: [50, 3], c: [100, 3] })
  })

  it('tidies a rough column into a neat one', () => {
    const d = doc([shape('a', 0, 0, 10, 10), shape('b', 4, 30, 10, 10), shape('c', 2, 100, 10, 10)])
    expect(corners(tidyUp(d, ['a', 'b', 'c']))).toEqual({ a: [2, 0], b: [2, 50], c: [2, 100] })
  })
})

describe('duplicating several things', () => {
  const copy = (l: Layer) => ({ ...l, id: `${l.id}2`, name: `${l.name} copy` })
  const regroup = (g: LayerGroup) => ({ id: `${g.id}2`, name: `${g.name} copy` })
  const order = (d: EditorDocument) => d.layers.map((l) => (l.group ? `${l.id}:${l.group.id}` : l.id))

  it('copies a group as a new group, right above it', () => {
    const d = doc([shape('a', 0, 0, 1, 1, 'g'), shape('b', 0, 0, 1, 1, 'g'), shape('c', 0, 0, 1, 1)])
    const copied = duplicateLayers(d, ['a', 'b'], copy, regroup)
    expect(order(copied)).toEqual(['a:g', 'b:g', 'a2:g2', 'b2:g2', 'c'])
    expect(copied.activeLayerId).toBe('b2')
  })

  it('copies several separate things above the highest of them', () => {
    const d = doc([shape('a', 0, 0, 1, 1), shape('b', 0, 0, 1, 1), shape('c', 0, 0, 1, 1, 'g'), shape('d', 0, 0, 1, 1, 'g')])
    // c alone is part of a group, so its copy goes on its own above the group.
    expect(order(duplicateLayers(d, ['a', 'c'], copy, regroup))).toEqual(['a', 'b', 'c:g', 'd:g', 'a2', 'c2'])
  })

  it('a copy made inside a group stays in it', () => {
    const d = doc([shape('a', 0, 0, 1, 1, 'g'), shape('b', 0, 0, 1, 1, 'g'), shape('c', 0, 0, 1, 1)])
    expect(order(duplicateLayers(d, ['a'], copy, regroup))).toEqual(['a:g', 'a2:g', 'b:g', 'c'])
  })
})
