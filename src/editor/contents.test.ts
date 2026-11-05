import { describe, expect, it } from 'vitest'
import { contentsText, findContents, headingsOf, updateContents } from './contents.ts'
import { addPage, goToPage } from './pages.ts'
import type { EditorDocument, TextLayer, TextStyle } from './types.ts'

const base = { visible: true, opacity: 1, locked: false, adjust: null }
const style: TextStyle = { font: 'heebo', size: 20, weight: 400, italic: false, color: '#112233', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }
const text = (id: string, words: string, size: number, cy: number, more: Partial<TextLayer> = {}): TextLayer => ({
  ...base,
  id,
  kind: 'text',
  name: words,
  box: { cx: 100, cy, width: 150, height: size * 1.2, rotation: 0 },
  text: words,
  style: { ...style, size },
  wrap: true,
  ...more,
})
const design = (layers: EditorDocument['layers']): EditorDocument => ({ id: 'd', name: 'd', width: 200, height: 200, background: '#ffffff', layers, activeLayerId: '', selection: null })
const body = 'Many words of the story that go on and on, so most letters are this small size.'

describe('contents list', () => {
  it('finds the big words on each page, top to bottom, with their page', () => {
    let doc = design([text('a', body, 20, 120), text('b', 'Second  heading', 40, 80), text('c', 'First heading', 40, 20)])
    doc = addPage(doc)
    doc = { ...doc, layers: [text('d', body, 20, 120), text('e', 'Chapter two', 36, 20)] }
    expect(headingsOf(doc)).toEqual([
      { text: 'First heading', page: 1 },
      { text: 'Second heading', page: 1 },
      { text: 'Chapter two', page: 2 },
    ])
    expect(contentsText(headingsOf(doc))).toBe('First heading … 1\nSecond heading … 1\nChapter two … 2')
  })

  it('leaves out page numbers and the list itself, and finds and updates the list on any page', () => {
    let doc = design([text('a', body, 20, 120), text('p', '1', 60, 190, { pageNumber: true }), text('list', 'Old … 1', 60, 100, { contents: true })])
    expect(headingsOf(doc)).toEqual([])
    doc = goToPage(addPage(doc), 1)
    expect(findContents(doc)).toEqual({ page: 0, id: 'list' })
    const next = updateContents(doc, (l) => ({ ...l, text: 'New … 2' }))
    const list = goToPage(next, 0).layers.find((l) => l.id === 'list') as TextLayer
    expect(list.text).toBe('New … 2')
  })
})
