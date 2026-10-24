import { describe, expect, it } from 'vitest'
import { hexToRgb } from './color.ts'
import { extractPalette, hexToLab, labDistance, labToHex, matchDesignToPalette, recoloredCount, shapeColorMap, textColorOn, type PaletteColor } from './palette.ts'
import { contrastRatio } from './readable.ts'
import type { EditorDocument, Layer, TextLayer } from './types.ts'

// RGBA pixels: each color repeated `count` times.
function pixels(parts: [string, number][], alpha = 255): Uint8ClampedArray {
  const data: number[] = []
  for (const [hex, count] of parts) {
    const { r, g, b } = hexToRgb(hex)
    for (let i = 0; i < count; i++) data.push(r, g, b, alpha)
  }
  return Uint8ClampedArray.from(data)
}

const near = (palette: PaletteColor[], hex: string, within = 0.05) => palette.some((p) => labDistance(hexToLab(p.hex), hexToLab(hex)) < within)

describe('colors from a photo', () => {
  it('converts to OKLab and back without drifting', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#3366cc', '#7a5c2e']) expect(labToHex(hexToLab(hex))).toBe(hex)
  })

  it('finds the main colors, and keeps a small bright color next to a big plain sky', () => {
    const photo = pixels([
      ['#8fb8de', 6000],
      ['#2e6b30', 2500],
      ['#d62828', 300],
      ['#f2e8cf', 1200],
    ])
    const palette = extractPalette(photo)
    expect(palette.length).toBe(4)
    for (const hex of ['#8fb8de', '#2e6b30', '#d62828', '#f2e8cf']) expect(near(palette, hex)).toBe(true)
    // Darkest first.
    expect(palette.map((p) => p.lightness)).toEqual([...palette.map((p) => p.lightness)].sort((a, b) => a - b))
  })

  it('never shows two colors that look the same, and stops at the count asked for', () => {
    const photo = pixels([
      ['#204080', 1000],
      ['#214181', 1000],
      ['#e0a020', 1000],
      ['#20a060', 1000],
      ['#a02060', 1000],
      ['#101010', 1000],
      ['#f0f0f0', 1000],
      ['#808080', 1000],
    ])
    const palette = extractPalette(photo, 5)
    expect(palette.length).toBe(5)
    for (let i = 0; i < palette.length; i++)
      for (let j = i + 1; j < palette.length; j++) expect(labDistance(hexToLab(palette[i].hex), hexToLab(palette[j].hex))).toBeGreaterThan(0.06)
  })

  it('ignores see-through pixels and specks', () => {
    expect(extractPalette(pixels([['#ff0000', 100]], 0))).toEqual([])
    const palette = extractPalette(
      pixels([
        ['#ff0000', 10000],
        ['#00ff00', 2],
      ]),
    )
    expect(palette.map((p) => p.hex)).toEqual(['#ff0000'])
  })
})

const P = (hex: string): PaletteColor => {
  const lab = hexToLab(hex)
  return { hex, share: 0.2, lightness: lab.L, chroma: Math.hypot(lab.a, lab.b) }
}
const PALETTE = ['#1d2b3a', '#2f6f8f', '#e07a2f', '#f4ead5'].map(P)

const shape = (id: string, color: string, size = 100, extra: Partial<Layer> = {}): Layer =>
  ({
    id,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: 100, cy: 100, width: size, height: size, rotation: 0 },
    geometry: { type: 'rectangle', corners: 0, sides: 5, arrow: false },
    fill: { kind: 'color', color },
    outline: null,
    ...extra,
  }) as Layer

const text = (id: string, color: string): TextLayer => ({
  id,
  kind: 'text',
  name: id,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx: 100, cy: 100, width: 80, height: 20, rotation: 0 },
  text: 'Hello',
  style: { font: 'inter', size: 20, weight: 400, italic: false, color, align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 },
  wrap: false,
  spans: [{ start: 0, end: 2, style: { color: '#ff0000' } }],
})

const doc = (layers: Layer[]): EditorDocument => ({ id: 'd', name: 'Test', width: 400, height: 300, background: '#ffffff', layers, activeLayerId: '', selection: null })

describe('matching the design to a photo', () => {
  it('keeps dark colors dark and light colors light, and gives different colors different photo colors', () => {
    const map = shapeColorMap(['#000000', '#ffffff', '#3070a0'], PALETTE)
    expect(map.get('#000000')).toBe('#1d2b3a')
    expect(map.get('#ffffff')).toBe('#f4ead5')
    expect(new Set(map.values()).size).toBe(3)
  })

  it('picks a text color that reads, darkening a photo color when none is clear enough', () => {
    expect(contrastRatio(textColorOn('#ffffff', PALETTE), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    const color = textColorOn('#ffffff', [P('#f4ead5'), P('#e0d0b0')])
    expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('recolors shapes and words, words readable on what is behind them', () => {
    const d = doc([shape('bg', '#222222', 300), shape('dot', '#cc3333', 40), text('t', '#333333'), shape('locked', '#00ff00', 10, { locked: true })])
    const next = matchDesignToPalette(d, PALETTE, () => '#1d2b3a')
    expect(recoloredCount(d, next)).toBe(3)
    const t = next.layers.find((l) => l.id === 't') as TextLayer
    expect(contrastRatio(t.style.color, '#1d2b3a')).toBeGreaterThanOrEqual(4.5)
    // The red word keeps a color of its own.
    expect(t.spans![0].style.color).not.toBe('#ff0000')
    expect(t.spans![0].style.color).not.toBe(t.style.color)
    expect((next.layers.find((l) => l.id === 'locked') as Extract<Layer, { kind: 'shape' }>).fill).toEqual({ kind: 'color', color: '#00ff00' })
    // Nothing else about the design changes.
    expect(next.layers.map((l) => l.id)).toEqual(d.layers.map((l) => l.id))
  })

  it('changes nothing without a palette', () => {
    const d = doc([shape('a', '#123456')])
    expect(matchDesignToPalette(d, [], () => '#ffffff')).toBe(d)
  })
})
