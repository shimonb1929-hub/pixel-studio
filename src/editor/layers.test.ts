import { describe, expect, it } from 'vitest'
import { activeLayer, insertLayerAboveActive, moveLayer, nextLayerName, removeLayer, selectLayer, updateLayer } from './layers.ts'
import type { EditorDocument, Layer } from './types.ts'

// The layer stack logic never touches the pixels, so a stand-in canvas is enough here.
function layer(id: string, name = id): Layer {
  return { id, kind: 'raster', name, canvas: {} as HTMLCanvasElement, visible: true, opacity: 1 }
}

function doc(ids: string[], active: string): EditorDocument {
  return { id: 'doc', name: 'Test', width: 10, height: 10, layers: ids.map((id) => layer(id)), activeLayerId: active }
}

const order = (d: EditorDocument) => d.layers.map((l) => l.id)

describe('nextLayerName', () => {
  it('counts up from the highest numbered layer', () => {
    expect(nextLayerName([])).toBe('Layer 1')
    expect(nextLayerName([layer('a', 'Background'), layer('b', 'Layer 1')])).toBe('Layer 2')
    expect(nextLayerName([layer('a', 'Layer 7'), layer('b', 'Layer 2'), layer('c', 'Sky')])).toBe('Layer 8')
  })
})

describe('insertLayerAboveActive', () => {
  it('adds the layer right above the active one and selects it', () => {
    const next = insertLayerAboveActive(doc(['a', 'b', 'c'], 'a'), layer('new'))
    expect(order(next)).toEqual(['a', 'new', 'b', 'c'])
    expect(next.activeLayerId).toBe('new')
  })
})

describe('removeLayer', () => {
  it('selects the layer below the removed one', () => {
    const next = removeLayer(doc(['a', 'b', 'c'], 'b'), 'b')
    expect(order(next)).toEqual(['a', 'c'])
    expect(next.activeLayerId).toBe('a')
  })

  it('selects the new bottom layer when the bottom one is removed', () => {
    const next = removeLayer(doc(['a', 'b'], 'a'), 'a')
    expect(next.activeLayerId).toBe('b')
  })

  it('keeps the selection when another layer is removed', () => {
    expect(removeLayer(doc(['a', 'b', 'c'], 'c'), 'a').activeLayerId).toBe('c')
  })

  it('never removes the last layer', () => {
    const only = doc(['a'], 'a')
    expect(removeLayer(only, 'a')).toBe(only)
  })
})

describe('moveLayer', () => {
  it('swaps with the neighbor', () => {
    expect(order(moveLayer(doc(['a', 'b', 'c'], 'a'), 'a', 1))).toEqual(['b', 'a', 'c'])
    expect(order(moveLayer(doc(['a', 'b', 'c'], 'a'), 'c', -1))).toEqual(['a', 'c', 'b'])
  })

  it('does nothing past the top or bottom', () => {
    const d = doc(['a', 'b'], 'a')
    expect(moveLayer(d, 'b', 1)).toBe(d)
    expect(moveLayer(d, 'a', -1)).toBe(d)
  })
})

describe('updateLayer and selectLayer', () => {
  it('changes only the named layer', () => {
    const next = updateLayer(doc(['a', 'b'], 'a'), 'b', { name: 'Sky', opacity: 0.5 })
    expect(next.layers[1]).toMatchObject({ id: 'b', name: 'Sky', opacity: 0.5 })
    expect(next.layers[0].name).toBe('a')
  })

  it('selects existing layers only', () => {
    const d = doc(['a', 'b'], 'a')
    expect(activeLayer(selectLayer(d, 'b'))?.id).toBe('b')
    expect(selectLayer(d, 'missing')).toBe(d)
  })
})
