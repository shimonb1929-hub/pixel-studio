import { createCanvas, getContext2d, MAX_LAYER_SIDE } from './document.ts'
import { polygonBounds, snapRect, type Rect } from './geometry.ts'
import { applyAffine, boxCorners, boxMatrix, invertAffine, type TransformBox } from './transform.ts'
import type { EditorDocument, Layer, PixelLayer, Point, ShapeFill, ShapeGeometry, ShapeLayer } from './types.ts'

// What every kind of layer can do: be drawn, be measured, be picked on the design, and be turned
// into plain pixels for the tools that work on pixels.

export function isPixelLayer(layer: Layer | null | undefined): layer is PixelLayer {
  return layer?.kind === 'raster'
}

export function isShapeLayer(layer: Layer | null | undefined): layer is ShapeLayer {
  return layer?.kind === 'shape'
}

// How far a shape's outline (and an arrow head) reaches past its box.
function shapeReach(layer: ShapeLayer): number {
  const width = layer.outline?.width ?? 0
  return width / 2 + (layer.geometry.type === 'line' && layer.geometry.arrow ? width * 2.5 : 0) + 1
}

// The area a layer covers, in whole design pixels.
export function layerBounds(layer: Layer): Rect {
  if (layer.kind === 'raster' && !layer.box) return { x: layer.x, y: layer.y, width: layer.canvas.width, height: layer.canvas.height }
  const box = layer.box!
  const bounds = polygonBounds(boxCorners(box))!
  const reach = layer.kind === 'shape' ? shapeReach(layer) : 0
  return snapRect({ x: bounds.x - reach, y: bounds.y - reach, width: bounds.width + 2 * reach, height: bounds.height + 2 * reach })
}

// Corner points of a regular polygon or star, stretched to fill a w × h box around 0, 0.
function fittedPoints(points: Point[], w: number, h: number): Point[] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  return points.map((p) => ({ x: ((p.x - minX) / spanX - 0.5) * w, y: ((p.y - minY) / spanY - 0.5) * h }))
}

export const STAR_INNER = 0.45

// How long a line's arrow head is.
export function arrowLength(outlineWidth: number): number {
  return Math.max(outlineWidth * 3.5, 12)
}

// The outline of a shape, centered on 0, 0, unturned and unflipped.
export function shapePath(geometry: ShapeGeometry, w: number, h: number, outlineWidth = 0): Path2D {
  const path = new Path2D()
  if (geometry.type === 'rectangle') {
    path.roundRect(-w / 2, -h / 2, w, h, (geometry.corners * Math.min(w, h)) / 2)
  } else if (geometry.type === 'ellipse') {
    path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (geometry.type === 'line') {
    // With an arrow head, the line stops short of the tip so its thick end doesn't poke through.
    const end = geometry.arrow ? w / 2 - arrowLength(outlineWidth) * 0.8 : w / 2
    path.moveTo(-w / 2, 0)
    path.lineTo(Math.max(-w / 2, end), 0)
  } else {
    const n = Math.max(3, Math.round(geometry.sides))
    const star = geometry.type === 'star'
    const count = star ? n * 2 : n
    const raw = Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
      const r = star && i % 2 === 1 ? STAR_INNER : 1
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })
    fittedPoints(raw, w, h).forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    path.closePath()
  }
  return path
}

// Where a photo sits inside a w × h shape: always covering it, enlarged by zoom, slid by x, y.
export function photoPlacement(fill: Extract<ShapeFill, { kind: 'photo' }>, w: number, h: number): Rect {
  const { canvas } = fill
  const scale = Math.max(w / canvas.width, h / canvas.height) * fill.zoom
  const width = canvas.width * scale
  const height = canvas.height * scale
  return { x: -width / 2 + (fill.x * (width - w)) / 2, y: -height / 2 + (fill.y * (height - h)) / 2, width, height }
}

// Turns the context so 0, 0 is the shape's middle, with its turn and flips. Returns its size.
function enterShape(ctx: CanvasRenderingContext2D, box: TransformBox): { w: number; h: number } {
  ctx.translate(box.cx, box.cy)
  ctx.rotate(box.rotation)
  ctx.scale(box.width < 0 ? -1 : 1, box.height < 0 ? -1 : 1)
  return { w: Math.abs(box.width), h: Math.abs(box.height) }
}

export function drawShape(ctx: CanvasRenderingContext2D, layer: ShapeLayer): void {
  const { geometry, fill, outline } = layer
  ctx.save()
  const { w, h } = enterShape(ctx, layer.box)
  const path = shapePath(geometry, w, h, outline?.width ?? 0)
  if (geometry.type !== 'line') {
    if (fill.kind === 'color') {
      ctx.fillStyle = fill.color
      ctx.fill(path)
    } else if (fill.kind === 'photo') {
      ctx.save()
      ctx.clip(path)
      const place = photoPlacement(fill, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(fill.canvas, place.x, place.y, place.width, place.height)
      ctx.restore()
    }
  }
  if (outline && outline.width > 0) {
    ctx.lineWidth = outline.width
    ctx.strokeStyle = outline.color
    ctx.lineJoin = 'round'
    ctx.lineCap = geometry.type === 'line' ? 'round' : 'butt'
    ctx.stroke(path)
    if (geometry.type === 'line' && geometry.arrow) {
      const length = arrowLength(outline.width)
      ctx.fillStyle = outline.color
      ctx.beginPath()
      ctx.moveTo(w / 2, 0)
      ctx.lineTo(w / 2 - length, length * 0.6)
      ctx.lineTo(w / 2 - length, -length * 0.6)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

// Draws what's on a layer (without its adjustments or opacity), in design coordinates.
export function drawLayerContent(ctx: CanvasRenderingContext2D, layer: Layer): void {
  if (layer.kind === 'shape') {
    drawShape(ctx, layer)
    return
  }
  if (!layer.box) {
    ctx.drawImage(layer.canvas, layer.x, layer.y)
    return
  }
  const m = boxMatrix(layer.box, layer.canvas.width, layer.canvas.height)
  ctx.save()
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
  // Stretched or turned pictures need smoothing. One at its own size, only slid by whole pixels or
  // flipped, draws exactly like a plain layer, so it stays just as crisp when zoomed in.
  const near = (value: number, target: number) => Math.abs(value - target) < 1e-9
  const ownSize = near(Math.abs(m.a), 1) && near(m.b, 0) && near(m.c, 0) && near(Math.abs(m.d), 1)
  if (!ownSize || !near(m.e, Math.round(m.e)) || !near(m.f, Math.round(m.f))) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
  }
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.restore()
}

// A layer's content as plain pixels on a canvas that sits straight in the design.
function toPixels(layer: Layer): { canvas: HTMLCanvasElement; x: number; y: number } {
  const rect = layerBounds(layer)
  const width = Math.max(1, Math.min(MAX_LAYER_SIDE, rect.width))
  const height = Math.max(1, Math.min(MAX_LAYER_SIDE, rect.height))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.translate(-rect.x, -rect.y)
  drawLayerContent(ctx, layer)
  return { canvas, x: rect.x, y: rect.y }
}

// A resized or turned layer, settled into plain pixels so it can be painted on. Layers that are
// already plain come back as they are.
export function settleLayer(layer: PixelLayer): PixelLayer {
  if (!layer.box) return layer
  return { ...layer, ...toPixels(layer), box: null }
}

// Shapes and settled copies never change in place, so each is worked out once.
const pixelCopies = new WeakMap<Layer, PixelLayer>()

// Any layer as plain pixels that sit straight in the design, for the tools that work on pixels.
// Plain pixel layers come back as they are (not copied).
export function layerPixels(layer: Layer): PixelLayer {
  if (layer.kind === 'raster' && !layer.box) return layer
  let copy = pixelCopies.get(layer)
  if (!copy) {
    const { canvas, x, y } = toPixels(layer)
    copy = { id: layer.id, kind: 'raster', name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked, adjust: layer.adjust, canvas, x, y, box: null }
    pixelCopies.set(layer, copy)
  }
  return copy
}

// One pixel, read back to see whether something is there.
let probe: CanvasRenderingContext2D | null = null
function probeContext(): CanvasRenderingContext2D {
  if (!probe) probe = createCanvas(1, 1).getContext('2d', { willReadFrequently: true })!
  return probe
}

// True if a design point is on something visible on the layer. `slack` (design pixels) makes thin
// outlines easier to hit.
export function hitsLayer(layer: Layer, point: Point, slack = 0): boolean {
  const ctx = probeContext()
  if (layer.kind === 'shape') {
    const { box, geometry, fill, outline } = layer
    const local = applyAffine(invertAffine(boxMatrix({ ...box, width: Math.sign(box.width) || 1, height: Math.sign(box.height) || 1 }, 1, 1)), point)
    const w = Math.abs(box.width)
    const h = Math.abs(box.height)
    // The matrix above maps the unit square around the middle; shift back so 0, 0 is the middle.
    const x = local.x - 0.5
    const y = local.y - 0.5
    const path = shapePath(geometry, w, h, outline?.width ?? 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (geometry.type !== 'line' && fill.kind !== 'none' && ctx.isPointInPath(path, x, y)) return true
    ctx.lineWidth = (outline?.width ?? 0) + slack * 2
    if (ctx.lineWidth > 0 && ctx.isPointInStroke(path, x, y)) return true
    if (geometry.type === 'line' && geometry.arrow && outline) return Math.hypot(x - w / 2, y) <= arrowLength(outline.width) + slack
    return false
  }
  const local = layer.box ? applyAffine(invertAffine(boxMatrix(layer.box, layer.canvas.width, layer.canvas.height)), point) : { x: point.x - layer.x, y: point.y - layer.y }
  const px = Math.floor(local.x)
  const py = Math.floor(local.y)
  if (px < 0 || py < 0 || px >= layer.canvas.width || py >= layer.canvas.height) return false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, 1, 1)
  ctx.drawImage(layer.canvas, px, py, 1, 1, 0, 0, 1, 1)
  return ctx.getImageData(0, 0, 1, 1).data[3] > 24
}

// The top layer under a design point that can be picked: visible and not locked.
export function layerAt(doc: EditorDocument, point: Point, slack = 0): Layer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i]
    if (!layer.visible || layer.opacity <= 0 || layer.locked) continue
    if (hitsLayer(layer, point, slack)) return layer
  }
  return null
}
