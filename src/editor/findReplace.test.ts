import { describe, expect, it, vi } from 'vitest'
import type { EditorDocument, TableLayer, TextLayer, TextStyle } from './types.ts'

// Measuring letters needs a browser; here a text's box just stays as it is, and a story's first box
// shows all of it.
vi.mock('../text/textLayer.ts', () => ({
  changeText: (layer: TextLayer, patch: Partial<TextLayer>) => {
    const next = { ...layer, ...patch }
    if (!patch.spans) delete next.spans
    return next
  },
  fitText: (layer: TextLayer) => layer,
  textLayout: () => ({ lineHeight: 10, lines: [{ row: 0, start: 0 }] }),
  textName: (text: string) => text.split('\n')[0] || 'Text',
}))
vi.mock('./table.ts', () => ({ fitTable: (table: TableLayer) => table }))

const { countFound, findIn, findPattern, replaceEverywhere, replaceIn } = await import('./findReplace.ts')
const { addPage, allPages, goToPage } = await import('./pages.ts')

const base = { visible: true, opacity: 1, locked: false, adjust: null }
const style: TextStyle = { font: 'heebo', size: 40, weight: 400, italic: false, color: '#112233', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }
const text = (id: string, words: string, more: Partial<TextLayer> = {}): TextLayer => ({
  ...base,
  id,
  kind: 'text',
  name: words,
  box: { cx: 50, cy: 50, width: 100, height: 48, rotation: 0 },
  text: words,
  style,
  wrap: true,
  ...more,
})
const design = (layers: EditorDocument['layers']): EditorDocument => ({ id: 'd', name: 'd', width: 200, height: 200, background: '#ffffff', layers, activeLayerId: '', selection: null })
const loose = { matchCase: false, wholeWords: false }

describe('finding words', () => {
  it('finds every place, with or without the same capitals', () => {
    expect(findIn('Party at the party', findPattern('party', loose)!)).toEqual([
      { start: 0, end: 5 },
      { start: 13, end: 18 },
    ])
    expect(findIn('Party at the party', findPattern('party', { ...loose, matchCase: true })!)).toEqual([{ start: 13, end: 18 }])
  })

  it('finds whole words only when asked, in Hebrew and Yiddish too', () => {
    expect(findIn('art party art', findPattern('art', { ...loose, wholeWords: true })!)).toHaveLength(2)
    expect(findIn('art party art', findPattern('art', loose)!)).toHaveLength(3)
    // "שבת" inside "שבתות" is not a whole word; with a vowel point after it, it isn't either.
    expect(findIn('שבת שלום, שבתות', findPattern('שבת', { ...loose, wholeWords: true })!)).toEqual([{ start: 0, end: 3 }])
    expect(findIn('גוט שבת!', findPattern('שבת', { ...loose, wholeWords: true })!)).toEqual([{ start: 4, end: 7 }])
  })

  it('treats signs like ( . * + as plain letters', () => {
    expect(findIn('Price (USD) 5.00 or 5x00', findPattern('5.00', loose)!)).toEqual([{ start: 12, end: 16 }])
    expect(findIn('a (b) c', findPattern('(b)', loose)!)).toHaveLength(1)
    expect(findPattern('', loose)).toBeNull()
  })

  it('keeps each word looking as it did', () => {
    // "big" is bold; changing it to "huge" keeps it bold, and the words after keep their red.
    const spans = [
      { start: 4, end: 7, style: { weight: 700 } },
      { start: 8, end: 11, style: { color: '#ff0000' } },
    ]
    const result = replaceIn('the big day', spans, style, findPattern('big', loose)!, 'huge')!
    expect(result.text).toBe('the huge day')
    expect(result.count).toBe(1)
    expect(result.spans).toEqual([
      { start: 4, end: 8, style: { weight: 700 } },
      { start: 9, end: 12, style: { color: '#ff0000' } },
    ])
  })

  it('a replacement with $ signs is put in as typed', () => {
    expect(replaceIn('cost: X', undefined, style, findPattern('X', loose)!, '$1 $&')!.text).toBe('cost: $1 $&')
  })
})

describe('changing words everywhere', () => {
  it('changes texts on every page and in table cells, and counts them', () => {
    const table: TableLayer = {
      ...base,
      id: 'tb',
      kind: 'table',
      name: 'Table',
      box: { cx: 50, cy: 50, width: 100, height: 40, rotation: 0 },
      cells: [
        ['Tea', 'Tea and cake'],
        ['Cake', '5'],
      ],
      columnWidths: [50, 50],
      align: ['auto', 'auto'],
      style,
      padding: 4,
      background: null,
      header: null,
      stripes: null,
      lines: { kind: 'all', color: '#000000', width: 1 },
      rtl: false,
    }
    let doc = design([text('a', 'Tea time'), table])
    doc = addPage(doc)
    doc = { ...doc, layers: [text('b', 'More tea, please')] }
    doc = goToPage(doc, 0)
    expect(countFound(doc, 'tea', loose)).toEqual({ count: 4, pages: [0, 1] })

    const { doc: next, count } = replaceEverywhere(doc, 'tea', 'Coffee', loose)
    expect(count).toBe(4)
    const pages = allPages(next)
    expect((pages[0].layers[0] as TextLayer).text).toBe('Coffee time')
    // A text named after its words follows them.
    expect(pages[0].layers[0].name).toBe('Coffee time')
    expect((pages[0].layers[1] as TableLayer).cells).toEqual([
      ['Coffee', 'Coffee and cake'],
      ['Cake', '5'],
    ])
    expect((pages[1].layers[0] as TextLayer).text).toBe('More Coffee, please')
    expect(countFound(next, 'tea', loose).count).toBe(0)
  })

  it('leaves the design as it was when nothing is found, and leaves page numbers alone', () => {
    const doc = design([text('a', 'Hello'), text('n', '1', { pageNumber: true })])
    expect(replaceEverywhere(doc, '1', '2', loose).doc).toBe(doc)
    expect(replaceEverywhere(doc, 'nothing', 'x', loose)).toEqual({ doc, count: 0 })
  })

  it('changes a story running through boxes once, not once per box', () => {
    const flow = { story: 's', full: 'one two one', height: 20 }
    const doc = design([
      text('a', 'one two', { flow: { ...flow, index: 0, start: 0, end: 8 } }),
      text('b', 'one', { flow: { ...flow, index: 1, start: 8, end: 11 } }),
    ])
    expect(countFound(doc, 'one', loose).count).toBe(2)
    const { doc: next, count } = replaceEverywhere(doc, 'one', 'three', loose)
    expect(count).toBe(2)
    for (const layer of next.layers) expect((layer as TextLayer).flow!.full).toBe('three two three')
  })
})
