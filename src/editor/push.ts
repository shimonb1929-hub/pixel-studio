import { createCanvas, getContext2d } from './document.ts'
import { clampRect, unionRect, type Rect } from './geometry.ts'
import { copyRegion, restoreRegion, type InputPoint, type StrokeResult } from './stroke.ts'
import type { PixelLayer, Point } from './types.ts'

// Push and pull (pro: Liquify): brush over a photo to push its pixels along, like smudging wet
// paint, or to make a part a little bigger or smaller. Nothing is painted on: the photo's own
// pixels move, smoothly and softly toward the brush's edge.

export type PushMode = 'push' | 'bigger' | 'smaller'

export interface PushSettings {
  // Across, in design pixels.
  size: number
  // 0 to 1: how far the pixels follow the brush.
  strength: number
  mode: PushMode
}

export const DEFAULT_PUSH: PushSettings = { size: 120, strength: 0.6, mode: 'push' }

// How much of a step the pixels follow, at the middle of the brush (1) and out to its edge (0).
function falloff(distance: number, radius: number): number {
  if (distance >= radius) return 0
  const k = 1 - (distance * distance) / (radius * radius)
  return k * k
}

// One brushing, from pointer down to pointer up. The pixels move on a copy (the preview), which
// is written into the layer when it ends; points come in design coordinates.
export class PushSession {
  readonly layerId: string
  readonly preview: HTMLCanvasElement
  readonly x: number
  readonly y: number
  private readonly layer: PixelLayer
  private readonly settings: PushSettings
  private readonly ctx: CanvasRenderingContext2D
  private last: Point | null = null
  private changed: Rect | null = null
  private total: Rect | null = null

  constructor(layer: PixelLayer, settings: PushSettings) {
    this.layerId = layer.id
    this.layer = layer
    this.settings = settings
    this.x = layer.x
    this.y = layer.y
    this.preview = createCanvas(layer.canvas.width, layer.canvas.height)
    const ctx = this.preview.getContext('2d', { willReadFrequently: true })
    this.ctx = ctx ?? getContext2d(this.preview)
    this.ctx.drawImage(layer.canvas, 0, 0)
  }

  get endPoint(): Point | null {
    return this.last && { x: this.last.x + this.x, y: this.last.y + this.y }
  }

  private local(point: Point): Point {
    return { x: point.x - this.x, y: point.y - this.y }
  }

  begin(point: InputPoint): void {
    this.last = this.local(point)
    // Bigger and smaller start working right where the brush goes down.
    if (this.settings.mode !== 'push') this.dab(this.last, { x: 0, y: 0 })
  }

  moveTo(point: InputPoint): void {
    if (!this.last) return this.begin(point)
    const to = this.local(point)
    const radius = this.settings.size / 2
    const distance = Math.hypot(to.x - this.last.x, to.y - this.last.y)
    // Small steps, so the pixels follow smoothly and never tear.
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 5)))
    let from = this.last
    for (let i = 1; i <= steps; i++) {
      const at = { x: this.last.x + ((to.x - this.last.x) * i) / steps, y: this.last.y + ((to.y - this.last.y) * i) / steps }
      this.dab(at, { x: at.x - from.x, y: at.y - from.y })
      from = at
    }
    this.last = to
  }

  lineTo(point: InputPoint): void {
    this.moveTo(point)
  }

  // Moves the pixels under the brush at `center`, which just moved by `step`.
  private dab(center: Point, step: Point): void {
    const { mode, strength } = this.settings
    const radius = Math.max(2, this.settings.size / 2)
    const reach = radius + Math.hypot(step.x, step.y) + 2
    const area = clampRect(
      { x: Math.floor(center.x - reach), y: Math.floor(center.y - reach), width: Math.ceil(reach * 2) + 1, height: Math.ceil(reach * 2) + 1 },
      this.preview.width,
      this.preview.height,
    )
    if (!area || (mode === 'push' && step.x === 0 && step.y === 0)) return
    const source = this.ctx.getImageData(area.x, area.y, area.width, area.height)
    const out = new ImageData(new Uint8ClampedArray(source.data), area.width, area.height)
    const from = source.data
    const w = area.width
    const h = area.height
    // Reads the picture at a spot between pixels, blending the four around it.
    const sample = (sx: number, sy: number, into: number) => {
      const fx = Math.min(w - 1, Math.max(0, sx))
      const fy = Math.min(h - 1, Math.max(0, sy))
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const ax = fx - x0
      const ay = fy - y0
      const i00 = (y0 * w + x0) * 4
      const i10 = (y0 * w + x1) * 4
      const i01 = (y1 * w + x0) * 4
      const i11 = (y1 * w + x1) * 4
      for (let c = 0; c < 4; c++) {
        const top = from[i00 + c] + (from[i10 + c] - from[i00 + c]) * ax
        const bottom = from[i01 + c] + (from[i11 + c] - from[i01 + c]) * ax
        out.data[into + c] = top + (bottom - top) * ay
      }
    }
    const cx = center.x - area.x
    const cy = center.y - area.y
    // Bigger and smaller work a little each step, more with a stronger brush.
    const grow = (mode === 'bigger' ? -1 : 1) * 0.08 * strength
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const f = falloff(Math.hypot(dx, dy), radius)
        if (f === 0) continue
        let sx: number
        let sy: number
        if (mode === 'push') {
          sx = x - step.x * f * strength
          sy = y - step.y * f * strength
        } else {
          sx = cx + dx * (1 + grow * f) - 0.5
          sy = cy + dy * (1 + grow * f) - 0.5
        }
        sample(sx, sy, (y * w + x) * 4)
      }
    }
    this.ctx.putImageData(out, area.x, area.y)
    this.changed = unionRect(this.changed, area)
    this.total = unionRect(this.total, area)
  }

  // True when something moved since the last time.
  flush(): boolean {
    const changed = !!this.changed
    this.changed = null
    return changed
  }

  // Ends the brushing and writes it into the layer. Null if nothing moved.
  finish(): StrokeResult | null {
    if (!this.total) return null
    const { x, y } = this.total
    const before = copyRegion(this.layer.canvas, this.total)
    const after = copyRegion(this.preview, this.total)
    restoreRegion(this.layer.canvas, after, x, y)
    return { x, y, before, after }
  }
}
