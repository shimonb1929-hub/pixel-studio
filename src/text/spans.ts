import type { SpanStyle, TextSpan, TextStyle } from '../editor/types.ts'

// Words that look different from the rest of their text. A text keeps one main style; spans list
// only the letters that differ and how. They're worked on letter by letter (texts are short), and
// always kept tidy: in order, never overlapping, never empty, and saying only what really differs.

const KEYS = ['font', 'weight', 'italic', 'color'] as const

// Each letter's own differences from the main style, one entry per letter.
function perLetter(spans: TextSpan[] | undefined, length: number): SpanStyle[] {
  const letters: SpanStyle[] = Array.from({ length }, () => ({}))
  for (const span of spans ?? []) {
    for (let i = Math.max(0, span.start); i < Math.min(length, span.end); i++) letters[i] = { ...letters[i], ...span.style }
  }
  return letters
}

// Only what differs from the main style.
function differences(style: SpanStyle, base: TextStyle): SpanStyle {
  const kept: SpanStyle = {}
  for (const key of KEYS) {
    const value = style[key]
    if (value === undefined) continue
    const same = key === 'color' ? String(value).toLowerCase() === base.color.toLowerCase() : value === base[key]
    if (!same) (kept as Record<string, unknown>)[key] = value
  }
  return kept
}

function sameStyle(a: SpanStyle, b: SpanStyle): boolean {
  return KEYS.every((key) => a[key] === b[key])
}

function fromLetters(letters: SpanStyle[], base: TextStyle): TextSpan[] | undefined {
  const spans: TextSpan[] = []
  letters.forEach((letter, i) => {
    const style = differences(letter, base)
    if (Object.keys(style).length === 0) return
    const last = spans[spans.length - 1]
    if (last && last.end === i && sameStyle(last.style, style)) last.end = i + 1
    else spans.push({ start: i, end: i + 1, style })
  })
  return spans.length ? spans : undefined
}

// The spans tidied for a text of this length and main style (after the main style changed, a
// span that now says the same as the main style is dropped).
export function tidySpans(spans: TextSpan[] | undefined, base: TextStyle, length: number): TextSpan[] | undefined {
  if (!spans?.length) return undefined
  return fromLetters(perLetter(spans, length), base)
}

// Gives the letters from `start` to `end` a different look.
export function styleRange(spans: TextSpan[] | undefined, base: TextStyle, length: number, start: number, end: number, patch: SpanStyle): TextSpan[] | undefined {
  const letters = perLetter(spans, length)
  for (let i = Math.max(0, start); i < Math.min(length, end); i++) letters[i] = { ...letters[i], ...patch }
  return fromLetters(letters, base)
}

// Keeps spans on the same letters after typing changed the text from `before` to `after`. Letters
// typed in the middle of a styled word look like the letter before them, as in any word processor;
// `typed` gives them a look of their own instead (a style picked with nothing selected).
export function editSpans(spans: TextSpan[] | undefined, base: TextStyle, before: string, after: string, typed?: SpanStyle): TextSpan[] | undefined {
  if (!spans?.length && !typed) return undefined
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++
  const letters = perLetter(spans, before.length)
  const inserted = after.length - head - tail
  // A new letter at the very start takes the first letter's look.
  const like = typed ?? (head > 0 ? letters[head - 1] : (letters[head + (before.length - head - tail)] ?? {}))
  const next = [...letters.slice(0, head), ...Array.from({ length: inserted }, () => ({ ...like })), ...letters.slice(before.length - tail)]
  return fromLetters(next, base)
}

// The full look of one letter.
export function styleAt(spans: TextSpan[] | undefined, base: TextStyle, index: number): TextStyle {
  for (const span of spans ?? []) if (index >= span.start && index < span.end) return { ...base, ...span.style }
  return base
}

// The stretch from `from` to `to` cut where the look changes, each piece with its full look.
export function styledPieces(spans: TextSpan[] | undefined, base: TextStyle, from: number, to: number): { start: number; end: number; style: TextStyle }[] {
  if (!spans?.length) return from < to ? [{ start: from, end: to, style: base }] : []
  const pieces: { start: number; end: number; style: TextStyle }[] = []
  let at = from
  for (const span of spans) {
    if (span.end <= at) continue
    if (span.start >= to) break
    if (span.start > at) pieces.push({ start: at, end: span.start, style: base })
    const end = Math.min(to, span.end)
    pieces.push({ start: Math.max(at, span.start), end, style: { ...base, ...span.style } })
    at = end
  }
  if (at < to) pieces.push({ start: at, end: to, style: base })
  return pieces
}

// The look shared by every letter from `start` to `end`: each setting is the letters' common value,
// or undefined where they differ (the Text panel shows that as "mixed").
export function sharedStyle(spans: TextSpan[] | undefined, base: TextStyle, start: number, end: number): SpanStyle {
  const pieces = styledPieces(spans, base, start, Math.max(end, start + 1))
  const shared: SpanStyle = {}
  for (const key of KEYS) {
    const values = new Set(pieces.map((p) => p.style[key]))
    if (values.size === 1) (shared as Record<string, unknown>)[key] = [...values][0]
  }
  return shared
}
