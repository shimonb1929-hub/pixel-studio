import { polygonPoints } from '../editor/objects.ts'
import { geometryToPath, mapPath, pathBounds, pathInDesign } from '../editor/path.ts'
import type { ShapeLayer, TextLayer } from '../editor/types.ts'
import { topOfPath } from './textCurve.ts'
import { fitText } from './textLayer.ts'

// Puts text along the edge of a shape: the words follow the shape's outline, starting out centered
// at its top. The shape itself stays as it is, so it can be kept (a ring of words around a
// circle) or deleted.
export function textAlongShape(text: TextLayer, shape: ShapeLayer): TextLayer {
  const w = Math.abs(shape.box.width)
  const h = Math.abs(shape.box.height)
  const own = geometryToPath(shape.geometry, Math.max(w, 1e-6), Math.max(h, 1e-6), polygonPoints(shape.geometry, w, h))
  const design = pathInDesign(own, shape.box)
  const b = pathBounds(design) ?? { minX: shape.box.cx, minY: shape.box.cy, maxX: shape.box.cx, maxY: shape.box.cy }
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const path = mapPath(design, (p) => ({ x: p.x - cx, y: p.y - cy }))
  const { bend: _bend, ...style } = text.style
  void _bend
  return fitText({ ...text, style, wrap: false, along: { path, ...topOfPath(path) }, box: { cx, cy, width: 1, height: 1, rotation: 0 } })
}

// Straight text again, where the curved text was.
export function straighten(text: TextLayer): TextLayer {
  const { bend: _bend, ...style } = text.style
  void _bend
  const { along: _along, ...rest } = text
  void _along
  const fitted = fitText({ ...rest, style })
  return { ...fitted, box: { ...fitted.box, cx: text.box.cx, cy: text.box.cy } }
}
