import { describe, expect, it } from 'vitest'
import { combineAreas, combinedShape } from './combine.ts'
import { photoPlacement } from './objects.ts'
import type { ShapeLayer } from './types.ts'

function square(id: string, x: number, y: number, size: number, type: 'rectangle' | 'ellipse' = 'rectangle'): ShapeLayer {
  return {
    id,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: x + size / 2, cy: y + size / 2, width: size, height: size, rotation: 0 },
    geometry: { type, corners: 0, sides: 6, arrow: false },
    fill: { kind: 'color', color: '#ff0000' },
    outline: null,
  }
}

// The area inside outlines, where an odd number of them go around.
function area(outlines: { x: number; y: number }[][]): number {
  let total = 0
  for (const ring of outlines) {
    let sum = 0
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]
      sum += p.x * q.y - q.x * p.y
    })
    total += sum / 2
  }
  return Math.abs(total)
}

describe('making one shape out of several', () => {
  // Two 100 × 100 squares overlapping by a 50 × 50 corner.
  const a = square('a', 0, 0, 100)
  const b = square('b', 50, 50, 100)

  it('joins, cuts out, keeps the overlap, or cuts it away', () => {
    expect(area(combineAreas([a, b], 'join'))).toBeCloseTo(17500, 0)
    expect(area(combineAreas([a, b], 'cut'))).toBeCloseTo(7500, 0)
    expect(area(combineAreas([a, b], 'overlap'))).toBeCloseTo(2500, 0)
    // Apart: two L shapes, each 7500.
    expect(combineAreas([a, b], 'apart').length).toBeGreaterThanOrEqual(2)
  })

  it('cutting a smaller shape out of the middle leaves a hole', () => {
    const big = square('big', 0, 0, 100)
    const hole = square('hole', 25, 25, 50, 'ellipse')
    const outlines = combineAreas([big, hole], 'cut')
    expect(outlines).toHaveLength(2)
    expect(Math.abs(area([outlines[0]]) - area([outlines[1]]))).toBeCloseTo(10000 - Math.PI * 625, -1)
    const shape = combinedShape(big, outlines, 'new', 'Shape 1')!
    expect(shape.box).toEqual({ cx: 50, cy: 50, width: 100, height: 100, rotation: 0 })
    expect(shape.geometry.parts).toHaveLength(1)
    expect(shape.fill).toEqual(big.fill)
  })

  it('keeps curves round: a circle joined with a square, and a circle on its own', () => {
    const circle = square('circle', 50, 50, 100, 'ellipse')
    const joined = combineAreas([square('a', 0, 0, 100), circle], 'join')
    expect(joined).toHaveLength(1)
    // A square and a quarter-overlapping circle, give or take the tiny straight steps of the curve.
    expect(area(joined)).toBeCloseTo(10000 + Math.PI * 2500 * 0.75, -1)
    expect(joined[0].length).toBeGreaterThan(40)
    const alone = combineAreas([circle], 'join')
    expect(alone).toHaveLength(1)
    expect(area(alone)).toBeCloseTo(Math.PI * 2500, -1)
    expect(alone[0].length).toBeGreaterThan(40)
    // A square on its own is still just four corners.
    expect(combineAreas([square('a', 0, 0, 100)], 'join')[0]).toHaveLength(4)
  })

  it('nothing is left of shapes that do not overlap', () => {
    expect(combineAreas([square('a', 0, 0, 10), square('b', 50, 50, 10)], 'overlap')).toEqual([])
  })

  // Where the photo inside a shape sits in the design: its middle and how big it is.
  function photoInDesign(shape: ShapeLayer) {
    if (shape.fill.kind !== 'photo') throw new Error('no photo')
    const { box } = shape
    const place = photoPlacement(shape.fill, Math.abs(box.width), Math.abs(box.height))
    const lx = (place.x + place.width / 2) * Math.sign(box.width)
    const ly = (place.y + place.height / 2) * Math.sign(box.height)
    const cos = Math.cos(box.rotation)
    const sin = Math.sin(box.rotation)
    return { x: box.cx + lx * cos - ly * sin, y: box.cy + lx * sin + ly * cos, width: place.width, height: place.height }
  }

  it('a photo inside stays exactly where it was, also in a turned and flipped shape', () => {
    const canvas = { width: 400, height: 200 } as HTMLCanvasElement
    for (const box of [
      { cx: 50, cy: 50, width: 100, height: 100, rotation: 0 },
      { cx: 60, cy: 40, width: -120, height: 80, rotation: 0.6 },
    ]) {
      const photo: ShapeLayer = { ...square('photo', 0, 0, 100), box, fill: { kind: 'photo', canvas, zoom: 1.5, x: 0.3, y: -0.4 } }
      // Cutting a corner away makes the shape smaller; the photo must not move or change size.
      const cut = combinedShape(photo, combineAreas([photo, square('corner', 70, 0, 60)], 'cut'), 'new', 'Shape 1')!
      const before = photoInDesign(photo)
      const after = photoInDesign(cut)
      expect(cut.box.rotation).toBe(box.rotation)
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
      expect(after.width).toBeCloseTo(before.width, 6)
    }
  })

  it('a photo grows just enough to cover a bigger joined shape', () => {
    const canvas = { width: 100, height: 100 } as HTMLCanvasElement
    const photo: ShapeLayer = { ...square('photo', 0, 0, 100), fill: { kind: 'photo', canvas, zoom: 1, x: 0, y: 0 } }
    const joined = combinedShape(photo, combineAreas([photo, square('b', 50, 0, 100)], 'join'), 'new', 'Shape 1')!
    const after = photoInDesign(joined)
    expect(after.width).toBeCloseTo(150, 6)
    expect(joined.fill.kind === 'photo' && joined.fill.zoom).toBe(1)
  })
})
