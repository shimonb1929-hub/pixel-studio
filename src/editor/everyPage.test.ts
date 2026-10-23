import { describe, expect, it } from 'vitest'
import { duplicateLayer } from './document.ts'
import { setOnEveryPage, syncEveryPage } from './everyPage.ts'
import { addPage, allPages, goToPage } from './pages.ts'
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

// Three pages, the first one open, each with a thing of its own.
function booklet(): EditorDocument {
  let doc: EditorDocument = { id: 'd', name: 'Menu', width: 400, height: 300, background: '#ffffff', layers: [shape('logo'), shape('own1')], activeLayerId: 'logo', selection: null }
  doc = addPage(doc)
  doc = { ...doc, layers: [shape('own2')], activeLayerId: 'own2' }
  doc = addPage(doc)
  doc = { ...doc, layers: [shape('own3')], activeLayerId: 'own3' }
  return goToPage(doc, 0)
}

const names = (doc: EditorDocument) => allPages(doc).map((page) => page.layers.map((l) => l.name))

describe('things on every page', () => {
  it('a thing put on every page is copied on top of every other page', () => {
    const doc = syncEveryPage(setOnEveryPage(booklet(), ['logo'], true))
    expect(names(doc)).toEqual([['logo', 'own1'], ['own2', 'logo'], ['own3', 'logo']])
    const ids = allPages(doc).flatMap((page) => page.layers.filter((l) => l.everyPage).map((l) => l.id))
    expect(new Set(ids).size).toBe(3)
  })

  it('a change on any page shows on all of them, and nothing else changes', () => {
    let doc = syncEveryPage(setOnEveryPage(booklet(), ['logo'], true))
    doc = goToPage(doc, 2)
    const copy = doc.layers.find((l) => l.everyPage)!
    doc = { ...doc, layers: doc.layers.map((l) => (l === copy ? { ...l, box: { ...l.box!, cx: 300 } } : l)) }
    const synced = syncEveryPage(doc)
    for (const page of allPages(synced)) expect(page.layers.find((l) => l.everyPage)!.box!.cx).toBe(300)
    expect(syncEveryPage(synced)).toBe(synced)
    expect(allPages(synced)[1].layers.find((l) => l.name === 'own2')).toBe(allPages(doc)[1].layers.find((l) => l.name === 'own2'))
  })

  it('taking it off or keeping it on one page takes it off the others', () => {
    const on = syncEveryPage(setOnEveryPage(booklet(), ['logo'], true))
    const deleted = syncEveryPage({ ...on, layers: on.layers.filter((l) => !l.everyPage) })
    expect(names(deleted)).toEqual([['own1'], ['own2'], ['own3']])
    const here = syncEveryPage(setOnEveryPage(on, ['logo'], false))
    expect(names(here)).toEqual([['logo', 'own1'], ['own2'], ['own3']])
  })

  it('a new page has it too, and a copy of it is on one page only', () => {
    const on = syncEveryPage(setOnEveryPage(booklet(), ['logo'], true))
    expect(names(addPage(on))[1]).toEqual(['logo'])
    expect(duplicateLayer(on.layers[0]).everyPage).toBeUndefined()
  })
})
