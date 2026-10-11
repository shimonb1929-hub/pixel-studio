import { describe, expect, it } from 'vitest'
import { firstStrongDirection, graphemes, indexAt, layoutText, mainDirection, readingLevels, visualRuns, wrapParagraph, wrapPieces, type LayoutSettings, type TextMeasure } from './layout.ts'

// Every letter (and space) is 10 pixels wide; the font is 8 above and 2 below the baseline.
const measure: TextMeasure = { width: (text) => graphemes(text).length * 10, ascent: 8, descent: 2 }
const width = (text: string) => measure.width(text, 'ltr')
const settings = (patch: Partial<LayoutSettings> = {}): LayoutSettings => ({ size: 10, lineHeight: 1.5, align: 'auto', direction: 'auto', ...patch })

describe('which way text reads', () => {
  it('follows the first letter, not numbers or punctuation', () => {
    expect(firstStrongDirection('שלום')).toBe('rtl')
    expect(firstStrongDirection('Hello')).toBe('ltr')
    expect(firstStrongDirection('50% הנחה!')).toBe('rtl')
    expect(firstStrongDirection('2024 Sale')).toBe('ltr')
    expect(firstStrongDirection('...!?')).toBeNull()
    // Yiddish, with its double letters and vowel points.
    expect(firstStrongDirection('״װאַס מאַכסטו?״')).toBe('rtl')
  })

  it('can be set by hand, for Hebrew that starts with an English word', () => {
    expect(mainDirection('iPhone חדש', 'auto')).toBe('ltr')
    expect(mainDirection('iPhone חדש', 'rtl')).toBe('rtl')
  })
})

describe('wrapping', () => {
  it('wraps after spaces, hyphens and the maqaf, and keeps the spaces with the line', () => {
    expect(wrapPieces('one two  three')).toEqual(['one ', 'two  ', 'three'])
    expect(wrapPieces('well-known')).toEqual(['well-', 'known'])
    expect(wrapPieces('בית־ספר')).toEqual(['בית־', 'ספר'])
    // No break after a hyphen that starts a word, like a minus sign; phone numbers can wrap.
    expect(wrapPieces('price -5 -off')).toEqual(['price ', '-5 ', '-off'])
    expect(wrapPieces('1-800-555')).toEqual(['1-', '800-', '555'])
    // A no-break space keeps words together.
    expect(wrapPieces('10 km')).toEqual(['10 km'])
  })

  it('fills each line as far as it fits', () => {
    expect(wrapParagraph('the quick brown fox', 100, width)).toEqual(['the quick ', 'brown fox'])
    // Spaces at the end of a line don't count toward its width.
    expect(wrapParagraph('abcd efghi', 50, width)).toEqual(['abcd ', 'efghi'])
  })

  it('breaks a word longer than the line between letters, never inside one', () => {
    expect(wrapParagraph('abcdefgh', 30, width)).toEqual(['abc', 'def', 'gh'])
    // A letter with its vowel point stays together.
    expect(wrapParagraph('אַבּגד', 20, width)).toEqual(['אַבּ', 'גד'])
  })

  it('gives back the paragraph exactly when the lines are put together', () => {
    const paragraph = 'Yiddish: װאָס מאַכסטו? Hebrew: שלום עולם, English and 123-456 numbers.'
    expect(wrapParagraph(paragraph, 70, width).join('')).toBe(paragraph)
  })
})

describe('laying out', () => {
  it('lines up right-to-left paragraphs on the right and others on the left', () => {
    const layout = layoutText('שלום\nHello', settings(), 100, measure)
    expect(layout.lines.map((l) => [l.direction, l.x])).toEqual([
      ['rtl', 60],
      ['ltr', 0],
    ])
    expect(layout.direction).toBe('rtl')
  })

  it('a paragraph without letters reads like the text around it', () => {
    const layout = layoutText('שלום\n123', settings(), 100, measure)
    expect(layout.lines[1].direction).toBe('rtl')
    expect(layout.lines[1].x).toBe(70)
  })

  it('a chosen direction and alignment apply to every paragraph', () => {
    const layout = layoutText('iPhone חדש\nwow', settings({ direction: 'rtl', align: 'center' }), 200, measure)
    expect(layout.lines.map((l) => l.direction)).toEqual(['rtl', 'rtl'])
    expect(layout.lines.map((l) => l.x)).toEqual([50, 85])
  })

  it('without wrapping, the text is as wide as its longest line', () => {
    const layout = layoutText('Hi\nthere you', settings(), null, measure)
    expect(layout.width).toBe(90)
    expect(layout.height).toBe(30)
    expect(layout.lines.map((l) => l.baseline)).toEqual([10.5, 25.5])
  })

  it('justified lines reach both edges, except the last line of a paragraph', () => {
    const layout = layoutText('aa bb cc dd ee', settings({ align: 'justify' }), 85, measure)
    expect(layout.lines.map((l) => l.text)).toEqual(['aa bb cc', 'dd ee'])
    expect(layout.lines[0].wordSpacing).toBe(2.5)
    expect(layout.lines[1].wordSpacing).toBe(0)
  })

  it('keeps empty lines', () => {
    const layout = layoutText('a\n\nb', settings(), null, measure)
    expect(layout.lines.map((l) => [l.start, l.end, l.text])).toEqual([
      [0, 1, 'a'],
      [2, 2, ''],
      [3, 4, 'b'],
    ])
  })

  it('finds where to put the cursor from a click, on either side', () => {
    const ltr = layoutText('abcd', settings(), null, measure)
    expect(indexAt('abcd', ltr, 21, 5, measure)).toBe(2)
    // Right to left: the start of the text is on the right.
    const rtl = layoutText('אבגד', settings(), 100, measure)
    expect(indexAt('אבגד', rtl, 99, 5, measure)).toBe(0)
    expect(indexAt('אבגד', rtl, 79, 5, measure)).toBe(2)
  })
})

describe('reading order', () => {
  const pieces = (text: string, direction: 'ltr' | 'rtl', from = 0, to = text.length) =>
    visualRuns(readingLevels(text, direction), from, to).map((r) => [text.slice(r.start, r.end), r.level % 2 === 1 ? 'rtl' : 'ltr'])

  it('puts English and numbers inside Hebrew in their own left-to-right pieces', () => {
    expect(pieces('מבצע 50% הנחה', 'rtl')).toEqual([
      [' הנחה', 'rtl'],
      ['50%', 'ltr'],
      ['מבצע ', 'rtl'],
    ])
  })

  it('keeps punctuation with its words when a wrapped line ends with it', () => {
    const paragraph = 'שלום Sale ends 10:00. iPhone חדש'
    const end = paragraph.indexOf('. ') + 1
    // The line "שלום Sale ends 10:00." ends with the period, which belongs to the English words
    // that go on to the next line, so it stays on their right.
    expect(pieces(paragraph, 'rtl', 0, end).map(([text]) => text)).toEqual(['Sale ends 10:00.', 'שלום '])
  })

  it('a right-to-left paragraph ending in a "!" puts it on the left', () => {
    expect(pieces('שלום!', 'rtl')).toEqual([['שלום!', 'rtl']])
  })
})

describe('lines in reading order', () => {
  it('measures each piece and adds them up for the line', () => {
    const layout = layoutText('אבג abc', settings(), null, measure)
    expect(layout.lines[0].runs.map((r) => [r.start, r.end, r.rtl])).toEqual([
      [4, 7, false],
      [0, 4, true],
    ])
    expect(layout.lines[0].width).toBe(70)
  })
})
