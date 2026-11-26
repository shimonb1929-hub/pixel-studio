import { createId } from '../editor/document.ts'
import type { Gradient } from '../editor/gradient.ts'
import type { ShapePath } from '../editor/path.ts'
import { insertLayerAboveActive } from '../editor/layers.ts'
import { defaultShadow, effectUnit, NO_EFFECTS } from '../editor/effects.ts'
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
