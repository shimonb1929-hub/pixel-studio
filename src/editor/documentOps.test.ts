import { describe, expect, it } from 'vitest'
import { cropDocument, documentBytes, flipDocument, resizeDocument, rotateDocument } from './documentOps.ts'
import { layerBounds, photoPlacement } from './objects.ts'
import type { EditorDocument, PixelLayer, ShapeLayer } from './types.ts'

// Only the size of a canvas matters to these changes, so a stand-in will do.
const fakeCanvas = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement

const star = (patch: Partial<ShapeLayer> = {}): ShapeLayer => ({
  id: 'star',
  kind: 'shape',
  name: 'Star 1',
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  box: { cx: 100, cy: 50, width: 40, height: 20, rotation: 0 },
  geometry: { type: 'star', corners: 0, sides: 5, arrow: false },
  fill: { kind: 'color', color: '#ff0000' },
  outline: { color: '#000000', width: 4 },
  ...patch,
})

const photo = (): PixelLayer => ({
  id: 'photo',
  kind: 'raster',
  name: 'beach',
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  canvas: fakeCanvas(2000, 1000),
  x: 0,
  y: 0,
  box: { cx: 200, cy: 150, width: 200, height: 100, rotation: 0 },
})

const design = (): EditorDocument => ({
  id: 'd',
  name: 'Card',
  width: 400,
  height: 300,
  layers: [photo(), star()],
  activeLayerId: 'star',
  selection: null,
})

describe('whole-design changes on objects', () => {
  it('crop slides every box', () => {
    const cropped = cropDocument(design(), { x: 50, y: 20, width: 200, height: 100 })
    expect(cropped.layers.map((l) => l.box)).toEqual([
      { cx: 150, cy: 130, width: 200, height: 100, rotation: 0 },
      { cx: 50, cy: 30, width: 40, height: 20, rotation: 0 },
    ])
  })

  it('resizing changes only boxes, so going back gives the very same design', () => {
    const original = design()
    const small = resizeDocument(original, 40, 30)
    expect(small.layers[0].box).toEqual({ cx: 20, cy: 15, width: 20, height: 10, rotation: 0 })
    expect((small.layers[1] as ShapeLayer).outline?.width).toBeCloseTo(0.4)
    // The picture keeps its own full-size pixels.
    expect((small.layers[0] as PixelLayer).canvas).toBe((original.layers[0] as PixelLayer).canvas)
    const back = resizeDocument(small, 400, 300)
    expect(back.layers[0].box).toEqual(original.layers[0].box)
    expect(back.layers[1].box).toEqual(original.layers[1].box)
    expect((back.layers[1] as ShapeLayer).outline?.width).toBeCloseTo(4)
    expect(documentBytes(back)).toBe(0)
  })

  it('a quarter turn moves and turns boxes', () => {
    const turned = rotateDocument(design(), 1)
    expect(turned.width).toBe(300)
    expect(turned.height).toBe(400)
    const box = turned.layers[1].box!
    expect(box.cx).toBe(250)
    expect(box.cy).toBe(100)
    expect(box.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('a flip mirrors boxes', () => {
    const flipped = flipDocument(design(), 'horizontal')
    expect(flipped.layers[1].box).toMatchObject({ cx: 300, cy: 50, width: -40, height: 20 })
  })
})

describe('shapes', () => {
  it('cover their outline, and an arrow head past the end of a line', () => {
    expect(layerBounds(star())).toEqual({ x: 77, y: 37, width: 46, height: 26 })
    const arrow = star({ geometry: { type: 'line', corners: 0, sides: 5, arrow: true }, box: { cx: 100, cy: 50, width: 100, height: 4, rotation: 0 } })
    expect(layerBounds(arrow).x).toBeLessThan(40)
  })

  it('keep a photo covering the whole shape, enlarged and slid as asked', () => {
    const fill = { kind: 'photo' as const, canvas: fakeCanvas(200, 100), zoom: 1, x: 0, y: 0 }
    expect(photoPlacement(fill, 200, 200)).toEqual({ x: -200, y: -100, width: 400, height: 200 })
    // Slid all the way right: the photo's left edge meets the shape's left edge.
    expect(photoPlacement({ ...fill, x: 1 }, 200, 200).x).toBe(-100)
    expect(photoPlacement({ ...fill, zoom: 2 }, 200, 200)).toEqual({ x: -400, y: -200, width: 800, height: 400 })
  })
})
