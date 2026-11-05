import { createId } from './document.ts'
import { fitText } from '../text/textLayer.ts'
import type { EditorDocument, Layer, ShapeLayer, TextLayer } from './types.ts'

// Linked copies (pro: Symbols): copies that stay the same. Change how one looks (its color, its
// shape, its words) and every linked copy changes with it. Each copy keeps its own place, size and
// turn, so the same star or label can be used all over a design and changed once.
// Shapes and words can be linked; photos and drawings are copied as ordinary copies.

export function canLink(layer: Layer): layer is ShapeLayer | TextLayer {
  if (layer.kind === 'shape') return true
  return layer.kind === 'text' && !layer.flow && !layer.along && !layer.pageNumber
}

export function isLinked(layer: Layer): boolean {
  return !!layer.linked
}

// Everything each copy keeps for itself; all the rest is shared.
const OWN = new Set(['id', 'name', 'group', 'box', 'visible', 'locked', 'everyPage', 'linked', 'hide', 'avoid', 'textWrap'])

function look(layer: Layer): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(layer)) if (!OWN.has(key)) out[key] = value
  // A text's size is its own, like a shape's size.
  if (layer.kind === 'text') out.style = { ...layer.style, size: 0 }
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function sameLook(a: Layer, b: Layer): boolean {
  return a.kind === b.kind && sameValue(look(a), look(b))
}

// `copy` made to look like `from`, keeping its own place, size, turn and the rest of its own.
function lookLike(copy: Layer, from: Layer): Layer {
  const own: Record<string, unknown> = {}
  for (const key of OWN) if (key in copy) own[key] = (copy as unknown as Record<string, unknown>)[key]
  const shared = look(from)
  const next = { ...shared, ...own } as unknown as Layer
  if (next.kind === 'text' && copy.kind === 'text' && from.kind === 'text') {
    next.style = { ...from.style, size: copy.style.size }
    if (!next.spans) delete next.spans
    return fitText(next)
  }
  return next
}

// After a change: a linked copy that now looks different passes its new look to the others it is
// linked with, on the open page. Returns the same design when nothing needs to change.
export function syncLinked(before: EditorDocument, after: EditorDocument): EditorDocument {
  if (!after.layers.some(isLinked)) return after
  const old = new Map(before.layers.map((l) => [l.id, l]))
  const leaders = new Map<string, Layer>()
  for (const layer of after.layers) {
    if (!layer.linked || leaders.has(layer.linked)) continue
    const was = old.get(layer.id)
    if (was && was !== layer && !sameLook(was, layer)) leaders.set(layer.linked, layer)
  }
  if (leaders.size === 0) return after
  let changed = false
  const layers = after.layers.map((l) => {
    const leader = l.linked ? leaders.get(l.linked) : undefined
    if (!leader || leader === l || sameLook(leader, l)) return l
    changed = true
    return lookLike(l, leader)
  })
  return changed ? { ...after, layers } : after
}

// Links copies to the things they were made from: each original and its copies get one link.
// `copiesOf` lists, for each original's id, the ids of its copies.
export function linkCopies(doc: EditorDocument, copiesOf: Map<string, string[]>): EditorDocument {
  const links = new Map<string, string>()
  for (const [original, copies] of copiesOf) {
    const layer = doc.layers.find((l) => l.id === original)
    if (!layer || !canLink(layer)) continue
    const link = layer.linked ?? createId('link')
    links.set(original, link)
    for (const id of copies) links.set(id, link)
  }
  if (links.size === 0) return doc
  return { ...doc, layers: doc.layers.map((l) => (links.has(l.id) ? { ...l, linked: links.get(l.id) } : l)) }
}

// Makes the chosen things their own again: changing them no longer changes the others.
export function unlink(doc: EditorDocument, ids: string[]): EditorDocument {
  let changed = false
  const layers = doc.layers.map((l) => {
    if (!ids.includes(l.id) || !l.linked) return l
    changed = true
    const { linked: _, ...rest } = l
    return rest as Layer
  })
  if (!changed) return doc
  // A link left with only one thing in it is no link at all.
  const counts = new Map<string, number>()
  for (const l of layers) if (l.linked) counts.set(l.linked, (counts.get(l.linked) ?? 0) + 1)
  return {
    ...doc,
    layers: layers.map((l) => {
      if (!l.linked || (counts.get(l.linked) ?? 0) > 1) return l
      const { linked: _, ...rest } = l
      return rest as Layer
    }),
  }
}

// How many things on the open page share this one's link, itself included.
export function linkedCount(doc: EditorDocument, layer: Layer): number {
  if (!layer.linked) return 0
  return doc.layers.filter((l) => l.linked === layer.linked).length
}
