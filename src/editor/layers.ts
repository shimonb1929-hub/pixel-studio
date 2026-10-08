import type { EditorDocument, Layer } from './types.ts'

// Small, pure steps for changing the layer stack. Each returns a new document and leaves the
// old one untouched, which is what makes undo simple.

export function activeLayer(doc: EditorDocument): Layer | undefined {
  return doc.layers.find((layer) => layer.id === doc.activeLayerId)
}

// "Layer 4" when the highest numbered layer so far is "Layer 3".
export function nextLayerName(layers: Layer[]): string {
  const highest = layers.reduce((max, layer) => {
    const match = /^Layer (\d+)$/.exec(layer.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `Layer ${highest + 1}`
}

// Puts a layer just above the active one and makes it active.
export function insertLayerAboveActive(doc: EditorDocument, layer: Layer): EditorDocument {
  const index = doc.layers.findIndex((l) => l.id === doc.activeLayerId)
  const layers = [...doc.layers]
  layers.splice(index + 1, 0, layer)
  return { ...doc, layers, activeLayerId: layer.id }
}

export function removeLayer(doc: EditorDocument, layerId: string): EditorDocument {
  if (doc.layers.length <= 1) return doc
  const index = doc.layers.findIndex((l) => l.id === layerId)
  if (index === -1) return doc
  const layers = doc.layers.filter((l) => l.id !== layerId)
  // The layer below takes over, or the new bottom layer if the bottom one was removed.
  const activeLayerId = layerId === doc.activeLayerId ? layers[Math.max(0, index - 1)].id : doc.activeLayerId
  return { ...doc, layers, activeLayerId }
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

export function updateLayer(doc: EditorDocument, layerId: string, patch: Partial<Omit<Layer, 'id'>>): EditorDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
}

export function selectLayer(doc: EditorDocument, layerId: string): EditorDocument {
  return doc.layers.some((l) => l.id === layerId) ? { ...doc, activeLayerId: layerId } : doc
}
