import { describe, expect, it } from 'vitest'
import { resizeDocument } from './documentOps.ts'
import { syncEveryPage } from './everyPage.ts'
import { layersForSize, makeOtherSizes } from './otherSizes.ts'
import { allPages, changeEveryPage, goToPage, pageCount, pageDocuments, pageIndex, pagesSameSize } from './pages.ts'
import type { EditorDocument, Layer, ShapeLayer, TextLayer } from './types.ts'

const shape = (id: string, cx: number, cy: number, width: number, height: number, extra: Partial<ShapeLayer> = {}): ShapeLayer => ({
  id,
  kind: 'shape',
  name: id,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx, cy, width, height, rotation: 0 },
  geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
  fill: { kind: 'color', color: '#ff0000' },
  outline: { color: '#000000', width: 4 },
  ...extra,
})

const photo = (id: string, cx: number, cy: number, width: number, height: number): ShapeLayer =>
  shape(id, cx, cy, width, height, { fill: { kind: 'photo', canvas: {} as HTMLCanvasElement, zoom: 1, x: 0, y: 0 }, outline: null })

const text = (id: string, words: string, cx: number, cy: number, width: number, height: number): TextLayer => ({
  id,
  kind: 'text',
  name: id,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx, cy, width, height, rotation: 0 },
  text: words,
  style: { font: 'inter', size: 60, weight: 700, italic: false, color: '#111111', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 },
  wrap: false,
})

const square = (layers: Layer[]): EditorDocument => ({ id: 'd', name: 'Sale', width: 1000, height: 1000, background: '#ffffff', layers, activeLayerId: layers[0]?.id ?? '', selection: null })

const byName = (layers: Layer[], name: string) => layers.find((l) => l.name === name) as ShapeLayer | TextLayer
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 3)

describe('making a design at other sizes', () => {
  it('at the same shape, everything simply grows', () => {
    const layers = layersForSize(square([shape('logo', 100, 100, 100, 100), text('title', 'Sale', 500, 500, 400, 100)]), 2000, 2000)
    const logo = byName(layers, 'logo')
    expect(logo.box).toEqual({ cx: 200, cy: 200, width: 200, height: 200, rotation: 0 })
    expect((logo as ShapeLayer).outline!.width).toBe(8)
    expect((byName(layers, 'title') as TextLayer).style.size).toBe(120)
  })

  it('makes copies and leaves the open page as it was', () => {
    const doc = square([shape('logo', 100, 100, 100, 100)])
    const [copy] = layersForSize(doc, 800, 1000)
    expect(copy.id).not.toBe('logo')
    expect(copy.name).toBe('logo')
    expect(doc.layers[0].box).toEqual({ cx: 100, cy: 100, width: 100, height: 100, rotation: 0 })
  })

  it('a background covers the new page, and things keep their place near the edges', () => {
    const doc = square([shape('back', 500, 500, 1000, 1000), shape('logo', 100, 100, 100, 100), shape('corner', 900, 900, 100, 100), text('title', 'Sale', 500, 500, 600, 120)])
    // A taller page, but not much taller.
    const layers = layersForSize(doc, 1000, 1250)
    expect(byName(layers, 'back').box).toEqual({ cx: 500, cy: 625, width: 1000, height: 1250, rotation: 0 })
    // Near the top left: the same distance from those edges.
    expect(byName(layers, 'logo').box).toMatchObject({ cx: 100, cy: 100, width: 100, height: 100 })
    // Near the bottom right: the same distance from those edges.
    expect(byName(layers, 'corner').box).toMatchObject({ cx: 900, cy: 1150 })
    // In the middle: stays in the middle.
    expect(byName(layers, 'title').box).toMatchObject({ cx: 500, cy: 625, width: 600 })
  })

  it('a shape behind everything stretches to the new page; a photo inside it is never squashed', () => {
    const layers = layersForSize(square([photo('back', 500, 500, 1000, 1000)]), 2000, 1000)
    // A photo always covers its shape whatever the shape's size, so the shape can stretch.
    expect(byName(layers, 'back').box).toMatchObject({ cx: 1000, cy: 500, width: 2000, height: 1000 })
  })

  it('words covering the page grow evenly until they cover it', () => {
    const layers = layersForSize(square([text('big', 'Hi', 500, 500, 1000, 1000)]), 2000, 1000)
    expect(byName(layers, 'big').box).toMatchObject({ cx: 1000, cy: 500, width: 2000, height: 2000 })
  })

  it('on a much wider page, the photo goes on one side and the words on the other', () => {
    const doc = square([photo('picture', 500, 300, 800, 400), text('title', 'Big sale', 500, 650, 600, 100), text('date', 'Sunday', 500, 800, 300, 60)])
    const layers = layersForSize(doc, 2000, 800)
    const picture = byName(layers, 'picture').box
    const title = byName(layers, 'title').box
    const date = byName(layers, 'date').box
    expect(picture.cx).toBeLessThan(1000)
    expect(title.cx).toBeGreaterThan(1000)
    expect(date.cx).toBeGreaterThan(1000)
    // The words keep their order, top to bottom.
    expect(title.cy).toBeLessThan(date.cy)
    // Everything fits on the page.
    for (const l of layers) {
      expect(l.box!.cx - Math.abs(l.box!.width) / 2).toBeGreaterThanOrEqual(0)
      expect(l.box!.cx + Math.abs(l.box!.width) / 2).toBeLessThanOrEqual(2000)
      expect(l.box!.cy - Math.abs(l.box!.height) / 2).toBeGreaterThanOrEqual(0)
      expect(l.box!.cy + Math.abs(l.box!.height) / 2).toBeLessThanOrEqual(800)
    }
    // Words and photo shrink together.
    near(Math.abs(title.width) / Math.abs(picture.width), 600 / 800)
  })

  it('a Hebrew design starts on the right', () => {
    const doc = square([photo('picture', 500, 300, 800, 400), text('title', 'מבצע גדול', 500, 650, 600, 100), text('date', 'ביום ראשון', 500, 800, 300, 60)])
    const layers = layersForSize(doc, 2000, 800)
    expect(byName(layers, 'picture').box.cx).toBeGreaterThan(1000)
    expect(byName(layers, 'title').box.cx).toBeLessThan(1000)
  })

  it('on a much taller page, things side by side are stacked in order', () => {
    const wide: EditorDocument = { ...square([shape('left', 300, 250, 400, 300), text('right', 'Open now', 1200, 250, 600, 120)]), width: 1500, height: 500 }
    const layers = layersForSize(wide, 1080, 1920)
    const left = byName(layers, 'left').box
    const right = byName(layers, 'right').box
    expect(left.cy).toBeLessThan(right.cy)
    near(left.cx, 540)
    near(right.cx, 540)
    // They grow to use the room, but no more than the page grew.
    expect(Math.abs(right.width)).toBeGreaterThan(600)
  })

  it('one row of words on a much taller page grows to fill its width', () => {
    const banner: EditorDocument = { ...square([text('title', 'Welcome', 600, 300, 1000, 150)]), width: 1200, height: 600 }
    const title = byName(layersForSize(banner, 1000, 2000), 'title').box
    near(title.cx, 500)
    near(title.cy, 1000)
    expect(Math.abs(title.width)).toBeGreaterThan(700)
    expect(Math.abs(title.width)).toBeLessThanOrEqual(1000)
  })

  it('things kept together stay together', () => {
    const group = { id: 'g', name: 'Badge' }
    const doc = square([shape('ring', 800, 200, 200, 200, { group }), text('word', 'New', 800, 200, 120, 60)].map((l) => ({ ...l, group })) as Layer[])
    const layers = layersForSize(doc, 1000, 1250)
    const ring = byName(layers, 'ring').box
    const word = byName(layers, 'word').box
    expect(ring.cx).toBe(word.cx)
    expect(ring.cy).toBe(word.cy)
  })

  it('shadows grow along', () => {
    const doc = square([shape('card', 500, 500, 300, 300, { effects: { shadow: { color: '#000000', opacity: 0.5, blur: 10, distance: 20, angle: 90 }, glow: null, outline: null } })])
    const [card] = layersForSize(doc, 500, 500)
    expect(card.effects!.shadow).toMatchObject({ blur: 5, distance: 10 })
  })
})

describe('pages of different sizes', () => {
  const made = () => makeOtherSizes(square([shape('back', 500, 500, 1000, 1000), shape('logo', 100, 100, 100, 100)]), [{ width: 1080, height: 1920 }, { width: 1200, height: 630 }])

  it('each new size is a page of its own, right after this one', () => {
    const doc = made()
    expect(pageCount(doc)).toBe(3)
    expect(pageIndex(doc)).toBe(1)
    expect(allPages(doc).map((p) => [p.width, p.height])).toEqual([[1000, 1000], [1080, 1920], [1200, 630]])
    expect([doc.width, doc.height]).toEqual([1080, 1920])
    expect(pagesSameSize(doc)).toBe(false)
  })

  it('going to a page takes its size', () => {
    const doc = goToPage(made(), 2)
    expect([doc.width, doc.height]).toEqual([1200, 630])
    expect(pageDocuments(doc).map((p) => [p.width, p.height])).toEqual([[1000, 1000], [1080, 1920], [1200, 630]])
    const back = goToPage(doc, 0)
    expect([back.width, back.height]).toEqual([1000, 1000])
    expect(back.layers.map((l) => l.id)).toEqual(['back', 'logo'])
  })

  it('resizing changes only the pages the size of this one', () => {
    const doc = goToPage(made(), 0)
    const resized = changeEveryPage(doc, (page) => resizeDocument(page, 500, 500))
    expect(allPages(resized).map((p) => [p.width, p.height])).toEqual([[500, 500], [1080, 1920], [1200, 630]])
    expect(allPages(resized)[1]).toBe(doc.pages![1])
  })

  it('things on every page stay on the pages of their own size', () => {
    let doc = goToPage(made(), 0)
    doc = { ...doc, layers: [...doc.layers, { ...shape('mark', 900, 900, 50, 50), everyPage: 'every-1' }] }
    const synced = syncEveryPage(doc)
    expect(allPages(synced)[1].layers.some((l) => l.everyPage)).toBe(false)
    expect(allPages(synced)[2].layers.some((l) => l.everyPage)).toBe(false)
  })
})
