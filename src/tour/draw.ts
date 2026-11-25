import { createId } from '../editor/document.ts'
import { insertLayerAboveActive } from '../editor/layers.ts'
import type { EditorDocument, ShapeLayer, ShapeType } from '../editor/types.ts'
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
    geometry: { type: s.type, corners: s.corners ?? 0, sides: s.sides ?? (s.type === 'star' ? 5 : 6), arrow: false },
    fill: s.type === 'line' ? { kind: 'none' } : { kind: 'color', color: s.color },
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
