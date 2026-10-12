import { describe, expect, it } from 'vitest'
import { bendSegment, cornerNode, fitPathToBox, geometryToPath, insertNode, nearestOnPath, pathBounds, pathInDesign, pointOnSegment, removeNode, segmentAt, setSmooth, type ShapePath } from './path.ts'

const square: ShapePath = { closed: true, nodes: [cornerNode({ x: 0, y: 0 }), cornerNode({ x: 100, y: 0 }), cornerNode({ x: 100, y: 50 }), cornerNode({ x: 0, y: 50 })] }

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('pen paths', () => {
  it('fits a box around a path, and puts it back in the design unchanged', () => {
    const { box, path } = fitPathToBox(square)
    expect(box).toEqual({ cx: 50, cy: 25, width: 100, height: 50, rotation: 0 })
    near(path.nodes[0], { x: -0.5, y: -0.5 })
    pathInDesign(path, box).nodes.forEach((n, i) => near(n, square.nodes[i]))
  })

  it('keeps a turned and flipped box turned and flipped', () => {
    const turned = fitPathToBox(square, Math.PI / 6, true, false)
    expect(turned.box.rotation).toBeCloseTo(Math.PI / 6)
    expect(turned.box.width).toBeLessThan(0)
    pathInDesign(turned.path, turned.box).nodes.forEach((n, i) => near(n, square.nodes[i]))
  })

  it('measures curves by how far they really bulge, not by their handles', () => {
    const hill: ShapePath = { closed: false, nodes: [{ ...cornerNode({ x: 0, y: 0 }), out: { x: 0, y: -100 } }, { ...cornerNode({ x: 100, y: 0 }), in: { x: 100, y: -100 } }] }
    const bounds = pathBounds(hill)!
    expect(bounds.minY).toBeCloseTo(-75)
    expect(bounds.maxY).toBe(0)
  })

  it('adds a point on a curve without changing its look, and takes it away again', () => {
    const curve: ShapePath = { closed: false, nodes: [{ ...cornerNode({ x: 0, y: 0 }), out: { x: 30, y: -60 } }, { ...cornerNode({ x: 100, y: 0 }), in: { x: 70, y: -60 } }] }
    const split = insertNode(curve, 0, 0.5)
    expect(split.nodes).toHaveLength(3)
    near(split.nodes[1], pointOnSegment(segmentAt(curve, 0), 0.5))
    expect(split.nodes[1].smooth).toBe(true)
    near(pointOnSegment(segmentAt(split, 0), 0.5), pointOnSegment(segmentAt(curve, 0), 0.25))
    expect(removeNode(split, 1).nodes).toHaveLength(2)
  })

  it('finds the closest place on a path', () => {
    const found = nearestOnPath(square, { x: 40, y: 53 })!
    expect(found.segment).toBe(2)
    expect(found.distance).toBeCloseTo(3)
  })

  it('bends a side so the dragged spot follows the pointer', () => {
    const bent = bendSegment(square, 0, 0.5, 0, -20)
    near(pointOnSegment(segmentAt(bent, 0), 0.5), { x: 50, y: -20 })
    near(bent.nodes[0], square.nodes[0])
  })

  it('makes a point smooth and sharp again', () => {
    const smooth = setSmooth(square, 1, true)
    expect(smooth.nodes[1].smooth).toBe(true)
    expect(smooth.nodes[1].in).not.toEqual(smooth.nodes[1].out)
    const sharp = setSmooth(smooth, 1, false)
    expect(sharp.nodes[1].in).toEqual({ x: 100, y: 0 })
  })

  it('turns other shapes into paths with the same outline', () => {
    const geometry = { type: 'ellipse' as const, corners: 0, sides: 6, arrow: false }
    const circle = geometryToPath(geometry, 100, 100, [])
    expect(circle.nodes).toHaveLength(4)
    // Halfway along a quarter, a circle is at radius 0.5 (within the curve's tiny error).
    const mid = pointOnSegment(segmentAt(circle, 0), 0.5)
    expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(0.5, 3)
    const rounded = geometryToPath({ ...geometry, type: 'rectangle', corners: 0.5 }, 200, 100, [])
    expect(rounded.nodes).toHaveLength(8)
    expect(geometryToPath({ ...geometry, type: 'rectangle' }, 200, 100, []).nodes).toHaveLength(4)
  })
})
