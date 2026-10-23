import { describe, expect, it } from 'vitest'
import type { TextStyle } from '../editor/types.ts'
import { editSpans, sharedStyle, styledPieces, styleRange, tidySpans } from './spans.ts'

const base: TextStyle = { font: 'inter', size: 20, weight: 400, italic: false, color: '#111111', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2 }

describe('words with their own look', () => {
  it('styles a range, and merges neighbors that look the same', () => {
    let spans = styleRange(undefined, base, 11, 0, 5, { weight: 700 })
    expect(spans).toEqual([{ start: 0, end: 5, style: { weight: 700 } }])
    spans = styleRange(spans, base, 11, 5, 8, { weight: 700 })
    expect(spans).toEqual([{ start: 0, end: 8, style: { weight: 700 } }])
    spans = styleRange(spans, base, 11, 2, 4, { color: '#ff0000' })
    expect(spans).toEqual([
      { start: 0, end: 2, style: { weight: 700 } },
      { start: 2, end: 4, style: { weight: 700, color: '#ff0000' } },
      { start: 4, end: 8, style: { weight: 700 } },
    ])
  })

  it('drops looks that say the same as the main style', () => {
    expect(styleRange(undefined, base, 5, 0, 5, { weight: 400, color: '#111111' })).toBeUndefined()
    expect(tidySpans([{ start: 0, end: 3, style: { color: '#111111' } }], base, 5)).toBeUndefined()
    expect(tidySpans([{ start: 2, end: 9, style: { italic: true } }], base, 5)).toEqual([{ start: 2, end: 5, style: { italic: true } }])
  })

  it('keeps looks on the same letters while typing', () => {
    // "Hello world", with "world" red.
    const red = [{ start: 6, end: 11, style: { color: '#ff0000' } }]
    // Typing before the red word moves it along.
    expect(editSpans(red, base, 'Hello world', 'Hello big world')).toEqual([{ start: 10, end: 15, style: { color: '#ff0000' } }])
    // Typing inside or at the end of it makes the new letters red too.
    expect(editSpans(red, base, 'Hello world', 'Hello worlds')).toEqual([{ start: 6, end: 12, style: { color: '#ff0000' } }])
    // Taking letters out shrinks it, and taking it all out leaves nothing.
    expect(editSpans(red, base, 'Hello world', 'Hello wd')).toEqual([{ start: 6, end: 8, style: { color: '#ff0000' } }])
    expect(editSpans(red, base, 'Hello world', 'Hello ')).toBeUndefined()
    // A look picked with nothing selected goes to what is typed next.
    expect(editSpans(undefined, base, 'Hi', 'Hi!', { weight: 700 })).toEqual([{ start: 2, end: 3, style: { weight: 700 } }])
  })

  it('cuts a stretch where the look changes, and tells what is shared', () => {
    const spans = [{ start: 2, end: 4, style: { italic: true } }]
    expect(styledPieces(spans, base, 0, 6).map((p) => [p.start, p.end, p.style.italic])).toEqual([
      [0, 2, false],
      [2, 4, true],
      [4, 6, false],
    ])
    expect(sharedStyle(spans, base, 0, 6)).toEqual({ font: 'inter', weight: 400, color: '#111111' })
    expect(sharedStyle(spans, base, 2, 4).italic).toBe(true)
  })
})
