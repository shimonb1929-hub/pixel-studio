import { describe, expect, it } from 'vitest'
import { resizeDocument } from './documentOps.ts'
import { addPage, allPages, changeEveryPage, goToPage, movePage, pageCount, pageDocuments, pageIndex, pageOfLayer, removePage } from './pages.ts'
import type { EditorDocument, ShapeLayer } from './types.ts'

const shape = (id: string): ShapeLayer => ({
  id,
  kind: 'shape',
  name: id,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx: 100, cy: 50, width: 40, height: 20, rotation: 0 },
  geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
  fill: { kind: 'color', color: '#ff0000' },
  outline: null,
})

const design = (): EditorDocument => ({
  id: 'd',
  name: 'Menu',
  width: 400,
  height: 300,
  background: '#ffffff',
  layers: [shape('a')],
  activeLayerId: 'a',
  selection: null,
})

describe('pages', () => {
  it('a new design has one page and no page list', () => {
    expect(pageCount(design())).toBe(1)
    expect(design().pages).toBeUndefined()
  })

  it('adds an empty page after this one, with the same page color, and goes to it', () => {
    const two = addPage(design())
    expect(pageCount(two)).toBe(2)
    expect(pageIndex(two)).toBe(1)
    expect(two.layers).toEqual([])
    expect(two.background).toBe('#ffffff')
    expect(allPages(two)[0].layers.map((l) => l.id)).toEqual(['a'])
  })

  it('keeps each page’s things when going back and forth', () => {
    let doc = addPage(design())
    doc = { ...doc, layers: [shape('b')], activeLayerId: 'b' }
    doc = goToPage(doc, 0)
    expect(doc.layers.map((l) => l.id)).toEqual(['a'])
    doc = goToPage(doc, 1)
    expect(doc.layers.map((l) => l.id)).toEqual(['b'])
    expect(pageOfLayer(doc, 'a')).toBe(0)
  })

  it('copies a page with new layers that keep their names', () => {
    const doc = addPage(design(), true)
    expect(doc.layers).toHaveLength(1)
    expect(doc.layers[0].id).not.toBe('a')
    expect(doc.layers[0].name).toBe('a')
    expect(doc.activeLayerId).toBe(doc.layers[0].id)
  })

  it('moves and deletes pages, back to a plain design at one page', () => {
    let doc = addPage(design())
    doc = { ...doc, layers: [shape('b')] }
    doc = movePage(doc, -1)
    expect(pageIndex(doc)).toBe(0)
    expect(allPages(doc).map((p) => p.layers[0]?.id)).toEqual(['b', 'a'])
    expect(movePage(doc, -1)).toBe(doc)
    doc = removePage(doc)
    expect(pageCount(doc)).toBe(1)
    expect(doc.pages).toBeUndefined()
    expect(doc.layers.map((l) => l.id)).toEqual(['a'])
    expect(removePage(doc)).toBe(doc)
  })

  it('resizes every page together', () => {
    let doc = addPage(design())
    doc = { ...doc, layers: [shape('b')] }
    doc = changeEveryPage(doc, (page) => resizeDocument(page, 800, 600))
    expect([doc.width, doc.height]).toEqual([800, 600])
    const [first, second] = pageDocuments(doc)
    expect(first.layers[0].kind === 'shape' && first.layers[0].box.cx).toBe(200)
    expect(second.layers[0].kind === 'shape' && second.layers[0].box.cx).toBe(200)
    expect(pageIndex(doc)).toBe(1)
  })
})
