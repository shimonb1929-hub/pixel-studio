import { createId, duplicateLayer } from './document.ts'
import { renameStories } from '../text/textFlow.ts'
import type { DesignPage, EditorDocument, Layer } from './types.ts'

// Designs with several pages, like a booklet or a menu. Only the page being worked on is "open":
// its content sits on the design itself, so every tool works on it unchanged. The other pages wait
// in `pages` until they're picked. Each page has its own size: the design's width and height are the
// open page's.

export function pageCount(doc: EditorDocument): number {
  return doc.pages?.length ?? 1
}

export function pageIndex(doc: EditorDocument): number {
  return doc.pages ? (doc.pageIndex ?? 0) : 0
}

function openPage(doc: EditorDocument): DesignPage {
  const id = doc.pages?.[pageIndex(doc)]?.id ?? `${doc.id}-page`
  return { id, width: doc.width, height: doc.height, background: doc.background, pageGradient: doc.pageGradient ?? null, layers: doc.layers, activeLayerId: doc.activeLayerId }
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
  const next: EditorDocument = { ...doc, width: page.width, height: page.height, background: page.background, pageGradient: page.pageGradient ?? null, layers: page.layers, activeLayerId: page.activeLayerId, selection: null }
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

// Copies of a page's layers for another page. Copies keep their names; pixels are copied, since
// painting changes them in place. Text running on from box to box keeps doing so on the copy, as a
// story of its own.
export function copyPageLayers(layers: Layer[]): Layer[] {
  return renameStories(layers.map((layer) => ({ ...duplicateLayer(layer), name: layer.name, locked: layer.locked, ...(layer.kind === 'text' && layer.flow ? { flow: layer.flow } : {}), ...(layer.everyPage ? { everyPage: layer.everyPage } : {}) }) as Layer))
}

// Adds a page after the one being worked on and goes to it: empty with the same page color, or a
// copy of it.
export function addPage(doc: EditorDocument, copy = false): EditorDocument {
  const pages = allPages(doc)
  const index = pageIndex(doc)
  const current = pages[index]
  // Things on every page are on a new page too.
  const shared = current.layers.filter((l) => l.everyPage).map((l): Layer => {
    const { group: _, ...rest } = l
    return { ...rest, id: createId('layer') } as Layer
  })
  let page: DesignPage = { id: createId('page'), width: current.width, height: current.height, background: current.background, pageGradient: current.pageGradient ?? null, layers: shared, activeLayerId: '' }
  if (copy) {
    const layers = copyPageLayers(current.layers)
    const active = current.layers.findIndex((l) => l.id === current.activeLayerId)
    page = { ...page, layers, activeLayerId: layers[active]?.id ?? '' }
  }
  pages.splice(index + 1, 0, page)
  return withPages(doc, pages, index + 1)
}

// Puts new pages right after the one being worked on and goes to the first of them.
export function insertPages(doc: EditorDocument, added: DesignPage[]): EditorDocument {
  if (added.length === 0) return doc
  const pages = allPages(doc)
  const index = pageIndex(doc)
  pages.splice(index + 1, 0, ...added)
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

// A page as a one-page design.
function pageDocument(doc: EditorDocument, page: DesignPage): EditorDocument {
  return { ...doc, pages: undefined, pageIndex: undefined, width: page.width, height: page.height, background: page.background, pageGradient: page.pageGradient ?? null, layers: page.layers, activeLayerId: page.activeLayerId, selection: null }
}

// Whether every page has the same size.
export function pagesSameSize(doc: EditorDocument): boolean {
  return allPages(doc).every((page) => page.width === doc.width && page.height === doc.height)
}

// Runs a change of the whole design (crop, resize, turn) on every page the size of the open one, so
// they all stay the same size. Pages of other sizes (made with Make other sizes) are left as they
// are. `update` gets each page as a one-page design.
export function changeEveryPage(doc: EditorDocument, update: (page: EditorDocument) => EditorDocument): EditorDocument {
  if (!doc.pages) return update(doc)
  const index = pageIndex(doc)
  const results = allPages(doc).map((page, i) => {
    if (i === index) return update({ ...pageDocument(doc, page), selection: doc.selection })
    return page.width === doc.width && page.height === doc.height ? update(pageDocument(doc, page)) : null
  })
  const pages = results.map((r, i): DesignPage => (r ? { id: doc.pages![i].id, width: r.width, height: r.height, background: r.background, pageGradient: r.pageGradient ?? null, layers: r.layers, activeLayerId: r.activeLayerId } : doc.pages![i]))
  const open = results[index]!
  // The open page's result carries everything else the change did to the design (like its size).
  return { ...open, pages, pageIndex: index }
}

// The page holding a layer, or -1.
export function pageOfLayer(doc: EditorDocument, layerId: string): number {
  return allPages(doc).findIndex((page) => page.layers.some((l) => l.id === layerId))
}

// Each page as a one-page design, for downloads and previews.
export function pageDocuments(doc: EditorDocument): EditorDocument[] {
  return allPages(doc).map((page) => pageDocument(doc, page))
}
