import { describe, expect, it } from 'vitest'
import { pointOnSegment, segmentAt, segmentCount, type ShapePath } from './path.ts'
import { outlineLoops, suggestCutoff, traceImage, type TraceImage, type TraceOptions } from './trace.ts'
import { placeTraced, tracedShapes } from './traceLayers.ts'
import type { EditorDocument, PixelLayer, Point } from './types.ts'

type Rgba = [number, number, number, number]

// Test pictures are drawn in code, pixel by pixel.
function picture(width: number, height: number, paint: (x: number, y: number) => Rgba): TraceImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x + 0.5, y + 0.5), (y * width + x) * 4)
  return { width, height, data }
}

const WHITE: Rgba = [255, 255, 255, 255]
const BLACK: Rgba = [0, 0, 0, 255]
const CLEAR: Rgba = [0, 0, 0, 0]

// A black ring (a circle with a round hole) on white paper.
const ring = picture(200, 200, (x, y) => {
  const r = Math.hypot(x - 100, y - 100)
  return r < 80 && r > 40 ? BLACK : WHITE
})

const ink = (extra: Partial<TraceOptions> = {}): TraceOptions => ({ mode: 'ink', colors: 2, cutoff: 0.5, detail: 0.5, dropBackground: true, ...extra })
const colors = (count: number, extra: Partial<TraceOptions> = {}): TraceOptions => ({ mode: 'colors', colors: count, cutoff: 0.5, detail: 0.5, dropBackground: true, ...extra })

// The outlines turned into many short straight lines.
function flatten(path: ShapePath): Point[] {
  const points: Point[] = []
  for (let i = 0; i < segmentCount(path); i++) {
    const s = segmentAt(path, i)
    for (let k = 0; k < 16; k++) points.push(pointOnSegment(s, k / 16))
  }
  return points
}

// Whether a point is inside: an odd number of outlines go around it.
function inside(rings: Point[][], p: Point): boolean {
  let odd = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
    }
  }
  return odd
}

// How many pixel centers the traced shape gets wrong, compared with `expected`.
function mistakes(paths: ShapePath[], width: number, height: number, expected: (x: number, y: number) => boolean): number {
  const rings = paths.map(flatten)
  let wrong = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside(rings, { x: x + 0.5, y: y + 0.5 }) !== expected(x + 0.5, y + 0.5)) wrong++
  return wrong
}

// Spots (four to a pixel) that no color covers.
function gaps(colors: { paths: ShapePath[] }[], width: number, height: number): number {
  const shapes = colors.map((c) => c.paths.map(flatten))
  let count = 0
  for (let y = 0.125; y < height; y += 0.25) for (let x = 0.125; x < width; x += 0.25) if (!shapes.some((rings) => inside(rings, { x, y }))) count++
  return count
}

describe('outlineLoops', () => {
  it('goes around a filled area clockwise and around its hole the other way', () => {
    // A 3 by 3 square with its middle pixel missing.
    const filled = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1])
    const loops = outlineLoops(filled, 3, 3)
    expect(loops.map((l) => l.area).sort((a, b) => a - b)).toEqual([-1, 9])
  })

  it('joins two pixels that touch only at a corner', () => {
    const loops = outlineLoops(Uint8Array.from([1, 0, 0, 1]), 2, 2)
    expect(loops).toHaveLength(1)
    expect(loops[0].area).toBe(2)
  })
})

describe('traceImage', () => {
  it('turns a black circle with a hole into one shape with a hole', () => {
    const result = traceImage(ring, ink())
    expect(result.colors).toHaveLength(1)
    const [shape] = result.colors
    expect(shape.color).toBe('#000000')
    // The outside and the hole.
    expect(shape.paths).toHaveLength(2)
    // Smooth curves, not a point at every pixel step.
    for (const path of shape.paths) {
      expect(path.nodes.length).toBeLessThan(24)
      expect(path.nodes.every((n) => n.smooth)).toBe(true)
    }
    const wrong = mistakes(shape.paths, 200, 200, (x, y) => {
      const r = Math.hypot(x - 100, y - 100)
      return r < 80 && r > 40
    })
    // Only a few pixels right along the edge may differ.
    expect(wrong).toBeLessThan(200 * 200 * 0.006)
  })

  it('turns three colored squares into three shapes with their colors, and leaves out the white', () => {
    const squares: [number, number, Rgba][] = [
      [20, 20, [220, 30, 30, 255]],
      [90, 40, [30, 160, 60, 255]],
      [50, 100, [30, 60, 200, 255]],
    ]
    const image = picture(160, 160, (x, y) => squares.find(([sx, sy]) => x > sx && x < sx + 40 && y > sy && y < sy + 40)?.[2] ?? WHITE)
    const result = traceImage(image, colors(4))
    expect(result.colors).toHaveLength(3)
    for (const [sx, sy, rgb] of squares) {
      const hex = `#${rgb.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`
      const shape = result.colors.find((c) => c.color === hex)
      expect(shape, hex).toBeDefined()
      expect(shape!.paths).toHaveLength(1)
      // A square keeps its four sharp corners and straight sides.
      const [path] = shape!.paths
      expect(path.nodes).toHaveLength(4)
      expect(path.nodes.every((n) => !n.smooth)).toBe(true)
      const xs = path.nodes.map((n) => n.x).sort((a, b) => a - b)
      const ys = path.nodes.map((n) => n.y).sort((a, b) => a - b)
      expect(xs[0]).toBeCloseTo(sx, 0)
      expect(xs[3]).toBeCloseTo(sx + 40, 0)
      expect(ys[0]).toBeCloseTo(sy, 0)
      expect(ys[3]).toBeCloseTo(sy + 40, 0)
    }
  })

  it('keeps the background as a shape under everything when asked', () => {
    const result = traceImage(ring, ink({ dropBackground: false }))
    expect(result.colors.map((c) => c.color)).toEqual(['#ffffff', '#000000'])
    // The paper reaches in under the ring, so nothing shows through between them.
    expect(gaps(result.colors, 200, 200)).toBe(0)
  })

  it('leaves see-through parts out', () => {
    const image = picture(100, 100, (x, y) => (Math.hypot(x - 50, y - 50) < 30 ? [200, 120, 0, 255] : CLEAR))
    const result = traceImage(image, colors(3, { dropBackground: false }))
    expect(result.colors).toHaveLength(1)
    expect(result.colors[0].paths).toHaveLength(1)
  })

  it('drops specks smaller than the detail allows, and keeps them with more detail', () => {
    // A big square and a tiny dot.
    const image = picture(400, 400, (x, y) => ((x > 50 && x < 250 && y > 50 && y < 250) || Math.hypot(x - 330, y - 330) < 2.5 ? BLACK : WHITE))
    expect(traceImage(image, ink({ detail: 0.1 })).colors[0].paths).toHaveLength(1)
    expect(traceImage(image, ink({ detail: 1 })).colors[0].paths).toHaveLength(2)
  })

  it('makes simpler shapes with less detail', () => {
    // A wobbly blob.
    const blob = picture(300, 300, (x, y) => {
      const angle = Math.atan2(y - 150, x - 150)
      return Math.hypot(x - 150, y - 150) < 100 + 8 * Math.sin(angle * 9) + 4 * Math.sin(angle * 23) ? BLACK : WHITE
    })
    const nodes = (detail: number) => traceImage(blob, ink({ detail })).colors[0].paths[0].nodes.length
    expect(nodes(0)).toBeLessThan(nodes(1))
  })

  it('stacks colors that touch so no gap shows between them', () => {
    // Left half red, right half blue, no background.
    const image = picture(100, 60, (x) => (x < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const result = traceImage(image, colors(2, { dropBackground: false }))
    expect(result.colors).toHaveLength(2)
    // The bottom color reaches in under the top one: together they cover everything.
    expect(gaps(result.colors, 100, 60)).toBe(0)
  })

  it('traces a 1000 pixel logo quickly', () => {
    const logo = picture(1000, 1000, (x, y) => {
      const r = Math.hypot(x - 500, y - 500)
      if (r < 420 && r > 300) return [20, 40, 160, 255]
      if (Math.abs(x - 500) < 200 && Math.abs(y - 500) < 60) return [230, 120, 20, 255]
      if (Math.abs(x - 500) < 40 && Math.abs(y - 500) < 250) return [10, 10, 10, 255]
      return WHITE
    })
    const start = performance.now()
    const result = traceImage(logo, colors(6))
    const took = performance.now() - start
    expect(result.colors.length).toBeGreaterThanOrEqual(3)
    expect(took).toBeLessThan(3000)
  })
})

describe('suggestCutoff', () => {
  it('splits dark ink from light paper', () => {
    const cutoff = suggestCutoff(picture(50, 50, (x) => (x < 20 ? [40, 40, 40, 255] : [230, 230, 230, 255])))
    expect(cutoff).toBeGreaterThan(0.15)
    expect(cutoff).toBeLessThan(0.9)
  })
})

describe('tracedShapes and placeTraced', () => {
  // A picture of the ring, moved on the design and shown twice as big.
  const result = traceImage(ring, ink())
  const picture = {
    id: 'photo',
    kind: 'raster',
    name: 'ring',
    canvas: { width: 200, height: 200 } as HTMLCanvasElement,
    x: 0,
    y: 0,
    box: { cx: 250, cy: 230, width: 400, height: 400, rotation: 0 },
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
  } satisfies PixelLayer

  it('puts the shapes exactly over the picture', () => {
    const [shape] = tracedShapes(result, picture, { id: 'g', name: 'Traced picture' }, (n) => `Color ${n}`)
    expect(shape.geometry.type).toBe('path')
    expect(shape.geometry.parts).toHaveLength(1)
    expect(shape.fill).toEqual({ kind: 'color', color: '#000000' })
    // The ring is 160 pixels across in the picture: 320 on the design, around the picture's middle.
    expect(shape.box.cx).toBeCloseTo(250, 0)
    expect(shape.box.cy).toBeCloseTo(230, 0)
    expect(Math.abs(shape.box.width - 320)).toBeLessThan(3)
    expect(Math.abs(shape.box.height - 320)).toBeLessThan(3)
    // A single shape isn't put in a group of its own.
    expect(shape.group).toBeUndefined()
  })

  it('hides the picture below the shapes, so nothing is lost', () => {
    const shapes = tracedShapes(traceImage(ring, ink({ dropBackground: false })), picture, { id: 'g', name: 'Traced picture' }, (n) => `Color ${n}`)
    const doc = { layers: [picture, { ...picture, id: 'top' }], activeLayerId: 'photo' } as unknown as EditorDocument
    const next = placeTraced(doc, 'photo', shapes)
    expect(next.layers.map((l) => l.id)).toEqual(['photo', ...shapes.map((s) => s.id), 'top'])
    expect(next.layers[0].visible).toBe(false)
    expect(shapes.every((s) => s.group?.id === 'g')).toBe(true)
    expect(next.activeLayerId).toBe(shapes[shapes.length - 1].id)
  })
})
