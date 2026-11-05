import { replaceSpans } from '../text/spans.ts'
import { changeStories, reflowText } from '../text/textFlow.ts'
import { changeText, textName } from '../text/textLayer.ts'
import { allPages, pageIndex } from './pages.ts'
import { fitTable } from './table.ts'
import type { DesignPage, EditorDocument, Layer, TextSpan, TextStyle } from './types.ts'

// Find and change (pro: Find/Change): finds words in every text, every box a story runs through and
// every table cell, on every page, and changes them all at once. Hebrew, Yiddish and English words
// are all found the same way; words with their own look keep it.

export interface FindOptions {
  // Only words with the same capital letters ("Apple" but not "apple").
  matchCase: boolean
  // Only whole words: "art" finds "art" but not "party".
  wholeWords: boolean
}

// A letter, a vowel point or a number: what words are made of, in every language.
const WORD = '[\\p{L}\\p{M}\\p{N}]'

// The pattern that finds the words, or null when there is nothing to find.
export function findPattern(query: string, options: FindOptions): RegExp | null {
  if (!query) return null
  const plain = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const source = options.wholeWords ? `(?<!${WORD})${plain}(?!${WORD})` : plain
  return new RegExp(source, options.matchCase ? 'gu' : 'giu')
}

// Where the words are in one text.
export function findIn(text: string, pattern: RegExp): { start: number; end: number }[] {
  return [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }))
}

// The text with every found word changed, and the looks moved along with the letters.
export function replaceIn(text: string, spans: TextSpan[] | undefined, style: TextStyle, pattern: RegExp, replacement: string): { text: string; spans?: TextSpan[]; count: number } | null {
  const found = findIn(text, pattern)
  if (found.length === 0) return null
  let next = ''
  let at = 0
  for (const { start, end } of found) {
    next += text.slice(at, start) + replacement
    at = end
  }
  next += text.slice(at)
  const moved = replaceSpans(spans, style, text.length, found.map(({ start, end }) => ({ start, end, length: replacement.length })))
  return { text: next, ...(moved ? { spans: moved } : {}), count: found.length }
}

// What can be searched on a page: plain texts, each story once, and every table cell. Page numbers
// count themselves, so they're left alone.
function pageTexts(layers: Layer[]): string[] {
  const texts: string[] = []
  const stories = new Set<string>()
  for (const layer of layers) {
    if (layer.kind === 'text' && !layer.pageNumber) {
      if (!layer.flow) texts.push(layer.text)
      else if (!stories.has(layer.flow.story)) {
        stories.add(layer.flow.story)
        texts.push(layer.flow.full)
      }
    } else if (layer.kind === 'table') texts.push(...layer.cells.flat())
  }
  return texts
}

export interface FindResult {
  count: number
  // Which pages have them (0 is the first page).
  pages: number[]
}

// How many times the words are found, and on which pages.
export function countFound(doc: EditorDocument, query: string, options: FindOptions): FindResult {
  const pattern = findPattern(query, options)
  if (!pattern) return { count: 0, pages: [] }
  let count = 0
  const pages: number[] = []
  allPages(doc).forEach((page, i) => {
    const here = pageTexts(page.layers).reduce((sum, text) => sum + findIn(text, pattern).length, 0)
    if (here > 0) pages.push(i)
    count += here
  })
  return { count, pages }
}

function changeLayers(layers: Layer[], pattern: RegExp, replacement: string): { layers: Layer[]; count: number } {
  let count = 0
  const changed = layers.map((layer): Layer => {
    if (layer.kind === 'text' && !layer.flow && !layer.pageNumber) {
      const result = replaceIn(layer.text, layer.spans, layer.style, pattern, replacement)
      if (!result) return layer
      count += result.count
      const next = changeText(layer, { text: result.text, spans: result.spans })
      // A text named after its words keeps being named after them.
      return layer.name === textName(layer.text) ? { ...next, name: textName(result.text) } : next
    }
    if (layer.kind === 'table') {
      let here = 0
      const cells = layer.cells.map((row) =>
        row.map((cell) => {
          const found = findIn(cell, pattern).length
          if (found === 0) return cell
          here += found
          return cell.replace(pattern, () => replacement)
        }),
      )
      if (here === 0) return layer
      count += here
      return fitTable({ ...layer, cells })
    }
    return layer
  })
  const flowed = changeStories(changed, (text, spans, style) => {
    const result = replaceIn(text, spans, style, pattern, replacement)
    if (!result) return null
    count += result.count
    return result
  })
  return { layers: flowed, count }
}

// Every found word, on every page, changed to `replacement`, and how many were changed. Returns the
// same design when nothing was found.
export function replaceEverywhere(doc: EditorDocument, query: string, replacement: string, options: FindOptions): { doc: EditorDocument; count: number } {
  const pattern = findPattern(query, options)
  if (!pattern) return { doc, count: 0 }
  let count = 0
  const fix = (layers: Layer[], width: number, height: number): Layer[] => {
    const result = changeLayers(layers, pattern, replacement)
    if (result.count === 0) return layers
    count += result.count
    // Stories running through several boxes share their words out again.
    return reflowText({ ...doc, width, height, layers: result.layers }).layers
  }
  if (!doc.pages) {
    const layers = fix(doc.layers, doc.width, doc.height)
    return count ? { doc: { ...doc, layers }, count } : { doc, count: 0 }
  }
  const open = pageIndex(doc)
  const pages = allPages(doc).map((page): DesignPage => {
    const layers = fix(page.layers, page.width, page.height)
    return layers === page.layers ? page : { ...page, layers }
  })
  if (count === 0) return { doc, count: 0 }
  return { doc: { ...doc, layers: pages[open].layers, pages: pages.map((p, i) => (i === open ? doc.pages![i] : p)) }, count }
}
