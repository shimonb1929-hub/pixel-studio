import { createCanvas, createId, getContext2d } from './document.ts'
import { mapPath, pathBounds, type ShapePath } from './path.ts'
import type { TraceImage, TraceResult } from './trace.ts'
import { applyAffine, boxMatrix, type Affine, type TransformBox } from './transform.ts'
import type { EditorDocument, LayerGroup, PixelLayer, Point, ShapeLayer } from './types.ts'

// Puts the outlines of Turn into shapes (trace.ts) into the design as shape layers, exactly over
// the picture they came from.

// The picture's longest side while tracing. Bigger pictures are traced smaller (the shapes are
// sharp at any size anyway); small ones are traced larger, so their edges come out smoother.
export const TRACE_SIDE = { preview: 480, most: 1400, least: 800 } as const
// Small pictures grow at most this much for tracing.
const MOST_GROWTH = 4

// The picture to trace, scaled so its longest side is `side` (within `least` and `most`).
export function tracePicture(source: HTMLCanvasElement, most: number, least = 0): TraceImage {
  const longest = Math.max(source.width, source.height, 1)
  const target = Math.min(most, Math.max(least, longest), longest * MOST_GROWTH)
  const scale = target / longest
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

// Where the picture's pixels sit in the design, and how far it's turned.
export function picturePlace(layer: PixelLayer): { toDesign: Affine; rotation: number } {
  if (!layer.box) return { toDesign: { a: 1, b: 0, c: 0, d: 1, e: layer.x, f: layer.y }, rotation: 0 }
  return { toDesign: boxMatrix(layer.box, layer.canvas.width, layer.canvas.height), rotation: layer.box.rotation }
}

// One shape out of outlines in the design: its box is turned like the picture, and fits them all.
function shapeFromPaths(paths: ShapePath[], rotation: number): { box: TransformBox; path: ShapePath; parts: ShapePath[] } {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  // Into the box's own (unturned) directions.
  const local = paths.map((path) => mapPath(path, (p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos })))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const path of local) {
    const b = pathBounds(path)
    if (!b) continue
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const lcx = (minX + maxX) / 2
  const lcy = (minY + maxY) / 2
  const box: TransformBox = { cx: lcx * cos - lcy * sin, cy: lcx * sin + lcy * cos, width, height, rotation }
  const [path, ...parts] = local.map((p) => mapPath(p, (q) => ({ x: (q.x - lcx) / width, y: (q.y - lcy) / height })))
  return { box, path, parts }
}

// The traced colors as shape layers over the picture, bottom first, kept together in one group.
// `name` names each one from its number.
export function tracedShapes(result: TraceResult, layer: PixelLayer, group: LayerGroup, name: (n: number) => string): ShapeLayer[] {
  const { toDesign, rotation } = picturePlace(layer)
  const sx = layer.canvas.width / result.width
  const sy = layer.canvas.height / result.height
  const place = (p: Point) => applyAffine(toDesign, { x: p.x * sx, y: p.y * sy })
  return result.colors.map((color, i): ShapeLayer => {
    const { box, path, parts } = shapeFromPaths(
      color.paths.map((p) => mapPath(p, place)),
      rotation,
    )
    return {
      id: createId('layer'),
      kind: 'shape',
      name: name(i + 1),
      visible: true,
      opacity: layer.opacity,
      locked: false,
      adjust: null,
      // A group needs two or more things.
      ...(result.colors.length > 1 ? { group } : {}),
      box,
      geometry: { type: 'path', corners: 0, sides: 5, arrow: false, path, ...(parts.length ? { parts } : {}) },
      fill: { kind: 'color', color: color.color },
      outline: null,
    }
  })
}

// Puts the shapes just above the picture (above its whole group, if it's in one) and hides the
// picture, so nothing is lost: it's still there below, ready to show again. The top shape is picked.
export function placeTraced(doc: EditorDocument, layerId: string, shapes: ShapeLayer[]): EditorDocument {
  let index = doc.layers.findIndex((l) => l.id === layerId)
  if (index === -1 || shapes.length === 0) return doc
  const group = doc.layers[index].group?.id
  while (group && doc.layers[index + 1]?.group?.id === group) index++
  const layers = doc.layers.map((l) => (l.id === layerId ? { ...l, visible: false } : l))
  layers.splice(index + 1, 0, ...shapes)
  return { ...doc, layers, activeLayerId: shapes[shapes.length - 1].id }
}

export function traceGroup(name: string): LayerGroup {
  return { id: createId('group'), name }
}
