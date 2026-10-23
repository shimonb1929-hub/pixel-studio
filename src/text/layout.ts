import bidiFactory from 'bidi-js'

// Laying text out in lines: which way each paragraph reads, where lines wrap, and where each line
// sits. Measuring is passed in, so this works the same for the screen, downloads and tests.
//
// Text is kept in the order it was typed. Which way each letter reads is worked out for the whole
// paragraph with the Unicode rules for mixing directions (the same rules browsers follow while
// typing), and only then is the paragraph cut into lines. Each line is drawn as pieces that each
// read one way, placed in reading order. So Hebrew and Yiddish read right to left, numbers and
// English words inside them read left to right, and punctuation stays with the words it belongs
// to, even at the end of a wrapped line.

export type Direction = 'ltr' | 'rtl'
export type TextAlign = 'auto' | 'left' | 'center' | 'right' | 'justify'
export type TextDirection = 'auto' | Direction
// A list: each paragraph starts with a dot, a number or a letter (א ב ג for right-to-left text).
export type ListKind = 'bullet' | 'number' | 'letter'

export interface TextMeasure {
  // How wide a piece of text is, in design pixels, read in the given direction.
  width: (text: string, direction: Direction) => number
  // The font's height above and below the baseline, in design pixels.
  ascent: number
  descent: number
  // Where the baseline sits in a line of the given height, if it can be measured exactly (the
  // browser rounds the font's heights its own way); otherwise it's worked out from the heights.
  baseline?: (lineHeight: number) => number
}

export interface LayoutSettings {
  size: number
  // Line spacing as a multiple of the size.
  lineHeight: number
  align: TextAlign
  direction: TextDirection
  // Each paragraph is a point in a list. Missing or null: plain paragraphs.
  list?: ListKind | null
}

// Where a list starts, for text that runs on from an earlier box: the number its first point
// gets, and whether its first paragraph began in the box before (then it has no marker here).
export interface ListStart {
  number: number
  continued: boolean
}

// The dot, number or letter before a point of a list, and where it's drawn.
export interface ListMarker {
  text: string
  // Left edge and baseline, from the top-left of the text, and which line it's on.
  x: number
  baseline: number
  line: number
  width: number
  direction: Direction
}

// A piece of a line that reads one way, from `start` to `end` in the text.
export interface TextRun {
  start: number
  end: number
  rtl: boolean
  width: number
}

export interface LayoutLine {
  // Where the line is in the text (end leaves out spaces the line ends with).
  start: number
  end: number
  // What's drawn: the line without the spaces it ends with.
  text: string
  width: number
  // Left edge of the line and its baseline, from the top-left of the text.
  x: number
  baseline: number
  direction: Direction
  // Extra space added to each space between words, for justified lines.
  wordSpacing: number
  // The line's pieces from left to right as they appear.
  runs: TextRun[]
}

export interface TextLayout {
  width: number
  height: number
  lineHeight: number
  lines: LayoutLine[]
  // The direction of the text as a whole: the first paragraph with letters decides.
  direction: Direction
  // For a list: the room kept for the markers at the start side of every line, and the markers.
  indent?: number
  markers?: ListMarker[]
}

// Letters of scripts written right to left.
const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}]/u
const LETTER = /\p{L}/u
const RLM = '‏'
const LRM = '‎'

// The way a piece of text reads, from its first letter (numbers and punctuation don't count).
// Null when it has no letters.
export function firstStrongDirection(text: string): Direction | null {
  for (const char of text) {
    if (char === RLM) return 'rtl'
    if (char === LRM) return 'ltr'
    if (LETTER.test(char)) return RTL_LETTER.test(char) ? 'rtl' : 'ltr'
  }
  return null
}

export function hasRtlLetters(text: string): boolean {
  return RTL_LETTER.test(text)
}

// The direction of the whole text: the one chosen, or the first letter's.
export function mainDirection(text: string, direction: TextDirection): Direction {
  if (direction !== 'auto') return direction
  return firstStrongDirection(text) ?? 'ltr'
}

// Where a line with no other alignment lines up: right for right-to-left text, left otherwise.
export function resolveAlign(align: TextAlign, direction: Direction): 'left' | 'center' | 'right' {
  if (align === 'center' || align === 'left' || align === 'right') return align
  return direction === 'rtl' ? 'right' : 'left'
}

// Spaces a line can wrap after. No-break spaces keep words together.
const SPACE = /[ \t  -  -  　]/
// A line can also wrap after a hyphen, a Hebrew maqaf (־) or a dash.
const BREAK_AFTER = /[-־‐‒–—]/
// A Hebrew letter, maybe with its vowel points, right before a hyphen.
const HEBREW_BEFORE = /[\u05d0-\u05ea\u05f0-\u05f2][\u0591-\u05c7]*$/
// After a Hebrew letter and a plain hyphen, browsers still wrap before an English word or an
// opening bracket or quote, but keep a number, a currency sign or more Hebrew with the word
// ("ב-12", "ו-₪3", "בית-ספר"); after a maqaf or dash they keep anything with it.
const BREAKS_AFTER_HEBREW_HYPHEN = /[A-Za-z([{'"]/

// Splits a paragraph into pieces that each end where a line may wrap.
export function wrapPieces(paragraph: string): string[] {
  const pieces: string[] = []
  let start = 0
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i]
    if (SPACE.test(char)) {
      let end = i + 1
      while (end < paragraph.length && SPACE.test(paragraph[end])) end++
      pieces.push(paragraph.slice(start, end))
      start = end
      i = end - 1
      continue
    }
    const next = paragraph[i + 1]
    // Not after a hyphen that starts a word, like a minus sign ("-5"), as browsers do.
    if (BREAK_AFTER.test(char) && i > start && next !== undefined && !SPACE.test(next) && !keepsHebrewTogether(paragraph.slice(start, i), char, next)) {
      pieces.push(paragraph.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < paragraph.length) pieces.push(paragraph.slice(start))
  return pieces
}

// Whether a hyphen after a Hebrew letter keeps what follows on its line, the way browsers wrap.
function keepsHebrewTogether(before: string, hyphen: string, next: string): boolean {
  if (!HEBREW_BEFORE.test(before)) return false
  if (hyphen === '—') return false
  return hyphen !== '-' || !BREAKS_AFTER_HEBREW_HYPHEN.test(next)
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Letters with their vowel points and marks, which never come apart.
export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment)
}

function trimEnd(text: string): string {
  let end = text.length
  while (end > 0 && SPACE.test(text[end - 1])) end--
  return text.slice(0, end)
}

// A tiny allowance, so a line that fits exactly doesn't wrap because of rounding.
const FIT_SLACK = 0.01

// Breaks a paragraph into lines no wider than `maxWidth`. Each line keeps the spaces it ends with,
// so the lines put together give back the paragraph exactly. `width` is told where in the paragraph
// the piece it measures starts, for text whose words look different from each other.
export function wrapParagraph(paragraph: string, maxWidth: number, width: (text: string, start: number) => number): string[] {
  let lineStart = 0
  const fits = (text: string) => width(trimEnd(text), lineStart) <= maxWidth + FIT_SLACK
  const lines: string[] = []
  let line = ''
  const push = (next: string) => {
    lines.push(line)
    lineStart += line.length
    line = next
  }
  for (const piece of wrapPieces(paragraph)) {
    if (fits(line + piece)) {
      line += piece
      continue
    }
    if (line) push('')
    if (fits(piece)) {
      line = piece
      continue
    }
    // A word longer than a whole line wraps between letters.
    for (const letter of graphemes(piece)) {
      if (line && !fits(line + letter)) push(letter)
      else line += letter
    }
  }
  lines.push(line)
  return lines
}

let bidi: ReturnType<typeof bidiFactory> | null = null

// How deep each letter of a paragraph sits in right-to-left and left-to-right reading (odd reads
// right to left), by the Unicode rules.
export function readingLevels(paragraph: string, direction: Direction): Uint8Array {
  bidi ??= bidiFactory()
  return bidi.getEmbeddingLevels(paragraph, direction).levels
}

// The pieces of part of a paragraph, ordered left to right as they appear (Unicode rule L2: from
// the deepest level up, each stretch at that level or deeper is turned around).
export function visualRuns(levels: Uint8Array, from: number, to: number): { start: number; end: number; level: number }[] {
  const runs: { start: number; end: number; level: number }[] = []
  for (let i = from; i < to; i++) {
    const last = runs[runs.length - 1]
    if (last && last.level === levels[i]) last.end = i + 1
    else runs.push({ start: i, end: i + 1, level: levels[i] })
  }
  if (runs.length === 0) return runs
  const highest = Math.max(...runs.map((r) => r.level))
  const odd = runs.map((r) => r.level).filter((l) => l % 2 === 1)
  const lowestOdd = odd.length ? Math.min(...odd) : highest + 1
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level < level) {
        i++
        continue
      }
      let j = i
      while (j < runs.length && runs[j].level >= level) j++
      runs.splice(i, j - i, ...runs.slice(i, j).reverse())
      i = j
    }
  }
  return runs
}

function countSpaces(text: string): number {
  let count = 0
  for (const char of text) if (char === ' ' || char === ' ') count++
  return count
}

// How wide the text from `start` to `end` is, read in the given direction. Text whose words look
// different measures each look on its own; plain text just asks the font.
export type RangeWidth = (start: number, end: number, direction: Direction) => number

export function plainWidth(text: string, measure: TextMeasure): RangeWidth {
  return (start, end, direction) => measure.width(text.slice(start, end), direction)
}

// The Hebrew way of counting with letters, as in lists and chapters: א ב ... י יא ... טו טז ... כ.
export function hebrewNumber(n: number): string {
  if (n <= 0) return String(n)
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת']
  let rest = n % 1000
  let out = ''
  const thousands = Math.floor(n / 1000)
  if (thousands) out += hebrewNumber(thousands) + "'"
  while (rest >= 400) {
    out += 'ת'
    rest -= 400
  }
  out += hundreds[Math.floor(rest / 100)]
  rest %= 100
  // 15 and 16 are written ט״ו and ט״ז, so they don't spell a name of Hashem.
  if (rest === 15 || rest === 16) return out + 'ט' + ones[rest - 9]
  return out + tens[Math.floor(rest / 10)] + ones[rest % 10]
}

// a, b, ... z, aa, ab ... like a spreadsheet's columns.
function latinLetters(n: number): string {
  let out = ''
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) out = String.fromCharCode(97 + ((rest - 1) % 26)) + out
  return out
}

// The marker before the `n`th point of a list. Right to left, letters are Hebrew.
export function listMarker(kind: ListKind, n: number, direction: Direction): string {
  if (kind === 'bullet') return '•'
  if (kind === 'number') return `${n}.`
  return `${direction === 'rtl' ? hebrewNumber(n) : latinLetters(n)}.`
}

// The room kept for markers: as wide as a two-digit one (so it doesn't jump at the tenth point),
// plus a gap before the words.
export function listIndent(kind: ListKind, direction: Direction, measure: TextMeasure, size: number): number {
  const widest = kind === 'bullet' ? '•' : kind === 'number' ? '00.' : direction === 'rtl' ? 'טו.' : 'mm.'
  return Math.max(size * 1.2, measure.width(widest, direction) + listGap(size))
}

function listGap(size: number): number {
  return size * 0.45
}

// A list: the text is laid out in the room left beside the markers, and every paragraph with words
// gets the next marker in front of its first line. Empty paragraphs get none, so a blank line can
// space out the points.
function layoutList(text: string, settings: LayoutSettings, wrapWidth: number | null, measure: TextMeasure, rangeWidth: RangeWidth, start: ListStart): TextLayout {
  const kind = settings.list!
  const direction = mainDirection(text, settings.direction)
  const indent = listIndent(kind, direction, measure, settings.size)
  const inner = layoutText(text, { ...settings, list: null }, wrapWidth === null ? null : Math.max(1, wrapWidth - indent), measure, rangeWidth)
  const shift = direction === 'ltr' ? indent : 0
  const markers: ListMarker[] = []
  let number = start.number
  const lines = inner.lines.map((line, i) => {
    const first = i === 0 ? !start.continued : text[line.start - 1] === '\n'
    const close = text.indexOf('\n', line.start)
    if (first && text.slice(line.start, close === -1 ? text.length : close).trim()) {
      const marker = listMarker(kind, number++, direction)
      const width = measure.width(marker, direction)
      const x = direction === 'ltr' ? indent - listGap(settings.size) - width : inner.width + listGap(settings.size)
      markers.push({ text: marker, x, baseline: line.baseline, line: i, width, direction })
    }
    return { ...line, x: line.x + shift }
  })
  return { ...inner, width: inner.width + indent, lines, indent, markers }
}

// How many points of a list come before `index` in the text, and whether `index` is in the middle
// of a paragraph: where the part of a story shown in a later box starts counting.
export function listStartAt(text: string, index: number): ListStart {
  const before = text.slice(0, index).split('\n')
  const started = before.pop()!
  const continued = index > 0 && text[index - 1] !== '\n'
  // A paragraph that began in the box before got its number there.
  const number = 1 + before.filter((paragraph) => paragraph.trim()).length + (continued && started.trim() ? 1 : 0)
  return { number, continued }
}

// Lays text out. With `wrapWidth`, paragraphs wrap to fit that width; without it, lines only break
// where Enter was pressed, and the text is as wide as its longest line.
export function layoutText(
  text: string,
  settings: LayoutSettings,
  wrapWidth: number | null,
  measure: TextMeasure,
  rangeWidth = plainWidth(text, measure),
  listStart: ListStart = { number: 1, continued: false },
): TextLayout {
  if (settings.list) return layoutList(text, settings, wrapWidth, measure, rangeWidth, listStart)
  const direction = mainDirection(text, settings.direction)
  const lineHeight = settings.size * settings.lineHeight
  const raw: { start: number; full: string; direction: Direction; last: boolean; runs: TextRun[] }[] = []
  let offset = 0
  for (const paragraph of text.split('\n')) {
    // A paragraph with no letters reads like the text as a whole.
    const paragraphDirection = settings.direction === 'auto' ? (firstStrongDirection(paragraph) ?? direction) : settings.direction
    const levels = readingLevels(paragraph, paragraphDirection)
    const at = offset
    const lines = wrapWidth === null ? [paragraph] : wrapParagraph(paragraph, wrapWidth, (t, from) => rangeWidth(at + from, at + from + t.length, paragraphDirection))
    let start = 0
    lines.forEach((full, i) => {
      const end = start + trimEnd(full).length
      const runs = visualRuns(levels, start, end).map((run) => {
        const rtl = run.level % 2 === 1
        return { start: offset + run.start, end: offset + run.end, rtl, width: rangeWidth(offset + run.start, offset + run.end, rtl ? 'rtl' : 'ltr') }
      })
      raw.push({ start: offset + start, full, direction: paragraphDirection, last: i === lines.length - 1, runs })
      start += full.length
    })
    offset += paragraph.length + 1
  }

  const measured = raw.map((line) => {
    const drawn = trimEnd(line.full)
    return { ...line, text: drawn, width: line.runs.reduce((sum, run) => sum + run.width, 0) }
  })
  const width = wrapWidth ?? Math.max(1, ...measured.map((line) => line.width))
  const ascentOffset = measure.baseline?.(lineHeight) ?? (lineHeight - (measure.ascent + measure.descent)) / 2 + measure.ascent

  const lines = measured.map((line, i): LayoutLine => {
    const justify = settings.align === 'justify' && wrapWidth !== null && !line.last
    const spaces = justify ? countSpaces(line.text) : 0
    const align = justify && spaces > 0 ? 'left' : resolveAlign(settings.align, line.direction)
    const x = align === 'right' ? width - line.width : align === 'center' ? (width - line.width) / 2 : 0
    return {
      start: line.start,
      end: line.start + line.text.length,
      text: line.text,
      width: spaces > 0 ? width : line.width,
      x,
      baseline: i * lineHeight + ascentOffset,
      direction: line.direction,
      wordSpacing: spaces > 0 ? (width - line.width) / spaces : 0,
      runs: line.runs,
    }
  })
  return { width, height: Math.max(lineHeight, lines.length * lineHeight), lineHeight, lines, direction }
}

// The place in the text nearest a point (from the top-left of the text), for putting the cursor
// where someone clicked.
export function indexAt(text: string, layout: TextLayout, x: number, y: number, measure: TextMeasure, rangeWidth = plainWidth(text, measure)): number {
  if (layout.lines.length === 0) return 0
  const row = Math.max(0, Math.min(layout.lines.length - 1, Math.floor(y / layout.lineHeight)))
  const line = layout.lines[row]
  let best = line.start
  let bestDistance = Infinity
  let left = line.x
  // Justified lines are stretched; the cursor positions stretch with them.
  const natural = line.runs.reduce((sum, run) => sum + run.width, 0)
  const scale = natural ? line.width / natural : 1
  for (const run of line.runs) {
    const runWidth = run.width * scale
    let index = run.start
    for (const step of [0, ...graphemes(text.slice(run.start, run.end)).map((g) => g.length)]) {
      index += step
      const before = rangeWidth(run.start, index, run.rtl ? 'rtl' : 'ltr') * scale
      const at = run.rtl ? left + runWidth - before : left + before
      const distance = Math.abs(at - x)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    }
    left += runWidth
  }
  return best
}
