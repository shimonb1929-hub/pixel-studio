import type { EditorDocument, Layer, LayerGroup, PixelLayer, ShapeLayer } from './types.ts'
import { t } from '../i18n/i18n.ts'

// Small, pure steps for changing the layer stack. Each returns a new document and leaves the
// old one untouched, which is what makes undo simple.

export function activeLayer(doc: EditorDocument): Layer | undefined {
  return doc.layers.find((layer) => layer.id === doc.activeLayerId)
}

// "Drawing 4" when the highest numbered drawing so far is "Drawing 3".
export function nextLayerName(layers: Layer[]): string {
  const highest = layers.reduce((max, layer) => {
    const match = /^Drawing (\d+)$/.exec(layer.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `Drawing ${highest + 1}`
}

// Puts a layer just above the active one (above its whole group, if it's in one; on top of
// everything when the page is picked) and makes it active.
export function insertLayerAboveActive(doc: EditorDocument, layer: Layer): EditorDocument {
  let index = doc.layers.findIndex((l) => l.id === doc.activeLayerId)
  const group = doc.layers[index]?.group?.id
  while (group && doc.layers[index + 1]?.group?.id === group) index++
  const layers = [...doc.layers]
  layers.splice(index === -1 ? layers.length : index + 1, 0, layer)
  return { ...doc, layers, activeLayerId: layer.id }
}

export function removeLayer(doc: EditorDocument, layerId: string): EditorDocument {
  return removeLayers(doc, [layerId])
}

// Removes several layers. The one below the lowest removed takes over, or the page.
export function removeLayers(doc: EditorDocument, ids: string[]): EditorDocument {
  const gone = new Set(ids)
  const lowest = doc.layers.findIndex((l) => gone.has(l.id))
  if (lowest === -1) return doc
  const layers = doc.layers.filter((l) => !gone.has(l.id))
  const activeLayerId = gone.has(doc.activeLayerId) ? (layers[Math.max(0, lowest - 1)]?.id ?? '') : doc.activeLayerId
  return tidyGroups({ ...doc, layers, activeLayerId })
}

// The layers in a group, bottom first.
export function groupMembers(doc: EditorDocument, groupId: string): Layer[] {
  return doc.layers.filter((l) => l.group?.id === groupId)
}

// What picking a layer picks: its whole group, or just it.
export function pickedWith(doc: EditorDocument, layerId: string): string[] {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (!layer) return []
  return layer.group ? groupMembers(doc, layer.group.id).map((l) => l.id) : [layer.id]
}

// A group needs at least two layers, next to each other in the stack; anything else is let go.
export function tidyGroups(doc: EditorDocument): EditorDocument {
  const runs = new Map<string, number>()
  const counts = new Map<string, number>()
  doc.layers.forEach((layer, i) => {
    const id = layer.group?.id
    if (!id) return
    counts.set(id, (counts.get(id) ?? 0) + 1)
    if (doc.layers[i - 1]?.group?.id !== id) runs.set(id, (runs.get(id) ?? 0) + 1)
  })
  const broken = new Set([...counts].filter(([id, count]) => count < 2 || (runs.get(id) ?? 0) > 1).map(([id]) => id))
  if (broken.size === 0) return doc
  return { ...doc, layers: doc.layers.map((l) => (l.group && broken.has(l.group.id) ? withoutGroup(l) : l)) }
}

function withoutGroup(layer: Layer): Layer {
  const copy = { ...layer }
  delete copy.group
  return copy
}

// Keeps layers together: they get one group, and move next to each other in the stack, where the
// highest of them was, in the same order.
export function keepTogether(doc: EditorDocument, ids: string[], group: LayerGroup): EditorDocument {
  const chosen = new Set(ids)
  const top = doc.layers.reduce((found, l, i) => (chosen.has(l.id) ? i : found), -1)
  if (top === -1) return doc
  const block = doc.layers.filter((l) => chosen.has(l.id)).map((l) => ({ ...l, group }))
  const rest = doc.layers.filter((l) => !chosen.has(l.id))
  const below = doc.layers.slice(0, top).filter((l) => !chosen.has(l.id)).length
  const layers = [...rest.slice(0, below), ...block, ...rest.slice(below)]
  return tidyGroups({ ...doc, layers, activeLayerId: block[block.length - 1].id })
}

// Lets the layers of a group go their own ways again.
export function takeApart(doc: EditorDocument, groupId: string): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.group?.id === groupId ? withoutGroup(l) : l)) }
}

// Copies the chosen layers (made by `copy`) and puts the copies right above them, picked. Copied
// groups become new groups (`regroup` names them). Copies of part of a group, picked inside it,
// stay in that group.
export function duplicateLayers(doc: EditorDocument, ids: string[], copy: (layer: Layer) => Layer, regroup: (group: LayerGroup) => LayerGroup): EditorDocument {
  const chosen = doc.layers.filter((l) => ids.includes(l.id))
  if (chosen.length === 0) return doc
  const whole = (groupId: string) => groupMembers(doc, groupId).every((m) => ids.includes(m.id))
  const firstGroup = chosen[0].group?.id
  const inside = firstGroup !== undefined && !whole(firstGroup) && chosen.every((l) => l.group?.id === firstGroup)
  const groups = new Map<string, LayerGroup>()
  const copies = chosen.map((layer) => {
    const made = copy(layer)
    if (inside) return made
    const group = layer.group
    if (!group || !whole(group.id)) return withoutGroup(made)
    if (!groups.has(group.id)) groups.set(group.id, regroup(group))
    return { ...made, group: groups.get(group.id) }
  })
  let index = doc.layers.indexOf(chosen[chosen.length - 1])
  const block = doc.layers[index].group?.id
  while (!inside && block && doc.layers[index + 1]?.group?.id === block) index++
  const layers = [...doc.layers]
  layers.splice(index + 1, 0, ...copies)
  return tidyGroups({ ...doc, layers, activeLayerId: copies[copies.length - 1].id })
}

// Moves the chosen layers one step toward the front (1) or the back (-1), keeping their order. A
// whole group moves as one, past whole groups; when only part of a group is chosen, it moves
// inside its group.
export function moveLayersBy(doc: EditorDocument, ids: string[], direction: 1 | -1): EditorDocument {
  const chosen = new Set(ids)
  const partly = new Set<string>()
  for (const layer of doc.layers) {
    const id = layer.group?.id
    if (id && chosen.has(layer.id) && groupMembers(doc, id).some((m) => !chosen.has(m.id))) partly.add(id)
  }
  // Runs of layers that move as one.
  const units: Layer[][] = []
  for (const layer of doc.layers) {
    const id = layer.group?.id
    const last = units[units.length - 1]
    if (last && id && !partly.has(id) && last[0].group?.id === id) last.push(layer)
    else units.push([layer])
  }
  const isChosen = (unit: Layer[]) => unit.some((l) => chosen.has(l.id))
  const order = direction > 0 ? [...units.keys()].reverse() : [...units.keys()]
  let changed = false
  for (const i of order) {
    const j = i + direction
    if (!isChosen(units[i]) || j < 0 || j >= units.length || isChosen(units[j])) continue
    const inside = units[i][0].group && partly.has(units[i][0].group.id)
    if (inside && units[j][0].group?.id !== units[i][0].group!.id) continue
    ;[units[i], units[j]] = [units[j], units[i]]
    changed = true
  }
  return changed ? { ...doc, layers: units.flat() } : doc
}

// Moves the chosen layers all the way to the front or the back (inside their group, if only part
// of one is chosen).
export function moveLayersTo(doc: EditorDocument, ids: string[], end: 'front' | 'back'): EditorDocument {
  let current = doc
  for (let step = 0; step < doc.layers.length; step++) {
    const next = moveLayersBy(current, ids, end === 'front' ? 1 : -1)
    if (next === current) break
    current = next
  }
  return current
}

// Moves a layer all the way to the front (top) or the back (bottom).
export function moveLayerTo(doc: EditorDocument, layerId: string, end: 'front' | 'back'): EditorDocument {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (!layer) return doc
  const rest = doc.layers.filter((l) => l.id !== layerId)
  const layers = end === 'front' ? [...rest, layer] : [layer, ...rest]
  if (layers.every((l, i) => l === doc.layers[i])) return doc
  return { ...doc, layers }
}

// direction 1 moves the layer up (toward the front), -1 moves it down.
export function moveLayer(doc: EditorDocument, layerId: string, direction: 1 | -1): EditorDocument {
  const index = doc.layers.findIndex((l) => l.id === layerId)
  const target = index + direction
  if (index === -1 || target < 0 || target >= doc.layers.length) return doc
  const layers = [...doc.layers]
  ;[layers[index], layers[target]] = [layers[target], layers[index]]
  return { ...doc, layers }
}

// Settings every kind of layer has.
type CommonPatch = Partial<Pick<Layer, 'name' | 'visible' | 'opacity' | 'locked' | 'adjust' | 'effects' | 'blend'>>

export function updateLayer(doc: EditorDocument, layerId: string, patch: CommonPatch): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
}

// Changes a pixel layer; other kinds are left alone.
export function updatePixelLayer(doc: EditorDocument, layerId: string, patch: Partial<Omit<PixelLayer, 'id' | 'kind'>>): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId && l.kind === 'raster' ? { ...l, ...patch } : l)) }
}

// Changes a shape; other kinds are left alone.
export function updateShape(doc: EditorDocument, layerId: string, patch: Partial<Omit<ShapeLayer, 'id' | 'kind'>>): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId && l.kind === 'shape' ? { ...l, ...patch } : l)) }
}

// Puts a changed copy of a layer in place of the one with the same id.
export function replaceLayer(doc: EditorDocument, layer: Layer): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? layer : l)) }
}

// Picks a layer, or the page with an empty id.
export function selectLayer(doc: EditorDocument, layerId: string): EditorDocument {
  if (layerId === '') return doc.activeLayerId === '' ? doc : { ...doc, activeLayerId: '' }
  return doc.layers.some((l) => l.id === layerId) ? { ...doc, activeLayerId: layerId } : doc
}

// Moves the chosen layers (dragged in the Layers list) to just above or just below the target layers,
// gathered together in their order. Whole groups move as one and are never split; when only part of
// a group is chosen, it moves inside its group, step by step.
export function moveLayersNextTo(doc: EditorDocument, ids: string[], targetIds: string[], side: 'above' | 'below'): EditorDocument {
  const chosen = new Set(ids)
  const target = new Set(targetIds.filter((id) => !chosen.has(id)))
  if (chosen.size === 0 || target.size === 0) return doc
  const partly = doc.layers.some((l) => l.group && chosen.has(l.id) && groupMembers(doc, l.group.id).some((m) => !chosen.has(m.id)))
  if (partly) return stepNextTo(doc, ids, target, side)
  // Runs of layers that move as one: a whole group, or a single layer.
  const units: Layer[][] = []
  for (const layer of doc.layers) {
    const last = units[units.length - 1]
    if (last && layer.group && last[0].group?.id === layer.group.id) last.push(layer)
    else units.push([layer])
  }
  const moving = units.filter((u) => u.some((l) => chosen.has(l.id)))
  const rest = units.filter((u) => !moving.includes(u))
  const at = rest.findIndex((u) => u.some((l) => target.has(l.id)))
  if (at === -1) return doc
  // The highest target unit for above, the lowest for below.
  let index = at
  if (side === 'above') while (rest[index + 1]?.some((l) => target.has(l.id))) index++
  const placed = side === 'above' ? [...rest.slice(0, index + 1), ...moving, ...rest.slice(index + 1)] : [...rest.slice(0, index), ...moving, ...rest.slice(index)]
  const layers = placed.flat()
  return layers.every((l, i) => l === doc.layers[i]) ? doc : { ...doc, layers }
}

// Where the chosen layers sit in the stack: the lowest and highest index.
function span(doc: EditorDocument, ids: Set<string>): [number, number] {
  let low = -1
  let high = -1
  doc.layers.forEach((l, i) => {
    if (!ids.has(l.id)) return
    if (low === -1) low = i
    high = i
  })
  return [low, high]
}

// Part of a group: steps it like Bring forward and Send backward until it is next to the target, or
// as close as it can come while staying in its group.
function stepNextTo(doc: EditorDocument, ids: string[], target: Set<string>, side: 'above' | 'below'): EditorDocument {
  const chosen = new Set(ids)
  const placed = (d: EditorDocument) => {
    const [low, high] = span(d, chosen)
    const [targetLow, targetHigh] = span(d, target)
    return side === 'above' ? low > targetHigh : high < targetLow
  }
  const [low] = span(doc, chosen)
  const [targetLow, targetHigh] = span(doc, target)
  // Toward the target until in place, or back as close as it can come while staying in place.
  const toward: 1 | -1 = placed(doc) ? (low > targetHigh ? -1 : 1) : low < targetLow ? 1 : -1
  let current = doc
  for (let step = 0; step < doc.layers.length; step++) {
    if (placed(current) && toward === (side === 'above' ? 1 : -1)) break
    const next = moveLayersBy(current, ids, toward)
    if (next === current) break
    if (placed(current) && !placed(next)) break
    current = next
  }
  return current
}

// What "Join into one layer" joins: the picked layers, or one layer and the one right below it.
// Returns the layer ids, or why they can't be joined.
export function layersToJoin(doc: EditorDocument, ids: string[]): string[] | { reason: string } {
  const chosen = doc.layers.filter((l) => ids.includes(l.id))
  if (chosen.length === 0) return { reason: t('Pick a layer first. The page itself always stays at the back.') }
  if (chosen.length === 1) {
    const index = doc.layers.indexOf(chosen[0])
    const below = doc.layers[index - 1]
    if (!below) return { reason: t('There is nothing below it to join with. Pick two or more layers, or one that has a layer below it.') }
    chosen.unshift(below)
  }
  if (chosen.filter((l) => l.visible).length < 2) return { reason: t('Hidden layers are not joined. Show them first.') }
  // The joined picture covers what's between them, so nothing else may sit between them.
  const shown = chosen.filter((l) => l.visible)
  const low = doc.layers.indexOf(shown[0])
  const high = doc.layers.indexOf(shown[shown.length - 1])
  const between = doc.layers.slice(low + 1, high).find((l) => l.visible && !chosen.includes(l))
  if (between) return { reason: t("“{name}” sits between them. Drag the layers next to each other in the Layers list first, or pick it too.", { name: between.name }) }
  // A layer that mixes with what's below it would lose that once it's part of a plain picture.
  const mixing = shown.find((l) => l.blend && l.blend !== 'normal')
  if (mixing) return { reason: t("“{name}” mixes with what's below it, which joining would lose. Set its Mix with what's below back to Normal first.", { name: mixing.name }) }
  // Joining would take it off the other pages too.
  const shared = chosen.find((l) => l.everyPage)
  if (shared) return { reason: t("“{name}” is on every page, so it can't be joined. First click its On every page mark in the Layers panel, to keep it on this page only.", { name: shared.name }) }
  return chosen.map((l) => l.id)
}
