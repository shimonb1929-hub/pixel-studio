import { describe, expect, it } from 'vitest'
import type { Pixels } from '../editor/upscale.ts'
import type { EditorDocument, PixelLayer, TextStyle } from '../editor/types.ts'
import { addWordLayers, defaultOcrLanguages, foundLines, inkLook, lineSize, ocrLanguageCode, scaleLines, wordLayers, type FoundLine, type Measure, type RecognizedPage } from './ocrLayout.ts'

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })

function page(lines: { text: string; confidence: number; bbox?: ReturnType<typeof box> }[]): RecognizedPage {
  return { blocks: [{ paragraphs: [{ lines: lines.map((l) => ({ bbox: box(0, 0, 100, 20), ...l })) }] }] }
}

function picture(width: number, height: number, color: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = color(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

describe('foundLines', () => {
  it('keeps clear lines and tidies their spaces', () => {
    const lines = foundLines(page([{ text: '  Hello   world \n', confidence: 91 }, { text: 'שלום עולם', confidence: 88 }]))
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'שלום עולם'])
  })

  it('takes out invisible reading-direction marks', () => {
    const lines = foundLines(page([{ text: '\u200eOpen 9 to 5\u200f', confidence: 90 }, { text: 'שלום עולם\u200e', confidence: 90 }]))
    expect(lines.map((l) => l.text)).toEqual(['Open 9 to 5', 'שלום עולם'])
  })

  it('leaves out unsure lines and lines of marks', () => {
    const lines = foundLines(page([{ text: 'Sale', confidence: 30 }, { text: '|| — ~ ;', confidence: 80 }, { text: '— ok —', confidence: 80 }, { text: '', confidence: 99 }]))
    expect(lines.map((l) => l.text)).toEqual(['— ok —'])
  })

  it('copes with a page that has nothing', () => {
    expect(foundLines({ blocks: null })).toEqual([])
  })
})

describe('languages', () => {
  it('starts with the app language and English', () => {
    expect(defaultOcrLanguages('he')).toEqual(['heb', 'eng'])
    expect(defaultOcrLanguages('yi')).toEqual(['yid', 'eng'])
    expect(defaultOcrLanguages('fr')).toEqual(['eng'])
  })

  it('asks for Hebrew and Yiddish before English', () => {
    expect(ocrLanguageCode(['eng', 'heb'])).toBe('heb+eng')
    expect(ocrLanguageCode(['eng', 'yid', 'heb'])).toBe('heb+yid+eng')
    expect(ocrLanguageCode([])).toBe('eng')
  })
})

describe('inkLook', () => {
  it('finds dark letters on light paper', () => {
    // A white box with a dark red bar (the "letters") over a fifth of it.
    const pixels = picture(50, 20, (x) => (x >= 20 && x < 30 ? [120, 10, 20] : [250, 248, 240]))
    const look = inkLook(pixels, box(0, 0, 50, 20))
    expect(look.color).toBe('#780a14')
    expect(look.coverage).toBeCloseTo(0.2, 1)
  })

  it('finds light letters on a dark sign', () => {
    const pixels = picture(40, 20, (_, y) => (y >= 8 && y < 12 ? [255, 230, 0] : [20, 30, 90]))
    expect(inkLook(pixels, box(0, 0, 40, 20)).color).toBe('#ffe600')
  })
})

describe('lineSize', () => {
  it('fits the line’s width', () => {
    expect(lineSize(500, 250, 40)).toBe(50)
  })

  it('stays near what the line’s height suggests', () => {
    expect(lineSize(500, 2000, 40)).toBe(68)
    expect(lineSize(500, 50, 40)).toBe(32)
  })
})

describe('scaleLines', () => {
  it('brings lines found on a bigger copy back to the picture’s pixels', () => {
    const line: FoundLine = { text: 'a', box: box(20, 40, 60, 80), baseline: box(20, 70, 60, 72), confidence: 90 }
    expect(scaleLines([line], 2)[0]).toMatchObject({ box: box(10, 20, 30, 40), baseline: box(10, 35, 30, 36) })
  })
})

const STYLE: TextStyle = { font: 'heebo', size: 48, weight: 700, italic: false, color: '#000000', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }
// Every letter is half as wide as the letters are big; the baseline sits 80% down a line.
const measure = (style: TextStyle): Measure => ({ width: (text) => text.length * style.size * 0.5, baseline: (lineHeight) => lineHeight * 0.8 })

function photo(placed: Partial<PixelLayer> = {}): PixelLayer {
  return { id: 'photo', kind: 'raster', name: 'Photo', visible: true, opacity: 1, locked: false, adjust: null, canvas: { width: 200, height: 100 } as HTMLCanvasElement, x: 0, y: 0, box: null, ...placed }
}

describe('wordLayers', () => {
  const pixels = picture(200, 100, (x, y) => (y >= 20 && y < 40 && x >= 10 && x < 110 && x % 4 === 0 ? [10, 10, 10] : [255, 255, 255]))
  let id = 0
  const make = (lines: FoundLine[], layer = photo()) => wordLayers(lines, layer, pixels, STYLE, measure, () => `t${++id}`, (text) => text)

  it('places each line where it was, about as big, in its color', () => {
    const [layer] = make([{ text: 'Hello', box: box(10, 20, 110, 40), baseline: null, confidence: 90 }])
    expect(layer.kind).toBe('text')
    expect(layer.text).toBe('Hello')
    // Five letters would need size 40 to fill 100 pixels, but a line 20 pixels high keeps it to 34.
    expect(layer.style.size).toBeCloseTo(34)
    expect(layer.style.color).toBe('#0a0a0a')
    expect(layer.style.direction).toBe('auto')
    expect(layer.box.cx).toBeCloseTo(60)
    expect(layer.box.cy).toBeCloseTo(30)
    expect(layer.wrap).toBe(false)
  })

  it('stands the letters on the picture’s baseline', () => {
    const [layer] = make([{ text: 'Hi', box: box(10, 20, 30, 40), baseline: box(10, 36, 30, 36), confidence: 90 }])
    const lineHeight = layer.style.size * 1.2
    // The box's top plus the baseline distance lands on the picture's baseline.
    expect(layer.box.cy - lineHeight / 2 + lineHeight * 0.8).toBeCloseTo(36)
  })

  it('follows a photo that was moved, resized and turned', () => {
    const turned = photo({ box: { cx: 500, cy: 300, width: 400, height: 200, rotation: Math.PI / 2 } })
    const [layer] = make([{ text: 'Hello', box: box(90, 40, 110, 60), baseline: null, confidence: 90 }], turned)
    // The middle of the picture is the middle of the box, whatever the turn.
    expect(layer.box.cx).toBeCloseTo(500)
    expect(layer.box.cy).toBeCloseTo(300)
    expect(layer.box.rotation).toBeCloseTo(Math.PI / 2)
    // Twice as big on the design as in the picture.
    expect(layer.style.size).toBeCloseTo(2 * 20 * 0.8)
  })

  it('leaves the reading direction to the text, for Hebrew too', () => {
    const [layer] = make([{ text: 'שלום', box: box(10, 20, 110, 40), baseline: null, confidence: 90 }])
    expect(layer.style.direction).toBe('auto')
    expect(layer.style.align).toBe('auto')
  })
})

describe('addWordLayers', () => {
  const text = (id: string) => ({ id, kind: 'text', name: id, visible: true, opacity: 1, locked: false, adjust: null, box: { cx: 0, cy: 0, width: 1, height: 1, rotation: 0 }, text: id, style: STYLE, wrap: false }) as const
  const doc = (): EditorDocument => ({
    id: 'd',
    name: 'Design',
    width: 100,
    height: 100,
    background: '#ffffff',
    layers: [photo(), { ...photo(), id: 'top', name: 'Top' }],
    activeLayerId: 'top',
    selection: null,
  })

  it('puts the words just above the photo, kept together, and keeps the photo', () => {
    const next = addWordLayers(doc(), 'photo', [text('a'), text('b')], { id: 'g', name: 'Words from picture' })
    expect(next.layers.map((l) => l.id)).toEqual(['photo', 'a', 'b', 'top'])
    expect(next.layers[1].group).toEqual({ id: 'g', name: 'Words from picture' })
    expect(next.layers[2].group?.id).toBe('g')
    expect(next.layers[0].group).toBeUndefined()
  })

  it('does not keep a single line in a group of its own', () => {
    const next = addWordLayers(doc(), 'photo', [text('a')], { id: 'g', name: 'Words from picture' })
    expect(next.layers.map((l) => l.id)).toEqual(['photo', 'a', 'top'])
    expect(next.layers[1].group).toBeUndefined()
  })

  it('changes nothing when nothing was found', () => {
    const before = doc()
    expect(addWordLayers(before, 'photo', [], { id: 'g', name: 'x' })).toBe(before)
  })
})
