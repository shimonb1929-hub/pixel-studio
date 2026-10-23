import { createId } from './document.ts'
import { pageIndex } from './pages.ts'
import { changeText } from '../text/textLayer.ts'
import type { EditorDocument, Layer } from './types.ts'

// Things on every page, like a logo, a heading at the top or page numbers. Each page has its own
// copy, so every tool works on it as usual; whatever is done to the copy on the open page is done to
// all of them. Taking it off the open page takes it off every page.

export function onEveryPage(layer: Layer): boolean {
  return !!layer.everyPage
}

// Whether a layer could go on every page. Text running on from box to box stays on its own page.
export function canBeOnEveryPage(layer: Layer): boolean {
  return !(layer.kind === 'text' && layer.flow)
}

// A page number shows the number of the page it's on.
function numbered(layer: Layer, number: number): Layer {
  if (layer.kind !== 'text' || !layer.pageNumber) return layer
  const text = String(number)
  return layer.text === text ? layer : changeText(layer, { text })
}

// The same, apart from things that are each copy's own. Boxes are compared by value, since a page
// number's box is worked out again for every copy.
function sameCopy(a: Layer, b: Layer): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'id' || key === 'group') continue
    const x = (a as unknown as Record<string, unknown>)[key]
    const y = (b as unknown as Record<string, unknown>)[key]
    if (x === y) continue
    if (key === 'box' && x && y) {
      const p = x as Record<string, number>
      const q = y as Record<string, number>
      if (p.cx === q.cx && p.cy === q.cy && p.width === q.width && p.height === q.height && p.rotation === q.rotation) continue
    }
    return false
  }
  return true
}

// A copy of `source` for a page, keeping the copy's own id and grouping.
function copyFor(source: Layer, copy: Layer | null, number: number): Layer {
  const { group: _, ...rest } = source
  const next = { ...rest, id: copy?.id ?? createId('layer') } as Layer
  if (copy?.group) next.group = copy.group
  return numbered(next, number)
}

// Brings every page in line with the open one: its things-on-every-page are copied to the other
// pages (added on top where missing, removed where the open page no longer has them), and page
// numbers show their own page. Returns the same design when nothing changes.
export function syncEveryPage(doc: EditorDocument): EditorDocument {
  const index = pageIndex(doc)
  const pages = doc.pages
  const source = doc.layers.filter(onEveryPage)
  const anywhere = source.length > 0 || !!pages?.some((page, i) => i !== index && page.layers.some(onEveryPage))
  if (!anywhere) return doc

  let changed = false
  const own = (layers: Layer[], number: number) => {
    let mine = false
    const next = layers.map((l) => {
      const n = numbered(l, number)
      if (n !== l) mine = true
      return n
    })
    return mine ? next : layers
  }

  const layers = own(doc.layers, index + 1)
  if (layers !== doc.layers) changed = true
  if (!pages) return changed ? { ...doc, layers } : doc

  const links = new Map(source.map((l) => [l.everyPage!, l]))
  const nextPages = pages.map((page, i) => {
    if (i === index) return page
    let pageChanged = false
    const seen = new Set<string>()
    const kept = page.layers.flatMap((l): Layer[] => {
      if (!l.everyPage) return [l]
      const from = links.get(l.everyPage)
      if (!from || seen.has(l.everyPage)) {
        pageChanged = true
        return []
      }
      seen.add(l.everyPage)
      const copy = copyFor(from, l, i + 1)
      if (sameCopy(copy, l)) return [l]
      pageChanged = true
      return [copy]
    })
    for (const [link, from] of links) {
      if (seen.has(link)) continue
      kept.push(copyFor(from, null, i + 1))
      pageChanged = true
    }
    if (!pageChanged) return page
    changed = true
    const activeLayerId = kept.some((l) => l.id === page.activeLayerId) ? page.activeLayerId : (kept.at(-1)?.id ?? '')
    return { ...page, layers: kept, activeLayerId }
  })
  return changed ? { ...doc, layers, pages: nextPages } : doc
}

// Puts things on every page, or keeps them only on this one.
export function setOnEveryPage(doc: EditorDocument, ids: string[], on: boolean): EditorDocument {
  let changed = false
  const layers = doc.layers.map((l) => {
    if (!ids.includes(l.id) || onEveryPage(l) === on || (on && !canBeOnEveryPage(l))) return l
    changed = true
    if (on) return { ...l, everyPage: createId('every') }
    const { everyPage: _, ...rest } = l
    // Off every page, a page number is ordinary text again.
    if (rest.kind === 'text' && rest.pageNumber) {
      const { pageNumber: __, ...text } = rest
      return text
    }
    return rest as Layer
  })
  return changed ? { ...doc, layers } : doc
}

export function hasPageNumbers(doc: EditorDocument): boolean {
  return doc.layers.some((l) => l.kind === 'text' && l.pageNumber)
}
