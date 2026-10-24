import { describe, expect, it, vi } from 'vitest'
import type { EditorDocument, ShapeLayer, TextLayer, TextStyle } from './types.ts'

// Measuring letters needs a browser; here a text's box just stays as it is.
vi.mock('../text/textLayer.ts', () => ({
  changeText: (layer: TextLayer, patch: { style?: Partial<TextStyle> }) => ({ ...layer, style: { ...layer.style, ...patch.style } }),
}))

const { applyTextStyle, colorUses, forgetColor, keepColor, matchesStyle, recolorEverywhere, removeTextStyle, saveTextStyle, styleUses, updateTextStyle } = await import('./designStyles.ts')
const { addPage, allPages, goToPage } = await import('./pages.ts')

const base = { visible: true, opacity: 1, locked: false, adjust: null }
const shape = (id: string, color: string, outline: string | null = null): ShapeLayer => ({
  ...base,
  id,
  kind: 'shape',
  name: id,
  box: { cx: 50, cy: 50, width: 20, height: 20, rotation: 0 },
  geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
  fill: { kind: 'color', color },
  outline: outline ? { color: outline, width: 2 } : null,
})
const style: TextStyle = { font: 'heebo', size: 40, weight: 700, italic: false, color: '#112233', align: 'center', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }
const text = (id: string, look: Partial<TextStyle> = {}): TextLayer => ({
  ...base,
  id,
  kind: 'text',
  name: id,
  box: { cx: 50, cy: 50, width: 100, height: 48, rotation: 0 },
  text: id,
  style: { ...style, ...look },
  wrap: true,
})
const design = (layers: EditorDocument['layers']): EditorDocument => ({ id: 'd', name: 'd', width: 200, height: 200, background: '#ffffff', layers, activeLayerId: '', selection: null })

describe("the design's colors", () => {
  it('keeps each color once, and forgets it without changing the design', () => {
    let doc = keepColor(design([shape('a', '#ff0000')]), '#FF0000')
    doc = keepColor(doc, '#ff0000')
    expect(doc.colors).toEqual(['#ff0000'])
    doc = forgetColor(doc, '#ff0000')
    expect(doc.colors).toBeUndefined()
    expect((doc.layers[0] as ShapeLayer).fill).toEqual({ kind: 'color', color: '#ff0000' })
  })

  it('changes a color everywhere: shapes, outlines, letters, words, gradients, effects, the page and every page', () => {
    const words: TextLayer = { ...text('t', { color: '#ff0000' }), spans: [{ start: 0, end: 1, style: { color: '#FF0000' } }] }
    const fading: ShapeLayer = { ...shape('g', '#000000'), fill: { kind: 'gradient', gradient: { type: 'linear', angle: 0, stops: [{ at: 0, color: '#ff0000', opacity: 1 }, { at: 1, color: '#00ff00', opacity: 1 }] } } }
    const glowing: ShapeLayer = { ...shape('e', '#0000ff'), effects: { shadow: { color: '#ff0000', opacity: 1, blur: 1, distance: 1, angle: 0 }, glow: null, outline: null } }
    let doc: EditorDocument = { ...design([shape('a', '#ff0000', '#ff0000'), words, fading, glowing]), background: '#ff0000', colors: ['#ff0000', '#00ff00'] }
    doc = addPage(doc, true)
    expect(colorUses(doc, '#ff0000')).toBe(14)
    const next = recolorEverywhere(doc, '#ff0000', '#00AA00')
    expect(colorUses(next, '#ff0000')).toBe(0)
    expect(colorUses(next, '#00aa00')).toBe(14)
    expect(next.colors).toEqual(['#00aa00', '#00ff00'])
    for (const page of allPages(next)) {
      expect(page.background).toBe('#00aa00')
      expect((page.layers[3] as ShapeLayer).fill).toEqual({ kind: 'color', color: '#0000ff' })
    }
    // Other colors stay as they were.
    expect(colorUses(next, '#00ff00')).toBe(2)
    expect(next.pageIndex).toBe(1)
  })

  it('two colors changed into one are one saved color', () => {
    const doc = { ...design([]), colors: ['#111111', '#222222'] }
    expect(recolorEverywhere(doc, '#111111', '#222222').colors).toEqual(['#222222'])
  })
})

describe("the design's text styles", () => {
  it('saves a look, gives it to other texts and changes them all together, on every page', () => {
    let doc = design([text('a', { size: 80, color: '#aa0000' }), text('b'), text('c')])
    doc = saveTextStyle(doc, 'Title', (doc.layers[0] as TextLayer).style, ['a'], 'title')
    expect(doc.textStyles?.map((s) => s.name)).toEqual(['Title'])
    doc = applyTextStyle(doc, 'title', ['b'])
    const b = doc.layers[1] as TextLayer
    expect(b.styleId).toBe('title')
    expect(b.style.size).toBe(80)
    expect(b.style.color).toBe('#aa0000')
    doc = addPage(doc, true)
    expect(styleUses(doc, 'title')).toBe(4)
    doc = updateTextStyle(doc, 'title', { ...style, size: 120, direction: 'rtl' })
    for (const page of allPages(doc)) {
      expect((page.layers[0] as TextLayer).style.size).toBe(120)
      expect((page.layers[1] as TextLayer).style.size).toBe(120)
      // Not using the style: it stays.
      expect((page.layers[2] as TextLayer).style.size).toBe(40)
    }
    // Which way it reads is never part of a style.
    expect(doc.textStyles?.[0].style.direction).toBe('auto')
    expect(matchesStyle((doc.layers[0] as TextLayer).style, doc.textStyles![0].style)).toBe(true)
  })

  it('removing a style keeps how texts look', () => {
    let doc = saveTextStyle(design([text('a', { size: 90 })]), 'Big', { ...style, size: 90 }, ['a'], 'big')
    doc = goToPage(addPage(doc, true), 0)
    doc = removeTextStyle(doc, 'big')
    expect(doc.textStyles).toBeUndefined()
    for (const page of allPages(doc)) {
      expect((page.layers[0] as TextLayer).styleId).toBeUndefined()
      expect((page.layers[0] as TextLayer).style.size).toBe(90)
    }
  })
})
