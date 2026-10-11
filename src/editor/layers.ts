import type { EditorDocument, Layer, PixelLayer, ShapeLayer } from './types.ts'

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

// Puts a layer just above the active one (on top of everything when the page is picked) and makes
// it active.
export function insertLayerAboveActive(doc: EditorDocument, layer: Layer): EditorDocument {
  const index = doc.layers.findIndex((l) => l.id === doc.activeLayerId)
  const layers = [...doc.layers]
  layers.splice(index === -1 ? layers.length : index + 1, 0, layer)
  return { ...doc, layers, activeLayerId: layer.id }
}

export function removeLayer(doc: EditorDocument, layerId: string): EditorDocument {
  const index = doc.layers.findIndex((l) => l.id === layerId)
  if (index === -1) return doc
  const layers = doc.layers.filter((l) => l.id !== layerId)
  // The layer below takes over, or the new bottom layer if the bottom one was removed, or the page.
  const activeLayerId = layerId === doc.activeLayerId ? (layers[Math.max(0, index - 1)]?.id ?? '') : doc.activeLayerId
  return { ...doc, layers, activeLayerId }
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
type CommonPatch = Partial<Pick<Layer, 'name' | 'visible' | 'opacity' | 'locked' | 'adjust'>>

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
