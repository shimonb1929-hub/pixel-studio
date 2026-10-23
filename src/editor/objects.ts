import { drawText, textReach } from '../text/textLayer.ts'
import { createCanvas, getContext2d, MAX_LAYER_SIDE } from './document.ts'
import { intersectRect, polygonBounds, snapRect, type Rect } from './geometry.ts'
import { canvasGradient } from './gradient.ts'
import { photoPlacement } from './photoFill.ts'
import { endDirection, mapPath, segmentCount, trimForArrow, tracePath, type ShapePath } from './path.ts'
import { layerVersion } from './pixelVersion.ts'
import { applyAffine, boxCorners, boxMatrix, invertAffine, multiplyAffine, type Affine, type TransformBox } from './transform.ts'
import type { EditorDocument, Layer, LayerHide, PixelLayer, Point, ShapeGeometry, ShapeLayer, ShapeOutline, TextLayer } from './types.ts'

// What every kind of layer can do: be drawn, be measured, be picked on the design, and be turned
// into plain pixels for the tools that work on pixels.

export { photoPlacement }

export function isPixelLayer(layer: Layer | null | undefined): layer is PixelLayer {
  return layer?.kind === 'raster'
}

export function isShapeLayer(layer: Layer | null | undefined): layer is ShapeLayer {
  return layer?.kind === 'shape'
}

export function isTextLayer(layer: Layer | null | undefined): layer is TextLayer {
  return layer?.kind === 'text'
}

// How far a shape's outline (and an arrow head) reaches past its box.
function shapeReach(layer: ShapeLayer): number {
  const width = layer.outline?.width ?? 0
  return width / 2 + (hasArrow(layer.geometry) ? width * 2.5 : 0) + 1
}

// The area a layer covers, in whole design pixels.
export function layerBounds(layer: Layer): Rect {
  if (layer.kind === 'raster' && !layer.box) return { x: layer.x, y: layer.y, width: layer.canvas.width, height: layer.canvas.height }
  const box = layer.box!
  const bounds = polygonBounds(boxCorners(box))!
  const reach = layer.kind === 'shape' ? shapeReach(layer) : layer.kind === 'text' ? textReach(layer) : 0
  return snapRect({ x: bounds.x - reach, y: bounds.y - reach, width: bounds.width + 2 * reach, height: bounds.height + 2 * reach })
}

// Lines, and pen paths that don't close, can end in an arrow head.
export function hasArrow(geometry: ShapeGeometry): boolean {
  if (!geometry.arrow) return false
  if (geometry.type === 'line') return true
  return geometry.type === 'path' && !!geometry.path && !geometry.path.closed && segmentCount(geometry.path) > 0
}

// Lines, and pen paths that don't close, are lines: they have a color and a thickness, no inside.
export function isLineShape(geometry: ShapeGeometry): boolean {
  return geometry.type === 'line' || (geometry.type === 'path' && !geometry.path?.closed)
}

// Whether a shape has an inside that can be filled.
export function canFill(geometry: ShapeGeometry): boolean {
  if (isLineShape(geometry)) return false
  return geometry.type !== 'path' || (geometry.path?.nodes.length ?? 0) > 2
}

// A pen path in a w × h shape centered on 0, 0.
export function scaledPath(geometry: ShapeGeometry, w: number, h: number): ShapePath {
  return mapPath(geometry.path ?? { nodes: [], closed: false }, (p) => ({ x: p.x * w, y: p.y * h }))
}

// The corners of a polygon or star in a w × h shape centered on 0, 0.
export function polygonPoints(geometry: ShapeGeometry, w: number, h: number): Point[] {
  const n = Math.max(3, Math.round(geometry.sides))
  const star = geometry.type === 'star'
  const count = star ? n * 2 : n
  const raw = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
    const r = star && i % 2 === 1 ? STAR_INNER : 1
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
  })
  return fittedPoints(raw, w, h)
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

// A shape made by joining or cutting shapes has holes where an even number of its outlines go around.
export function fillRule(geometry: ShapeGeometry): CanvasFillRule {
  return geometry.parts?.length ? 'evenodd' : 'nonzero'
}

// What a shape's outline can be traced into: a canvas path, or the words of an SVG path.
export type PathSink = Pick<Path2D, 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'closePath' | 'roundRect' | 'ellipse'>

// The outline of a shape, centered on 0, 0, unturned and unflipped.
export function shapePath(geometry: ShapeGeometry, w: number, h: number, outlineWidth?: number): Path2D
export function shapePath<T extends PathSink>(geometry: ShapeGeometry, w: number, h: number, outlineWidth: number, path: T): T
export function shapePath(geometry: ShapeGeometry, w: number, h: number, outlineWidth = 0, path: PathSink = new Path2D()): PathSink {
  if (geometry.type === 'rectangle') {
    path.roundRect(-w / 2, -h / 2, w, h, (geometry.corners * Math.min(w, h)) / 2)
  } else if (geometry.type === 'ellipse') {
    path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (geometry.type === 'line') {
    // With an arrow head, the line stops short of the tip so its thick end doesn't poke through.
    const end = geometry.arrow ? w / 2 - arrowLength(outlineWidth) * 0.8 : w / 2
    path.moveTo(-w / 2, 0)
    path.lineTo(Math.max(-w / 2, end), 0)
  } else if (geometry.type === 'path') {
    // With an arrow head, the path stops short of the tip, as a line does.
    const pen = scaledPath(geometry, w, h)
    tracePath(path, pen, hasArrow(geometry) ? trimForArrow(pen, arrowLength(outlineWidth) * 0.8) : 1)
    for (const part of geometry.parts ?? []) tracePath(path, mapPath(part, (p) => ({ x: p.x * w, y: p.y * h })))
  } else {
    polygonPoints(geometry, w, h).forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    path.closePath()
  }
  return path
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
  if (canFill(geometry)) {
    if (fill.kind === 'color') {
      ctx.fillStyle = fill.color
      ctx.fill(path, fillRule(geometry))
    } else if (fill.kind === 'gradient') {
      ctx.fillStyle = canvasGradient(ctx, fill.gradient, w, h)
      // An arrow's path stops short, so the fill uses the whole path.
      ctx.fill(hasArrow(geometry) ? shapePath({ ...geometry, arrow: false }, w, h) : path, fillRule(geometry))
    } else if (fill.kind === 'photo') {
      ctx.save()
      ctx.clip(path, fillRule(geometry))
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
    ctx.lineCap = isLineShape(geometry) ? 'round' : 'butt'
    const dash = outlineDash(outline)
    if (dash) {
      ctx.setLineDash(dash.pattern)
      ctx.lineCap = dash.cap
    }
    ctx.stroke(path)
    ctx.setLineDash([])
    if (hasArrow(geometry)) {
      const length = arrowLength(outline.width)
      // The tip is at the end, pointing the way the line goes there.
      let tip = { x: w / 2, y: 0 }
      let dir = { x: 1, y: 0 }
      if (geometry.type === 'path') {
        const pen = scaledPath(geometry, w, h)
        tip = pen.nodes[pen.nodes.length - 1]
        dir = endDirection(pen)
      }
      const back = { x: tip.x - dir.x * length, y: tip.y - dir.y * length }
      const side = { x: -dir.y * length * 0.6, y: dir.x * length * 0.6 }
      ctx.fillStyle = outline.color
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(back.x + side.x, back.y + side.y)
      ctx.lineTo(back.x - side.x, back.y - side.y)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

// The gaps in a dashed or dotted outline, sized by its thickness so it looks the same at any size:
// dashes three times as long as the line is thick, and round dots with room between them.
export function outlineDash(outline: ShapeOutline): { pattern: number[]; cap: CanvasLineCap } | null {
  const w = outline.width
  if (outline.dash === 'dashed') return { pattern: [w * 3, w * 2], cap: 'butt' }
  if (outline.dash === 'dotted') return { pattern: [0, w * 2], cap: 'round' }
  return null
}

// The layer's frame: where the unit square (0, 0 to 1, 1) lands in the design. Its box, or for plain
// pixels the area they cover. Hidden parts are kept in it, so they follow the layer around.
export function layerFrame(layer: Layer): Affine {
  if (layer.kind === 'raster' && !layer.box) return { a: layer.canvas.width, b: 0, c: 0, d: layer.canvas.height, e: layer.x, f: layer.y }
  const box = layer.box!
  // A line has no height; its frame gets a little, so hidden parts still have somewhere to be.
  const at = (v: number) => (v < 0 ? -1 : 1) * Math.max(Math.abs(v), 1)
  return boxMatrix({ ...box, width: at(box.width), height: at(box.height) }, 1, 1)
}

// Where the canvas of hidden parts lands in the design.
export function hidePlacement(layer: Layer, hide: LayerHide): Affine {
  const { canvas, rect } = hide
  return multiplyAffine(layerFrame(layer), { a: rect.width / canvas.width, b: 0, c: 0, d: rect.height / canvas.height, e: rect.x, f: rect.y })
}

// Draws with the layer's hidden parts taken away: `draw` paints onto a canvas of its own, and the
// hidden parts are rubbed out of that before it goes onto `ctx`. `bounds` is what `draw` covers.
export function drawHidden(ctx: CanvasRenderingContext2D, layer: Layer, bounds: Rect, draw: (ctx: CanvasRenderingContext2D) => void): void {
  const hide = layer.hide
  if (!hide) {
    draw(ctx)
    return
  }
  const m = ctx.getTransform()
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map((p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }))
  const area = polygonBounds(corners)
  const seen = area && intersectRect(snapRect({ x: area.x - 1, y: area.y - 1, width: area.width + 2, height: area.height + 2 }), { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height })
  if (!seen || seen.width <= 0 || seen.height <= 0) return
  const own = hiddenCanvas(seen.width, seen.height)
  const octx = getContext2d(own)
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.clearRect(0, 0, seen.width, seen.height)
  octx.globalAlpha = 1
  octx.globalCompositeOperation = 'source-over'
  octx.imageSmoothingEnabled = ctx.imageSmoothingEnabled
  octx.imageSmoothingQuality = ctx.imageSmoothingQuality
  octx.setTransform(m.a, m.b, m.c, m.d, m.e - seen.x, m.f - seen.y)
  draw(octx)
  const p = hidePlacement(layer, hide)
  octx.globalCompositeOperation = 'destination-out'
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.transform(p.a, p.b, p.c, p.d, p.e, p.f)
  octx.drawImage(hide.canvas, 0, 0)
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.globalCompositeOperation = 'source-over'
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(own, 0, 0, seen.width, seen.height, seen.x, seen.y, seen.width, seen.height)
  ctx.restore()
  releaseHidden(own)
}

// Canvases for drawing hidden layers, reused so the screen doesn't make new ones on every frame.
// A layer drawn while another is being drawn (inside effects) takes a second one.
const hiddenPool: HTMLCanvasElement[] = []
function hiddenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = hiddenPool.pop() ?? createCanvas(width, height)
  if (canvas.width < width || canvas.height < height) {
    canvas.width = Math.max(canvas.width, width)
    canvas.height = Math.max(canvas.height, height)
  }
  return canvas
}
function releaseHidden(canvas: HTMLCanvasElement) {
  // Very big ones are let go, so a poster doesn't keep a huge canvas around.
  if (hiddenPool.length < 2 && canvas.width * canvas.height <= 4096 * 4096) hiddenPool.push(canvas)
}

// Draws what's on a layer (without its adjustments or opacity), in design coordinates. Hidden parts
// stay hidden.
export function drawLayerContent(ctx: CanvasRenderingContext2D, layer: Layer): void {
  if (layer.hide) {
    drawHidden(ctx, layer, layerBounds(layer), (c) => drawOwnContent(c, layer))
    return
  }
  drawOwnContent(ctx, layer)
}

// Everything on a layer, hidden parts too.
export function drawOwnContent(ctx: CanvasRenderingContext2D, layer: Layer): void {
  if (layer.kind === 'shape') {
    drawShape(ctx, layer)
    return
  }
  if (layer.kind === 'text') {
    drawText(ctx, layer)
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

// A layer's content as plain pixels on a canvas that sits straight in the design. `all` keeps the
// hidden parts too.
function toPixels(layer: Layer, all = false): { canvas: HTMLCanvasElement; x: number; y: number } {
  const rect = layerBounds(layer)
  const width = Math.max(1, Math.min(MAX_LAYER_SIDE, rect.width))
  const height = Math.max(1, Math.min(MAX_LAYER_SIDE, rect.height))
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  // The shift is undone afterwards: the canvas keeps its context, and later painting on it expects
  // a fresh one.
  ctx.save()
  ctx.translate(-rect.x, -rect.y)
  if (all) drawOwnContent(ctx, layer)
  else drawLayerContent(ctx, layer)
  ctx.restore()
  return { canvas, x: rect.x, y: rect.y }
}

// A resized or turned layer, settled into plain pixels so it can be painted on. Layers that are
// already plain come back as they are.
// Hidden parts stay hidden in the same places.
export function settleLayer(layer: PixelLayer): PixelLayer {
  if (!layer.box) return layer
  const settled: PixelLayer = { ...layer, ...toPixels(layer, true), box: null }
  return layer.hide ? { ...settled, hide: refitHide(layer.hide, layerFrame(layer), layerFrame(settled)) } : settled
}

// Hidden parts kept in one frame, moved into another without moving in the design: a pixel layer
// that grew, or a turned picture settled into plain pixels.
export function refitHide(hide: LayerHide, from: Affine, to: Affine): LayerHide {
  const { canvas, rect } = hide
  // Old frame to new frame.
  const map = multiplyAffine(invertAffine(to), from)
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((p) => applyAffine(map, p))
  const next = polygonBounds(corners)!
  // Same detail as before, about.
  const detail = Math.sqrt((canvas.width * canvas.height) / Math.max(1e-12, rect.width * rect.height * Math.abs(map.a * map.d - map.b * map.c)))
  const width = Math.max(1, Math.min(MAX_HIDE_SIDE, Math.round(next.width * detail)))
  const height = Math.max(1, Math.min(MAX_HIDE_SIDE, Math.round(next.height * detail)))
  const out = createCanvas(width, height)
  const ctx = getContext2d(out)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // New canvas pixels to new frame, then to old frame, then to old canvas pixels.
  const toOld = multiplyAffine(
    { a: canvas.width / rect.width, b: 0, c: 0, d: canvas.height / rect.height, e: (-rect.x * canvas.width) / rect.width, f: (-rect.y * canvas.height) / rect.height },
    multiplyAffine(invertAffine(map), { a: next.width / width, b: 0, c: 0, d: next.height / height, e: next.x, f: next.y }),
  )
  const back = invertAffine(toOld)
  ctx.setTransform(back.a, back.b, back.c, back.d, back.e, back.f)
  ctx.drawImage(canvas, 0, 0)
  return { canvas: out, rect: next }
}

// Hidden parts are kept at most this many pixels across: they're soft, so more would only fill memory.
export const MAX_HIDE_SIDE = 2048

// Shapes, text and settled copies never change in place, so each is worked out once (text again
// when a font arrives).
const pixelCopies = new WeakMap<Layer, { version: number; copy: PixelLayer }>()

// Any layer as plain pixels that sit straight in the design, for the tools that work on pixels.
// Plain pixel layers come back as they are (not copied).
export function layerPixels(layer: Layer): PixelLayer {
  if (layer.kind === 'raster' && !layer.box && !layer.hide) return layer
  const version = layerVersion(layer)
  const cached = pixelCopies.get(layer)
  if (cached && cached.version === version) return cached.copy
  const { canvas, x, y } = toPixels(layer)
  const copy: PixelLayer = { id: layer.id, kind: 'raster', name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked, adjust: layer.adjust, canvas, x, y, box: null }
  pixelCopies.set(layer, { version, copy })
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
  if (layer.kind === 'text') {
    // Anywhere in the text's box, so words are easy to click even between letters.
    const { box } = layer
    const dx = point.x - box.cx
    const dy = point.y - box.cy
    const cos = Math.cos(-box.rotation)
    const sin = Math.sin(-box.rotation)
    return Math.abs(dx * cos - dy * sin) <= Math.abs(box.width) / 2 + slack && Math.abs(dx * sin + dy * cos) <= Math.abs(box.height) / 2 + slack
  }
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
    if (canFill(geometry) && fill.kind !== 'none' && ctx.isPointInPath(path, x, y, fillRule(geometry))) return true
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
