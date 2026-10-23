import { createId, duplicateLayer } from './document.ts'
import type { DesignPage, EditorDocument } from './types.ts'

// Designs with several pages, like a booklet or a menu. Only the page being worked on is "open":
// its content sits on the design itself, so every tool works on it unchanged. The other pages wait
// in `pages` until they're picked.

export function pageCount(doc: EditorDocument): number {
  return doc.pages?.length ?? 1
}

export function pageIndex(doc: EditorDocument): number {
  return doc.pages ? (doc.pageIndex ?? 0) : 0
}

function openPage(doc: EditorDocument): DesignPage {
  const id = doc.pages?.[pageIndex(doc)]?.id ?? `${doc.id}-page`
  return { id, background: doc.background, layers: doc.layers, activeLayerId: doc.activeLayerId }
}

// Every page as it is now, in order.
export function allPages(doc: EditorDocument): DesignPage[] {
  if (!doc.pages) return [openPage(doc)]
  const index = pageIndex(doc)
  return doc.pages.map((page, i) => (i === index ? openPage(doc) : page))
}

// The design showing `pages[index]`, or a plain one-page design when only one page is left.
function withPages(doc: EditorDocument, pages: DesignPage[], index: number): EditorDocument {
  const page = pages[index]
  // A selection belongs to the page it was made on.
  const next: EditorDocument = { ...doc, background: page.background, layers: page.layers, activeLayerId: page.activeLayerId, selection: null }
  if (pages.length === 1) {
    delete next.pages
    delete next.pageIndex
    return next
  }
  return { ...next, pages, pageIndex: index }
}

export function goToPage(doc: EditorDocument, index: number): EditorDocument {
  if (index === pageIndex(doc) || index < 0 || index >= pageCount(doc)) return doc
  return withPages(doc, allPages(doc), index)
}

// Adds a page after the one being worked on and goes to it: empty with the same page color, or a
// copy of it.
export function addPage(doc: EditorDocument, copy = false): EditorDocument {
  const pages = allPages(doc)
  const index = pageIndex(doc)
  const current = pages[index]
  let page: DesignPage = { id: createId('page'), background: current.background, layers: [], activeLayerId: '' }
  if (copy) {
    // Copies keep their names; pixels are copied, since painting changes them in place.
    const layers = current.layers.map((layer) => ({ ...duplicateLayer(layer), name: layer.name, locked: layer.locked }))
    const active = current.layers.findIndex((l) => l.id === current.activeLayerId)
    page = { ...page, layers, activeLayerId: layers[active]?.id ?? '' }
  }
  pages.splice(index + 1, 0, page)
  return withPages(doc, pages, index + 1)
}

export function removePage(doc: EditorDocument): EditorDocument {
  const pages = allPages(doc)
  if (pages.length < 2) return doc
  const index = pageIndex(doc)
  pages.splice(index, 1)
  return withPages(doc, pages, Math.min(index, pages.length - 1))
}

// Moves the page being worked on one place earlier (-1) or later (1).
export function movePage(doc: EditorDocument, direction: 1 | -1): EditorDocument {
  const pages = allPages(doc)
  const index = pageIndex(doc)
  const target = index + direction
  if (target < 0 || target >= pages.length) return doc
  ;[pages[index], pages[target]] = [pages[target], pages[index]]
  return withPages(doc, pages, target)
}

// Runs a change of the whole design (crop, resize, turn) on every page, so they all stay the same
// size. `update` gets each page as a one-page design.
export function changeEveryPage(doc: EditorDocument, update: (page: EditorDocument) => EditorDocument): EditorDocument {
  if (!doc.pages) return update(doc)
  const index = pageIndex(doc)
  const single = (page: DesignPage): EditorDocument => ({ ...doc, pages: undefined, pageIndex: undefined, background: page.background, layers: page.layers, activeLayerId: page.activeLayerId, selection: null })
  const results = allPages(doc).map((page, i) => update(i === index ? { ...single(page), selection: doc.selection } : single(page)))
  const pages = results.map((r, i): DesignPage => ({ id: doc.pages![i].id, background: r.background, layers: r.layers, activeLayerId: r.activeLayerId }))
  const open = results[index]
  return { ...doc, width: open.width, height: open.height, selection: open.selection, background: open.background, layers: open.layers, activeLayerId: open.activeLayerId, pages, pageIndex: index }
}

// The page holding a layer, or -1.
export function pageOfLayer(doc: EditorDocument, layerId: string): number {
  return allPages(doc).findIndex((page) => page.layers.some((l) => l.id === layerId))
}

// Each page as a one-page design, for downloads and previews.
export function pageDocuments(doc: EditorDocument): EditorDocument[] {
  return allPages(doc).map((page) => ({ ...doc, pages: undefined, pageIndex: undefined, background: page.background, layers: page.layers, activeLayerId: page.activeLayerId, selection: null }))
}
