import { describe, expect, it } from 'vitest'
import { activeLayer, insertLayerAboveActive, moveLayer, moveLayerTo, nextLayerName, removeLayer, selectLayer, updateLayer } from './layers.ts'
import type { EditorDocument, Layer } from './types.ts'

// The layer stack logic never touches the pixels, so a stand-in canvas is enough here.
function layer(id: string, name = id): Layer {
  return { id, kind: 'raster', name, canvas: {} as HTMLCanvasElement, x: 0, y: 0, box: null, visible: true, opacity: 1, locked: false, adjust: null }
}

function doc(ids: string[], active: string): EditorDocument {
  return { id: 'doc', name: 'Test', width: 10, height: 10, background: '#ffffff', layers: ids.map((id) => layer(id)), activeLayerId: active, selection: null }
}

const order = (d: EditorDocument) => d.layers.map((l) => l.id)

describe('nextLayerName', () => {
  it('counts up from the highest numbered layer', () => {
    expect(nextLayerName([])).toBe('Drawing 1')
    expect(nextLayerName([layer('a', 'Background'), layer('b', 'Drawing 1')])).toBe('Drawing 2')
    expect(nextLayerName([layer('a', 'Drawing 7'), layer('b', 'Drawing 2'), layer('c', 'Sky')])).toBe('Drawing 8')
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

  it('removing the last layer leaves the page picked', () => {
    const empty = removeLayer(doc(['a'], 'a'), 'a')
    expect(empty.layers).toEqual([])
    expect(empty.activeLayerId).toBe('')
  })
})

describe('the page', () => {
  it('can be picked, and new layers then go on top', () => {
    const page = selectLayer(doc(['a', 'b'], 'a'), '')
    expect(activeLayer(page)).toBeUndefined()
    expect(order(insertLayerAboveActive(page, layer('c')))).toEqual(['a', 'b', 'c'])
  })
})

describe('moveLayerTo', () => {
  it('brings a layer to the front or sends it to the back', () => {
    expect(order(moveLayerTo(doc(['a', 'b', 'c'], 'a'), 'a', 'front'))).toEqual(['b', 'c', 'a'])
    expect(order(moveLayerTo(doc(['a', 'b', 'c'], 'c'), 'c', 'back'))).toEqual(['c', 'a', 'b'])
    const already = doc(['a', 'b'], 'b')
    expect(moveLayerTo(already, 'b', 'front')).toBe(already)
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
