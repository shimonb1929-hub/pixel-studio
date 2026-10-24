import type { Rect } from './geometry.ts'
import type { Layer, PhotoFill, Point, ShapeLayer, TextLayer } from './types.ts'

// A photo inside a shape or inside letters: where it sits, and how it's painted.

// Where a photo sits inside a w × h shape or text box centered on 0, 0: always covering it,
// enlarged by zoom, slid by x, y.
export function photoPlacement(fill: PhotoFill, w: number, h: number): Rect {
  const { canvas } = fill
  const scale = Math.max(w / canvas.width, h / canvas.height) * fill.zoom
  const width = canvas.width * scale
  const height = canvas.height * scale
  return { x: -width / 2 + (fill.x * (width - w)) / 2, y: -height / 2 + (fill.y * (height - h)) / 2, width, height }
}

// The photo as something to paint letters with, for a w × h box whose middle is at cx, cy.
export function photoPattern(ctx: CanvasRenderingContext2D, fill: PhotoFill, w: number, h: number, cx: number, cy: number, then?: DOMMatrix): CanvasPattern | string {
  const pattern = ctx.createPattern(fill.canvas, 'no-repeat')
  if (!pattern) return '#000000'
  const place = photoPlacement(fill, w, h)
  const at = new DOMMatrix([place.width / fill.canvas.width, 0, 0, place.height / fill.canvas.height, cx + place.x, cy + place.y])
  pattern.setTransform(then ? then.multiply(at) : at)
  return pattern
}

// The photo inside a shape or text, if there is one.
export function layerPhoto(layer: Layer | null | undefined): PhotoFill | null {
  if (layer?.kind === 'shape') return layer.fill.kind === 'photo' ? layer.fill : null
  if (layer?.kind === 'text') return layer.photo ?? null
  return null
}

// The same shape or text with the photo inside it changed (or taken out, for text, with null).
export function withPhoto<T extends Layer>(layer: T, photo: PhotoFill | null): T {
  if (layer.kind === 'shape') return photo ? { ...layer, fill: { kind: 'photo', ...photo } } : layer
  if (layer.kind === 'text') {
    if (photo) return { ...layer, photo }
    const { photo: _gone, ...rest } = layer
    return rest as T
  }
  return layer
}

// A photo on the design, put inside a shape or text so it shows just where it was (made bigger
// only if it doesn't cover all of it). `canvas` is the photo's pixels, shown `width` × `height`
// with its middle at `middle`.
export function photoWhereItWas(target: ShapeLayer | TextLayer, canvas: HTMLCanvasElement, middle: Point, width: number, height: number): PhotoFill {
  const { box } = target
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  // The photo's middle in the target's own directions, from its middle.
  const dx = middle.x - box.cx
  const dy = middle.y - box.cy
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  const mx = (dx * cos + dy * sin) * (box.width < 0 ? -1 : 1)
  const my = (-dx * sin + dy * cos) * (box.height < 0 ? -1 : 1)
  const cover = Math.max(w / canvas.width, h / canvas.height)
  const zoom = Math.min(20, Math.max(1, Math.max(width / canvas.width, height / canvas.height) / cover))
  const pw = canvas.width * cover * zoom
  const ph = canvas.height * cover * zoom
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  return { canvas, zoom, x: pw - w > 1e-9 ? clamp((2 * mx) / (pw - w)) : 0, y: ph - h > 1e-9 ? clamp((2 * my) / (ph - h)) : 0 }
}
