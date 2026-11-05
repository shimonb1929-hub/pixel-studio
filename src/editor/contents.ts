import { allPages, pageIndex } from './pages.ts'
import type { DesignPage, EditorDocument, TextLayer } from './types.ts'

// Contents (pro: Table of Contents): a list of the headings in a design with several pages, each
// with the number of its page. Headings are the words clearly bigger than most of the text. Making
// the list again brings it up to date.

export interface Heading {
  text: string
  page: number
}

// Headings are at least this much bigger than most of the words.
const BIGGER = 1.3
const LONGEST = 80

const isText = (l: unknown): l is TextLayer => !!l && (l as TextLayer).kind === 'text'

function texts(page: DesignPage): TextLayer[] {
  return page.layers.filter((l): l is TextLayer => isText(l) && l.visible && !l.pageNumber && !l.contents && l.text.trim().length > 0)
}

// The size most of the words have: the size of the middle letter, all letters in a row.
function usualSize(all: TextLayer[]): number {
  const sizes = all.map((l) => ({ size: l.style.size, count: l.text.length })).sort((a, b) => a.size - b.size)
  const total = sizes.reduce((sum, s) => sum + s.count, 0)
  let seen = 0
  for (const s of sizes) {
    seen += s.count
    if (seen * 2 >= total) return s.size
  }
  return sizes[sizes.length - 1]?.size ?? 0
}

export function headingsOf(doc: EditorDocument): Heading[] {
  const pages = allPages(doc)
  const all = pages.flatMap(texts)
  if (all.length === 0) return []
  const usual = usualSize(all)
  const headings: Heading[] = []
  pages.forEach((page, i) => {
    const big = texts(page)
      .filter((l) => l.style.size >= usual * BIGGER && l.text.trim().length <= LONGEST)
      // Top to bottom, as they're read.
      .sort((a, b) => a.box.cy - Math.abs(a.box.height) / 2 - (b.box.cy - Math.abs(b.box.height) / 2))
    for (const l of big) headings.push({ text: l.text.trim().replace(/\s+/g, ' '), page: i + 1 })
  })
  return headings
}

// One line for each heading: its words, then its page.
export function contentsText(headings: Heading[]): string {
  return headings.map((h) => `${h.text} … ${h.page}`).join('\n')
}

// Where the contents list already is: its page and id.
export function findContents(doc: EditorDocument): { page: number; id: string } | null {
  const pages = allPages(doc)
  for (let i = 0; i < pages.length; i++) {
    const found = pages[i].layers.find((l) => isText(l) && l.contents)
    if (found) return { page: i, id: found.id }
  }
  return null
}

// The design with the list's text changed on whichever page it is on.
export function updateContents(doc: EditorDocument, change: (layer: TextLayer) => TextLayer): EditorDocument {
  const at = findContents(doc)
  if (!at) return doc
  const swap = (layers: DesignPage['layers']) => layers.map((l) => (l.id === at.id && isText(l) ? change(l) : l))
  if (at.page === pageIndex(doc) || !doc.pages) return { ...doc, layers: swap(doc.layers) }
  return { ...doc, pages: doc.pages.map((page, i) => (i === at.page ? { ...page, layers: swap(page.layers) } : page)) }
}
