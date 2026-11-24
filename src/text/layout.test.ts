import { describe, expect, it } from 'vitest'
import { firstStrongDirection, graphemes, hebrewNumber, indexAt, layoutText, listMarker, listStartAt, mainDirection, readingLevels, visualRuns, wrapParagraph, wrapPieces, type LayoutSettings, type TextMeasure } from './layout.ts'

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
    // As browsers do, a Hebrew word stays whole across a hyphen or maqaf, with a number or a
    // currency sign after it too; an English word or a bracket after a hyphen may start a line.
    expect(wrapPieces('בית־ספר')).toEqual(['בית־ספר'])
    expect(wrapPieces('ב-12/05 ו־$99 ב-₪3')).toEqual(['ב-12/05 ', 'ו־$99 ', 'ב-₪3'])
    expect(wrapPieces('ה-iPhone ב-(2)')).toEqual(['ה-', 'iPhone ', 'ב-', '(2)'])
    expect(wrapPieces('אַ-12 בּ—x')).toEqual(['אַ-12 ', 'בּ—', 'x'])
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

  it('adds room after each paragraph, empty ones too, and finds clicks below it', () => {
    const layout = layoutText('a\n\nb', settings({ paragraphSpace: 0.5 }), null, measure)
    // Lines are 15 high, with 5 after each paragraph.
    expect(layout.lines.map((l) => l.top)).toEqual([0, 20, 40])
    expect(layout.height).toBe(55)
    expect(layout.paragraphGap).toBe(5)
    expect(layout.lines[2].baseline - layout.lines[0].baseline).toBe(40)
    expect(indexAt('a\n\nb', layout, 0, 45, measure)).toBe(3)
    expect(indexAt('a\n\nb', layout, 0, 22, measure)).toBe(2)
  })

  it('keeps wrapped lines of one paragraph together', () => {
    const layout = layoutText('aa bb\ncc', settings({ paragraphSpace: 1 }), 25, measure)
    expect(layout.lines.map((l) => [l.text, l.top])).toEqual([
      ['aa', 0],
      ['bb', 15],
      ['cc', 40],
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

describe('lists', () => {
  it('counts in Hebrew letters, writing 15 and 16 as ט״ו and ט״ז', () => {
    expect([1, 2, 10, 11, 15, 16, 19, 20, 99, 100, 115, 400, 500].map(hebrewNumber)).toEqual(['א', 'ב', 'י', 'יא', 'טו', 'טז', 'יט', 'כ', 'צט', 'ק', 'קטו', 'ת', 'תק'])
    expect(listMarker('letter', 3, 'rtl')).toBe('ג.')
    expect(listMarker('letter', 28, 'ltr')).toBe('ab.')
    expect(listMarker('number', 12, 'ltr')).toBe('12.')
    expect(listMarker('bullet', 4, 'rtl')).toBe('•')
  })

  it('keeps room for the markers on the left of English and puts one before each paragraph with words', () => {
    // The room is as wide as "00." (30) plus a gap of 4.5, so 34.5.
    const layout = layoutText('one two\n\nthree', settings({ list: 'number' }), 94.5, measure)
    expect(layout.indent).toBe(34.5)
    expect(layout.lines.map((l) => [l.text, l.x])).toEqual([
      ['one', 34.5],
      ['two', 34.5],
      ['', 34.5],
      ['three', 34.5],
    ])
    // Wrapped lines and the empty paragraph have none; the numbers carry on after the gap.
    expect(layout.markers!.map((m) => [m.text, m.line, m.x])).toEqual([
      ['1.', 0, 10],
      ['2.', 3, 10],
    ])
  })

  it('puts the markers on the right of Hebrew and Yiddish, counting א ב ג', () => {
    const layout = layoutText('שלום\nװאָס', settings({ list: 'letter' }), null, measure)
    expect(layout.width).toBe(40 + layout.indent!)
    expect(layout.lines.map((l) => l.x)).toEqual([0, 10])
    expect(layout.markers!.map((m) => [m.text, m.x, m.direction])).toEqual([
      ['א.', 44.5, 'rtl'],
      ['ב.', 44.5, 'rtl'],
    ])
  })

  it('carries on counting in the next box of a story', () => {
    expect(listStartAt('a\nb\nc', 4)).toEqual({ number: 3, continued: false })
    // Starting in the middle of the second point: it got its number in the box before.
    expect(listStartAt('a\nbb cc', 5)).toEqual({ number: 3, continued: true })
    const layout = layoutText('cc\nd', settings({ list: 'number' }), null, measure, undefined, { number: 3, continued: true })
    expect(layout.markers!.map((m) => [m.text, m.line])).toEqual([['3.', 1]])
  })
})

describe('a big first letter', () => {
  // size 10, line height 15; the guessed letter ink is 7 high, so 3 lines make it 10 + 30/0.7 big.
  const capped = (text: string, patch: Partial<LayoutSettings> = {}) => layoutText(text, settings({ dropCap: 3, ...patch }), 200, measure)

  it('stands at the start of English, the first lines wrapping beside it', () => {
    const layout = capped('Once upon a time there was a little letter that grew very big and tall and kept on going')
    const cap = layout.dropCap!
    expect(cap.text).toBe('O')
    expect(cap.x).toBe(0)
    expect(cap.size).toBeCloseTo(10 + 30 / 0.7)
    expect(cap.height).toBe(45)
    // Its baseline is the third line's.
    expect(cap.baseline).toBeCloseTo(layout.lines[2].baseline)
    // The first three lines start after it and are narrower; the fourth has the whole width.
    expect(layout.lines[0].start).toBe(1)
    for (const line of layout.lines.slice(0, 3)) {
      expect(line.x).toBeCloseTo(cap.room)
      expect(line.width).toBeLessThanOrEqual(200 - cap.room + 0.01)
    }
    expect(layout.lines[3].x).toBe(0)
    expect(layout.lines.map((line) => line.text).join(' ')).not.toContain('Once')
  })

  it('stands on the right of Hebrew and Yiddish', () => {
    const layout = capped('בראשית היה רק דף ריק ואז באו המילים אחת אחרי השנייה עד שהדף התמלא כולו במילים יפות')
    const cap = layout.dropCap!
    expect(cap.text).toBe('ב')
    expect(cap.direction).toBe('rtl')
    expect(cap.x + cap.width).toBeCloseTo(200)
    // Lines beside it end before it on the right.
    expect(layout.lines[0].x + layout.lines[0].width).toBeLessThanOrEqual(200 - cap.room + 0.01)
    expect(layout.lines[3].x + layout.lines[3].width).toBeCloseTo(200)
    // A letter with its vowel points stays one letter.
    expect(capped('אַ גוטן טאָג').dropCap!.text).toBe('אַ')
  })

  it('keeps the text tall enough for itself, even with one short line', () => {
    expect(capped('Hi').height).toBe(45)
  })

  it('is left out where it cannot work', () => {
    expect(capped(' starts with a space').dropCap).toBeUndefined()
    expect(capped('\nnew line').dropCap).toBeUndefined()
    expect(capped('A list', { list: 'bullet' }).dropCap).toBeUndefined()
    expect(layoutText('Not wrapped', settings({ dropCap: 3 }), null, measure).dropCap).toBeUndefined()
    // In a box too narrow for the words beside it.
    expect(layoutText('Narrow', settings({ dropCap: 3 }), 60, measure).dropCap).toBeUndefined()
  })
})
