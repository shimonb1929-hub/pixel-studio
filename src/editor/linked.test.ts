import { describe, expect, it } from 'vitest'
import { canLink, linkCopies, syncLinked, unlink } from './linked.ts'
import { makeCopies, startingRepeat } from './repeat.ts'
import type { EditorDocument, Layer, ShapeLayer } from './types.ts'

const base = { visible: true, opacity: 1, locked: false, adjust: null }
const shape = (id: string, cx = 50): ShapeLayer => ({
  ...base,
  id,
  kind: 'shape',
  name: id,
  box: { cx, cy: 50, width: 20, height: 10, rotation: 0 },
  geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
  fill: { kind: 'color', color: '#ff0000' },
  outline: null,
})
const design = (layers: Layer[]): EditorDocument => ({ id: 'd', name: 'd', width: 400, height: 400, background: '#ffffff', layers, activeLayerId: '', selection: null })
const recolor = (doc: EditorDocument, id: string, color: string): EditorDocument => ({
  ...doc,
  layers: doc.layers.map((l) => (l.id === id && l.kind === 'shape' ? { ...l, fill: { kind: 'color', color } } : l)),
})
const fillOf = (doc: EditorDocument, id: string) => {
  const l = doc.layers.find((x) => x.id === id) as ShapeLayer
  return l.fill.kind === 'color' ? l.fill.color : l.fill.kind
}

describe('linked copies', () => {
  const linked = linkCopies(design([shape('a'), shape('b', 100), shape('c', 150)]), new Map([['a', ['b']]]))

  it('changes how every linked copy looks when one changes, and only those', () => {
    const changed = recolor(linked, 'b', '#0000ff')
    const synced = syncLinked(linked, changed)
    expect(fillOf(synced, 'a')).toBe('#0000ff')
    expect(fillOf(synced, 'c')).toBe('#ff0000')
  })

  it('lets each copy keep its own place, size and turn', () => {
    const moved = { ...linked, layers: linked.layers.map((l) => (l.id === 'b' && l.kind === 'shape' ? { ...l, box: { cx: 300, cy: 300, width: 80, height: 40, rotation: 1 } } : l)) }
    const synced = syncLinked(linked, moved)
    expect(synced).toBe(moved)
    const a = synced.layers.find((l) => l.id === 'a') as ShapeLayer
    expect(a.box).toEqual({ cx: 50, cy: 50, width: 20, height: 10, rotation: 0 })
  })

  it('stops following once a copy changes on its own', () => {
    const apart = unlink(linked, ['b'])
    // A link with only one thing left is no link at all.
    expect(apart.layers.every((l) => !l.linked)).toBe(true)
    expect(fillOf(syncLinked(apart, recolor(apart, 'b', '#00ff00')), 'a')).toBe('#ff0000')
  })

  it('links copies from Make copies when asked, keeping mirror images flipped', () => {
    const doc = design([shape('a')])
    const made = makeCopies(doc, ['a'], { ...startingRepeat({ width: 20, height: 10 }, 'mirror'), linked: true }, 'Copies')
    const [first, mirror] = made.layers as ShapeLayer[]
    expect(first.linked).toBeTruthy()
    expect(mirror.linked).toBe(first.linked)
    const synced = syncLinked(made, recolor(made, first.id, '#123456'))
    const after = synced.layers[1] as ShapeLayer
    expect(fillOf(synced, mirror.id)).toBe('#123456')
    expect(after.box.width).toBe(-20)
    // Without it, copies are ordinary.
    expect(makeCopies(doc, ['a'], startingRepeat({ width: 20, height: 10 }), 'Copies').layers.some((l) => l.linked)).toBe(false)
  })

  it('links shapes and plain words, not pictures', () => {
    expect(canLink(shape('a'))).toBe(true)
  })
})
