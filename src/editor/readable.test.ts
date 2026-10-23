import { describe, expect, it } from 'vitest'
import { hexToRgb } from './color.ts'
import { hexToLab, type PaletteColor } from './palette.ts'
import { applyReadableFix, contrastRatio, DARK_TEXT, LIGHT_TEXT, measureBackdrop, neededContrast, readability, readableFixes, readableOn, worstContrast } from './readable.ts'
import type { EditorDocument, TextLayer } from './types.ts'

function pixels(parts: [string, number][]): Uint8ClampedArray {
  const data: number[] = []
  for (const [hex, count] of parts) {
    const { r, g, b } = hexToRgb(hex)
    for (let i = 0; i < count; i++) data.push(r, g, b, 255)
  }
  return Uint8ClampedArray.from(data)
}

const STYLE: TextLayer['style'] = { font: 'inter', size: 40, weight: 400, italic: false, color: '#ffffff', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }

const text = (color: string, size = 40, extra: Partial<TextLayer> = {}): TextLayer => ({
  id: 't',
  kind: 'text',
  name: 'Words',
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx: 200, cy: 100, width: 160, height: 50, rotation: 0.1 },
  text: 'שלום Hello',
  style: { ...STYLE, size, color },
  wrap: false,
  ...extra,
})

const doc = (layers: EditorDocument['layers']): EditorDocument => ({ id: 'd', name: 'Test', width: 400, height: 300, background: '#ffffff', layers, activeLayerId: 't', selection: null })

describe('contrast', () => {
  it('measures like the accessibility rules', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
  })

  it('asks less of big words', () => {
    expect(neededContrast(text('#000000', 40))).toBe(4.5)
    expect(neededContrast(text('#000000', 100))).toBe(3)
    expect(neededContrast(text('#000000', 60, { style: { ...STYLE, size: 60, weight: 700 } }))).toBe(3)
  })

  it('makes a color readable by darkening or lightening it only as much as needed', () => {
    const c = readableOn('#ffffff', 4.5, '#ffaa00')
    expect(contrastRatio(c, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c, '#ffffff')).toBeLessThan(8)
    expect(readableOn('#101010')).toBe(LIGHT_TEXT)
    expect(readableOn('#f0f0f0')).toBe(DARK_TEXT)
  })
})

describe('words over a photo', () => {
  it('judges by the hardest spots behind the words, not the average', () => {
    // A dark photo with a bright cloud on a fifth of it: white words get lost in the cloud.
    const backdrop = measureBackdrop(
      pixels([
        ['#202830', 800],
        ['#f4f4f4', 200],
      ]),
    )!
    expect(contrastRatio(LIGHT_TEXT, backdrop.average)).toBeGreaterThan(3)
    expect(worstContrast(LIGHT_TEXT, backdrop)).toBeLessThan(1.2)
    expect(readability(text('#ffffff'), backdrop).ok).toBe(false)
    // A shadow that stands out counts as help.
    const shadowed = text('#ffffff', 40, { effects: { shadow: { color: '#000000', opacity: 0.8, blur: 8, distance: 1, angle: 90 }, glow: null, outline: null } })
    expect(readability(shadowed, backdrop).ok).toBe(true)
  })

  it('says plain dark words on white are fine', () => {
    expect(readability(text('#1b1d23'), measureBackdrop(pixels([['#ffffff', 100]]))!).ok).toBe(true)
  })

  it('offers a clearer color, a photo color, a shadow and a backing box', () => {
    const backdrop = measureBackdrop(
      pixels([
        ['#d8d0c0', 900],
        ['#c0b8a8', 100],
      ]),
    )!
    const navy = hexToLab('#1d3557')
    const palette: PaletteColor[] = [{ hex: '#1d3557', share: 0.3, lightness: navy.L, chroma: Math.hypot(navy.a, navy.b) }]
    const fixes = readableFixes(text('#ffffff'), backdrop, palette)
    expect(fixes.map((f) => f.kind)).toEqual(['color', 'color', 'shadow', 'backing'])
    expect(fixes[0]).toMatchObject({ kind: 'color', color: DARK_TEXT, tone: 'dark' })
    expect(fixes[1]).toMatchObject({ kind: 'color', color: '#1d3557', tone: 'photo' })
    // White words get a dark shadow and a box they read on.
    expect(fixes[2].kind === 'shadow' && fixes[2].effects.shadow!.color).toBe('#000000')
    expect(fixes[3].kind === 'backing' && contrastRatio(fixes[3].color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('puts a backing box just under the words, kept together with them', () => {
    const d = doc([text('#ffffff')])
    const next = applyReadableFix(d, 't', { kind: 'backing', color: '#1b1d23' }, { id: 'b', name: 'Backing', group: { id: 'g', name: 'Words' } })
    expect(next.layers.map((l) => l.id)).toEqual(['b', 't'])
    expect(next.layers.every((l) => l.group?.id === 'g')).toBe(true)
    const box = next.layers[0]
    expect(box.kind === 'shape' && box.box.width > 160 && box.box.rotation === 0.1 && box.box.cx === 200).toBe(true)
  })

  it('changes the color as one plain color', () => {
    const gradient = { type: 'linear' as const, angle: 0, stops: [] }
    const d = doc([text('#ffffff', 40, { style: { ...STYLE, gradient } })])
    const next = applyReadableFix(d, 't', { kind: 'color', color: '#1b1d23', tone: 'dark' }, { id: 'b', name: 'x', group: { id: 'g', name: 'x' } })
    const t = next.layers[0] as TextLayer
    expect(t.style.color).toBe('#1b1d23')
    expect(t.style.gradient).toBeNull()
  })
})
