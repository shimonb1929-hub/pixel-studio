import { describe, expect, it } from 'vitest'
import {
  centeredViewport,
  fitViewport,
  formatZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomLevel,
  screenToDocument,
  zoomAtPoint,
} from './viewport.ts'

describe('zoomAtPoint', () => {
  it('keeps the document point under the cursor in place', () => {
    const before = { zoom: 0.5, panX: 100, panY: 40 }
    const after = zoomAtPoint(before, 2, 300, 200)
    expect(after.zoom).toBe(2)
    const docBefore = screenToDocument(before, 300, 200)
    const docAfter = screenToDocument(after, 300, 200)
    expect(docAfter.x).toBeCloseTo(docBefore.x)
    expect(docAfter.y).toBeCloseTo(docBefore.y)
  })

  it('clamps to the zoom limits', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 }
    expect(zoomAtPoint(viewport, 1000, 0, 0).zoom).toBe(MAX_ZOOM)
    expect(zoomAtPoint(viewport, 0, 0, 0).zoom).toBe(MIN_ZOOM)
  })
})

describe('nextZoomLevel', () => {
  it('steps through the preset levels', () => {
    expect(nextZoomLevel(1, 1)).toBe(2)
    expect(nextZoomLevel(1, -1)).toBeCloseTo(2 / 3)
  })

  it('moves to the nearest preset from an in-between zoom', () => {
    expect(nextZoomLevel(1.3, 1)).toBe(2)
    expect(nextZoomLevel(1.3, -1)).toBe(1)
  })

  it('stops at the ends', () => {
    expect(nextZoomLevel(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(nextZoomLevel(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
})

describe('fitViewport', () => {
  it('shrinks a large document to fit and centers it', () => {
    const viewport = fitViewport(4000, 2000, 1080, 640)
    expect(viewport.zoom).toBeCloseTo(0.25)
    expect(viewport.panX).toBeCloseTo(40)
    expect(viewport.panY).toBeCloseTo(70)
  })

  it('does not enlarge a small image unless asked', () => {
    expect(fitViewport(100, 100, 1000, 800, { allowUpscale: false }).zoom).toBe(1)
    expect(fitViewport(100, 100, 1000, 800).zoom).toBeCloseTo(7.2)
  })

  it('falls back to 100% before the view has a size', () => {
    expect(fitViewport(100, 100, 0, 0)).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })
})

describe('centeredViewport', () => {
  it('places the document in the middle of the view', () => {
    expect(centeredViewport(200, 100, 1000, 500, 1)).toEqual({ zoom: 1, panX: 400, panY: 200 })
  })
})

describe('formatZoom', () => {
  it('rounds to whole numbers, keeping one decimal for tiny zooms', () => {
    expect(formatZoom(1)).toBe('100%')
    expect(formatZoom(2 / 3)).toBe('67%')
    expect(formatZoom(0.5962)).toBe('60%')
    expect(formatZoom(1 / 12)).toBe('8.3%')
    expect(formatZoom(0.01)).toBe('1%')
  })
})
