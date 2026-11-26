import { createId, createLayer } from '../editor/document.ts'
import { LOOKS } from '../editor/adjust.ts'
import type { Gradient } from '../editor/gradient.ts'
import type { ShapePath } from '../editor/path.ts'
import { insertLayerAboveActive } from '../editor/layers.ts'
import { defaultGlow, defaultShadow, effectUnit, NO_EFFECTS } from '../editor/effects.ts'
import type { EditorDocument, ShapeLayer, ShapeType, TextLayer } from '../editor/types.ts'
import { DEFAULT_FONT, loadFont } from '../text/fonts.ts'
import { DEFAULT_TEXT_STYLE } from '../text/presets.ts'
import { fitText } from '../text/textLayer.ts'
import type { TourHost } from './tour.ts'

// Shapes the tours put on the design while the guide talks. Places and sizes are shares of the
// page (0 to 1 across its width and height), so a tour looks the same on any size of design.
export interface TourShape {
  name: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  color: string
  corners?: number
  sides?: number
  turn?: number
  outline?: { color: string; width: number }
  // Curve shapes: their points, from -0.5 to 0.5 across the box.
  path?: ShapePath
  gradient?: Gradient
}

export function shapeLayer(doc: EditorDocument, s: TourShape): ShapeLayer {
  const W = doc.width
  const H = doc.height
  return {
    id: createId('layer'),
    kind: 'shape',
    name: s.name,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: s.x * W, cy: s.y * H, width: s.w * W, height: s.h * H, rotation: ((s.turn ?? 0) * Math.PI) / 180 },
    geometry: { type: s.type, corners: s.corners ?? 0, sides: s.sides ?? (s.type === 'star' ? 5 : 6), arrow: s.type === 'line' && !!s.outline, ...(s.path ? { path: s.path } : {}) },
    fill: s.type === 'line' ? { kind: 'none' } : s.gradient ? { kind: 'gradient', gradient: s.gradient } : { kind: 'color', color: s.color },
    outline: s.outline ? { color: s.outline.color, width: Math.max(1, Math.round(s.outline.width * W)) } : s.type === 'line' ? { color: s.color, width: Math.max(1, Math.round(0.006 * W)) } : null,
  }
}

// Adds shapes as one undo step and picks the last one, so its handles show what was added.
export function addShapes(host: TourHost, label: string, shapes: TourShape[]) {
  let lastId = ''
  host.change(label, (doc) => {
    let next = doc
    for (const s of shapes) {
      const layer = shapeLayer(next, s)
      lastId = layer.id
      next = insertLayerAboveActive(next, layer)
    }
    return next
  })
  if (lastId) host.select(lastId)
}

// Slides the named layers across the page bit by bit, so the guide can show something moving.
export function glide(host: TourHost, label: string, names: string[], dx: number, dy: number, ms = 1200) {
  const key = createId('glide')
  const start = performance.now()
  let moved = 0
  const step = () => {
    const doc = host.getDoc()
    if (!doc) return
    const fraction = Math.min(1, (performance.now() - start) / ms)
    const eased = 1 - (1 - fraction) ** 3
    const by = eased - moved
    moved = eased
    host.change(
      label,
      (d) => ({
        ...d,
        layers: d.layers.map((l) =>
          names.includes(l.name) && 'box' in l && l.kind !== 'raster' ? { ...l, box: { ...l.box, cx: l.box.cx + by * dx * d.width, cy: l.box.cy + by * dy * d.height } } : l,
        ),
      }),
      key,
    )
    if (fraction < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export interface TourText {
  name: string
  text: string
  x: number
  y: number
  // Width of the paragraph box, as a share of the page's width.
  w: number
  // Letter size, as a share of the page's width.
  size: number
  weight: number
  color: string
}

// Adds a centered paragraph of words, picked, as one undo step. Its font is fetched first if needed
// (the words show right away and sharpen into the font as it arrives).
export function addText(host: TourHost, label: string, words: TourText) {
  let id = ''
  host.change(label, (doc) => {
    const style = { ...DEFAULT_TEXT_STYLE, font: DEFAULT_FONT, size: Math.round(words.size * doc.width), weight: words.weight, color: words.color, align: 'center' as const }
    const layer: TextLayer = {
      id: createId('layer'),
      kind: 'text',
      name: words.name,
      visible: true,
      opacity: 1,
      locked: false,
      adjust: null,
      box: { cx: words.x * doc.width, cy: words.y * doc.height, width: words.w * doc.width, height: style.size * style.lineHeight, rotation: 0 },
      text: words.text,
      style,
      wrap: true,
    }
    const fitted = fitText(layer)
    id = layer.id
    return insertLayerAboveActive(doc, { ...fitted, box: { ...fitted.box, cx: layer.box.cx, cy: layer.box.cy } })
  })
  if (id) host.select(id)
  void loadFont({ ...DEFAULT_TEXT_STYLE, font: DEFAULT_FONT, weight: words.weight }, words.text)
}

// A soft shadow under the named layer, the way the Effects panel adds one.
export function addShadow(host: TourHost, label: string, name: string) {
  host.change(label, (doc) => ({
    ...doc,
    layers: doc.layers.map((l) => (l.name === name ? { ...l, effects: { ...(l.effects ?? NO_EFFECTS), shadow: defaultShadow(effectUnit(doc.width, doc.height)) } } : l)),
  }))
}

export function setPageColor(host: TourHost, label: string, color: string) {
  host.change(label, (doc) => ({ ...doc, background: color }))
}

export function pickNamed(host: TourHost, name: string) {
  const layer = host.getDoc()?.layers.find((l) => l.name === name)
  if (layer) host.select(layer.id)
}

// Changes the named layers' boxes bit by bit (moving, resizing, turning), as one undo step.
// `to` gets the box as it was and how far along the change is (0 to 1, eased).
export function animate(host: TourHost, label: string, names: string[], to: (box: { cx: number; cy: number; width: number; height: number; rotation: number }, e: number, doc: EditorDocument) => { cx: number; cy: number; width: number; height: number; rotation: number }, ms = 1200) {
  const key = createId('animate')
  const doc = host.getDoc()
  if (!doc) return
  const start = new Map(doc.layers.filter((l) => names.includes(l.name) && l.kind !== 'raster').map((l) => [l.id, { ...(l as ShapeLayer).box }]))
  const began = performance.now()
  const frame = () => {
    const fraction = Math.min(1, (performance.now() - began) / ms)
    const e = 1 - (1 - fraction) ** 3
    host.change(label, (d) => ({ ...d, layers: d.layers.map((l) => (start.has(l.id) && l.kind !== 'raster' ? { ...l, box: to(start.get(l.id)!, e, d) } : l)) }), key)
    if (fraction < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// A new, empty layer of pixels covering the page, picked, to paint on.
export function addPaintLayer(host: TourHost, label: string, name: string): string {
  let id = ''
  host.change(label, (doc) => {
    const layer = { ...createLayer(name, doc.width, doc.height) }
    id = layer.id
    return insertLayerAboveActive(doc, layer)
  })
  if (id) host.select(id)
  return id
}

// Paints a smooth stroke through points (shares of the page) bit by bit, the way a hand would.
// With `erase`, it rubs paint out instead.
export function stroke(host: TourHost, label: string, layerName: string, points: [number, number][], color: string, width: number, ms = 1200, erase = false) {
  const doc = host.getDoc()
  const layer = doc?.layers.find((l) => l.name === layerName && l.kind === 'raster')
  if (!doc || !layer) return
  const W = doc.width
  const H = doc.height
  const pts = points.map(([x, y]) => ({ x: x * W, y: y * H }))
  const size = width * W
  const steps = 8
  let done = 0
  const began = performance.now()
  const frame = () => {
    const upto = Math.min(steps, Math.ceil(((performance.now() - began) / ms) * steps))
    while (done < upto) {
      const from = Math.floor((done / steps) * (pts.length - 1))
      const to = Math.min(pts.length - 1, Math.ceil(((done + 1) / steps) * (pts.length - 1)))
      const part = pts.slice(from, to + 1)
      done++
      if (part.length < 2) continue
      const xs = part.map((p) => p.x)
      const ys = part.map((p) => p.y)
      const area = { x: Math.min(...xs) - size, y: Math.min(...ys) - size, width: Math.max(...xs) - Math.min(...xs) + size * 2, height: Math.max(...ys) - Math.min(...ys) + size * 2 }
      host.paint(label, layer.id, area, (ctx, l) => {
        ctx.translate(-l.x, -l.y)
        ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
        ctx.strokeStyle = color
        ctx.lineWidth = size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(part[0].x, part[0].y)
        for (let i = 1; i < part.length; i++) {
          const mid = { x: (part[i - 1].x + part[i].x) / 2, y: (part[i - 1].y + part[i].y) / 2 }
          ctx.quadraticCurveTo(part[i - 1].x, part[i - 1].y, mid.x, mid.y)
        }
        ctx.lineTo(part[part.length - 1].x, part[part.length - 1].y)
        ctx.stroke()
      })
    }
    if (done < steps) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// Paints several short strokes one after another (like blades of grass), each through its points.
// Strokes that come due in the same moment are painted together, as one undo step.
export function strokes(host: TourHost, label: string, layerName: string, paths: [number, number][][], color: (index: number) => string, width: number, ms = 1500) {
  const doc = host.getDoc()
  const layer = doc?.layers.find((l) => l.name === layerName && l.kind === 'raster')
  if (!doc || !layer) return
  const W = doc.width
  const H = doc.height
  const size = width * W
  let done = 0
  const began = performance.now()
  const frame = () => {
    const upto = Math.min(paths.length, Math.ceil(((performance.now() - began) / ms) * paths.length))
    if (upto > done) {
      const batch = paths.slice(done, upto).map((path) => path.map(([x, y]) => ({ x: x * W, y: y * H })))
      const first = done
      done = upto
      const xs = batch.flat().map((p) => p.x)
      const ys = batch.flat().map((p) => p.y)
      const area = { x: Math.min(...xs) - size, y: Math.min(...ys) - size, width: Math.max(...xs) - Math.min(...xs) + size * 2, height: Math.max(...ys) - Math.min(...ys) + size * 2 }
      host.paint(label, layer.id, area, (ctx, l) => {
        ctx.translate(-l.x, -l.y)
        ctx.lineWidth = size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        batch.forEach((pts, i) => {
          ctx.strokeStyle = color(first + i)
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let k = 1; k < pts.length - 1; k++) ctx.quadraticCurveTo(pts[k].x, pts[k].y, (pts[k].x + pts[k + 1].x) / 2, (pts[k].y + pts[k + 1].y) / 2)
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
          ctx.stroke()
        })
      })
    }
    if (done < paths.length) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// Changes the named layers in one undo step.
export function changeNamed(host: TourHost, label: string, name: string, update: (layer: EditorDocument['layers'][number], doc: EditorDocument) => EditorDocument['layers'][number]) {
  host.change(label, (doc) => ({ ...doc, layers: doc.layers.map((l) => (l.name === name ? update(l, doc) : l)) }))
}

export function addGlow(host: TourHost, label: string, name: string, color?: string) {
  changeNamed(host, label, name, (l, doc) => {
    const glow = defaultGlow(effectUnit(doc.width, doc.height))
    return { ...l, effects: { ...(l.effects ?? NO_EFFECTS), glow: color ? { ...glow, color } : glow } }
  })
}

// One of the ready looks from Adjust (like Black & white), kept changeable on the layer.
export function setLook(host: TourHost, label: string, name: string, lookId: string) {
  const look = LOOKS.find((l) => l.id === lookId)
  if (look) changeNamed(host, label, name, (l) => ({ ...l, adjust: look.settings }))
}

export function setFill(host: TourHost, label: string, name: string, color: string) {
  changeNamed(host, label, name, (l) => (l.kind === 'shape' ? { ...l, fill: { kind: 'color', color } } : l))
}

// Bends words into an arch (above 0) or a smile (below 0).
export function bend(host: TourHost, label: string, name: string, amount: number) {
  changeNamed(host, label, name, (l) => (l.kind === 'text' ? fitText({ ...l, style: { ...l.style, bend: amount } }) : l))
}
