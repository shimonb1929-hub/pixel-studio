import { describe, expect, it, vi } from 'vitest'
import type { TextLayer } from '../editor/types.ts'

// Measuring letters needs a browser; here a text's box just stays as it is.
vi.mock('../text/textLayer.ts', () => ({
  fitText: (layer: TextLayer) => layer,
  textName: (text: string) => text.slice(0, 28),
  changeText: (layer: TextLayer) => layer,
}))

const { LAYOUT_COLORS, LAYOUT_KINDS, LAYOUTS, buildLayout } = await import('./layouts.ts')
const { setLanguage } = await import('../i18n/i18n.ts')

describe('ready layouts', () => {
  it('has a few of every kind', () => {
    for (const kind of LAYOUT_KINDS) expect(LAYOUTS.filter((l) => l.kind === kind.value).length).toBeGreaterThanOrEqual(3)
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length)
  })

  // The rule for the whole site: no pictures, never pictures of people. A layout is only shapes,
  // words and colors, so every part of it can be changed.
  for (const layout of LAYOUTS) {
    it(`${layout.id} is only shapes and words, in every color set, and fully editable`, () => {
      for (const colors of LAYOUT_COLORS) {
        const doc = buildLayout(layout, colors.id)
        expect(doc.width).toBe(layout.width)
        expect(doc.height).toBe(layout.height)
        expect(doc.layers.length).toBeGreaterThan(3)
        const palette = new Set([colors.page, colors.paper, colors.main, colors.accent, colors.ink, colors.soft, colors.onMain])
        expect(doc.background).toBe(colors.page)
        expect(doc.colors?.every((c) => palette.has(c))).toBe(true)
        for (const layer of doc.layers) {
          expect(['shape', 'text']).toContain(layer.kind)
          expect(layer.locked).toBe(false)
          expect(layer.visible).toBe(true)
          if (layer.kind === 'shape') {
            expect(layer.fill.kind === 'none' || layer.fill.kind === 'color').toBe(true)
            if (layer.fill.kind === 'color') expect(palette.has(layer.fill.color)).toBe(true)
            if (layer.outline) expect(palette.has(layer.outline.color)).toBe(true)
          }
          if (layer.kind === 'text') {
            expect(layer.text.trim()).not.toBe('')
            // Each text uses one of the design's text styles, so changing the style changes it.
            const style = doc.textStyles?.find((s) => s.id === layer.styleId)
            expect(style).toBeDefined()
            expect(layer.style.font).toBe(style!.style.font)
            expect(layer.style.size).toBe(style!.style.size)
            expect(palette.has(layer.style.color)).toBe(true)
            // Words sit on the page.
            expect(layer.box.cx).toBeGreaterThan(0)
            expect(layer.box.cx).toBeLessThan(doc.width)
            expect(layer.box.cy).toBeGreaterThan(0)
            expect(layer.box.cy).toBeLessThan(doc.height)
          }
        }
      }
    })
  }

  it('speaks the language of the app, and lines up from the right in Hebrew', async () => {
    const layout = LAYOUTS.find((l) => l.id === 'flyer-lines')!
    const english = buildLayout(layout)
    await setLanguage('he')
    const hebrew = buildLayout(layout)
    await setLanguage('en')
    const words = (doc: typeof english) => doc.layers.filter((l): l is TextLayer => l.kind === 'text').map((l) => l.text)
    expect(words(english)).toContain('Join us')
    expect(words(hebrew).some((w) => /[֐-׿]/.test(w))).toBe(true)
    // The bar along the side moves to the right side for Hebrew.
    const bar = (doc: typeof english) => doc.layers[0].kind === 'shape' && doc.layers[0].box.cx
    expect(bar(english)).toBeLessThan(layout.width / 2)
    expect(bar(hebrew)).toBeGreaterThan(layout.width / 2)
  })
})
