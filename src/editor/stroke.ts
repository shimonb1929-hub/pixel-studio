import type { BrushSettings } from './brushes.ts'
import { hexToRgb, type Rgb } from './color.ts'
import { createCanvas, getContext2d } from './document.ts'
import { clampRect, unionRect, type Rect } from './geometry.ts'
import type { Layer, Point } from './types.ts'

export interface InputPoint extends Point {
  // 0–1. A mouse always reports 1; a drawing tablet reports how hard you press.
  pressure: number
}

export type StrokeMode = 'paint' | 'erase'

// Dabs are placed this far apart, as a fraction of the brush diameter.
const SPACING = 0.1
// The lightest pen touch still draws at a quarter of the full size.
const MIN_PRESSURE_SCALE = 0.25

// Paints evenly spaced round dabs along a path. Used by real strokes and by the brush previews.
export class DabPainter {
  private last: InputPoint | null = null
  // Distance still to travel before the next dab.
  private carry = 0
  private painted: Rect | null = null
  private readonly ctx: CanvasRenderingContext2D
  private readonly settings: BrushSettings
  private readonly solid: string
  private readonly clear: string

  constructor(ctx: CanvasRenderingContext2D, settings: BrushSettings, rgb: Rgb) {
    this.ctx = ctx
    this.settings = settings
    this.solid = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`
    this.clear = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`
  }

  begin(point: InputPoint): void {
    this.last = point
    this.dab(point)
    this.carry = this.spacing(point.pressure)
  }

  lineTo(point: InputPoint): void {
    const from = this.last
    if (!from) {
      this.begin(point)
      return
    }
    const dx = point.x - from.x
    const dy = point.y - from.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0) return
    let travelled = this.carry
    while (travelled <= distance) {
      const k = travelled / distance
      const pressure = from.pressure + (point.pressure - from.pressure) * k
      this.dab({ x: from.x + dx * k, y: from.y + dy * k, pressure })
      travelled += this.spacing(pressure)
    }
    this.carry = travelled - distance
    this.last = point
  }

  // The area painted since the last call.
  takePainted(): Rect | null {
    const painted = this.painted
    this.painted = null
    return painted
  }

  private radius(pressure: number): number {
    const scale = this.settings.pressure ? MIN_PRESSURE_SCALE + (1 - MIN_PRESSURE_SCALE) * pressure : 1
    return Math.max(0.5, (this.settings.size * scale) / 2)
  }

  private spacing(pressure: number): number {
    return Math.max(0.5, this.radius(pressure) * 2 * SPACING)
  }

  private dab({ x, y, pressure }: InputPoint): void {
    const { ctx, settings } = this
    const radius = this.radius(pressure)
    ctx.globalAlpha = settings.flow
    if (settings.softness <= 0.01 || radius < 1) {
      ctx.fillStyle = this.solid
    } else {
      const gradient = ctx.createRadialGradient(x, y, radius * (1 - settings.softness), x, y, radius)
      gradient.addColorStop(0, this.solid)
      gradient.addColorStop(1, this.clear)
      ctx.fillStyle = gradient
    }
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    this.painted = unionRect(this.painted, { x: x - radius - 1, y: y - radius - 1, width: radius * 2 + 2, height: radius * 2 + 2 })
  }
}

// x and y are in the layer's own coordinates.
export interface StrokeResult {
  x: number
  y: number
  // Copies of the changed area before and after the stroke, kept for undo and redo.
  before: HTMLCanvasElement
  after: HTMLCanvasElement
}

// Copies part of a canvas. Canvas-to-canvas copies stay on the graphics card, which is much
// faster than reading pixels back into memory.
export function copyRegion(source: HTMLCanvasElement, { x, y, width, height }: Rect): HTMLCanvasElement {
  const copy = createCanvas(width, height)
  getContext2d(copy).drawImage(source, x, y, width, height, 0, 0, width, height)
  return copy
}

// Puts a copied region back exactly as it was, replacing whatever is there now.
export function restoreRegion(target: HTMLCanvasElement, region: HTMLCanvasElement, x: number, y: number): void {
  const ctx = getContext2d(target)
  ctx.clearRect(x, y, region.width, region.height)
  ctx.drawImage(region, x, y)
}

// Reused between strokes, so drawing on a big poster doesn't allocate huge canvases each time.
const pool = { stroke: null as HTMLCanvasElement | null, preview: null as HTMLCanvasElement | null, masked: null as HTMLCanvasElement | null }

function pooled(key: keyof typeof pool, width: number, height: number): HTMLCanvasElement {
  const canvas = pool[key]
  if (canvas && canvas.width === width && canvas.height === height) return canvas
  return (pool[key] = createCanvas(width, height))
}

// Limits painting to a selected area. The mask's alpha says how much of each pixel is selected.
export interface StrokeMask {
  canvas: HTMLCanvasElement
  // Where the mask's top-left corner sits in the design.
  x: number
  y: number
}

// One brush or eraser stroke, from pointer down to pointer up.
//
// Dabs go onto a separate stroke canvas at full strength. The preview shows the layer with the
// stroke laid on top at the brush opacity, so overlapping dabs within one stroke never build up
// darker than the opacity you chose. When the stroke ends, the preview is copied into the layer
// and the before/after pixels are kept for undo.
//
// Points come in design coordinates and are turned into the layer's own coordinates here.
export class StrokeSession {
  readonly layerId: string
  readonly preview: HTMLCanvasElement
  // Where the preview sits in the design (the same place as the layer).
  readonly x: number
  readonly y: number
  private readonly layer: Layer
  private readonly settings: BrushSettings
  private readonly mode: StrokeMode
  private readonly mask: StrokeMask | null
  private readonly stroke: HTMLCanvasElement
  private readonly masked: HTMLCanvasElement | null
  private readonly previewCtx: CanvasRenderingContext2D
  private readonly painter: DabPainter
  private readonly width: number
  private readonly height: number
  private smoothed: InputPoint | null = null
  private target: InputPoint | null = null
  private total: Rect | null = null

  constructor(layer: Layer, settings: BrushSettings, color: string, mode: StrokeMode, mask: StrokeMask | null = null) {
    this.layerId = layer.id
    this.layer = layer
    this.settings = settings
    this.mode = mode
    this.mask = mask
    this.x = layer.x
    this.y = layer.y
    this.width = layer.canvas.width
    this.height = layer.canvas.height

    this.stroke = pooled('stroke', this.width, this.height)
    this.preview = pooled('preview', this.width, this.height)
    this.masked = mask ? pooled('masked', this.width, this.height) : null

    const strokeCtx = getContext2d(this.stroke)
    strokeCtx.clearRect(0, 0, this.width, this.height)
    this.previewCtx = getContext2d(this.preview)
    this.previewCtx.clearRect(0, 0, this.width, this.height)
    this.previewCtx.drawImage(layer.canvas, 0, 0)

    this.painter = new DabPainter(strokeCtx, settings, mode === 'erase' ? { r: 0, g: 0, b: 0 } : hexToRgb(color))
  }

  // Where the stroke ended, in design coordinates.
  get endPoint(): Point | null {
    return this.target && { x: this.target.x + this.x, y: this.target.y + this.y }
  }

  begin(point: InputPoint): void {
    const local = this.local(point)
    this.smoothed = local
    this.target = local
    this.painter.begin(local)
  }

  // Follows the pointer, smoothed by the "steady hand" setting.
  moveTo(point: InputPoint): void {
    if (!this.smoothed) {
      this.begin(point)
      return
    }
    this.target = this.local(point)
    this.followTarget()
  }

  // A straight line with no smoothing, for Shift + click.
  lineTo(point: InputPoint): void {
    if (!this.smoothed) this.begin(point)
    const local = this.local(point)
    this.painter.lineTo(local)
    this.smoothed = local
    this.target = local
  }

  // Shows everything painted so far. Returns false if nothing changed.
  flush(): boolean {
    const painted = this.painter.takePainted()
    const rect = painted && clampRect(painted, this.width, this.height)
    if (!rect) return false
    this.total = unionRect(this.total, rect)
    const { x, y, width, height } = rect

    // With a selection, only the selected part of the stroke counts. It is masked into a
    // separate canvas each time, so soft selection edges don't fade further on every update.
    let source = this.stroke
    if (this.mask && this.masked) {
      const masked = getContext2d(this.masked)
      masked.save()
      masked.clearRect(x, y, width, height)
      masked.drawImage(this.stroke, x, y, width, height, x, y, width, height)
      masked.beginPath()
      masked.rect(x, y, width, height)
      masked.clip()
      masked.globalCompositeOperation = 'destination-in'
      masked.drawImage(this.mask.canvas, this.mask.x - this.x, this.mask.y - this.y)
      masked.restore()
      source = this.masked
    }

    const ctx = this.previewCtx
    ctx.save()
    ctx.clearRect(x, y, width, height)
    ctx.drawImage(this.layer.canvas, x, y, width, height, x, y, width, height)
    ctx.globalAlpha = this.settings.opacity
    ctx.globalCompositeOperation =
      this.mode === 'erase' ? 'destination-out' : this.settings.blend === 'multiply' ? 'multiply' : 'source-over'
    ctx.drawImage(source, x, y, width, height, x, y, width, height)
    ctx.restore()
    return true
  }

  // Ends the stroke and writes it into the layer. Null if it never touched the layer.
  finish(): StrokeResult | null {
    // Let a smoothed line catch up with where the pointer stopped, so it ends in the right place.
    if (this.smoothed && this.target) {
      for (let i = 0; i < 40 && Math.hypot(this.target.x - this.smoothed.x, this.target.y - this.smoothed.y) > 0.5; i++) {
        this.followTarget()
      }
      this.painter.lineTo(this.target)
    }
    this.flush()
    if (!this.total) return null

    const { x, y } = this.total
    const before = copyRegion(this.layer.canvas, this.total)
    const after = copyRegion(this.preview, this.total)
    restoreRegion(this.layer.canvas, after, x, y)
    return { x, y, before, after }
  }

  private local(point: InputPoint): InputPoint {
    return { x: point.x - this.x, y: point.y - this.y, pressure: point.pressure }
  }

  private followTarget(): void {
    const from = this.smoothed!
    const to = this.target!
    const follow = 1 - this.settings.smoothing * 0.9
    const next = {
      x: from.x + (to.x - from.x) * follow,
      y: from.y + (to.y - from.y) * follow,
      pressure: from.pressure + (to.pressure - from.pressure) * follow,
    }
    this.painter.lineTo(next)
    this.smoothed = next
  }
}

// Draws a gentle S-shaped sample stroke, so each brush shows what it does.
export function paintSample(
  ctx: CanvasRenderingContext2D,
  settings: BrushSettings,
  color: string,
  mode: StrokeMode,
  width: number,
  height: number,
  maxSize: number,
): void {
  const layer = createCanvas(width, height)
  const sized = { ...settings, size: Math.min(settings.size, maxSize) }
  const painter = new DabPainter(getContext2d(layer), sized, mode === 'erase' ? { r: 0, g: 0, b: 0 } : hexToRgb(color))
  const pad = sized.size / 2 + 4
  const amplitude = Math.max(0, height / 2 - pad)
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const point = {
      x: pad + (width - pad * 2) * t,
      y: height / 2 - Math.sin(t * Math.PI * 2) * amplitude * 0.6,
      // Shows how a pen tablet tapers the ends of a line.
      pressure: settings.pressure ? 0.35 + 0.65 * Math.sin(t * Math.PI) : 1,
    }
    if (i === 0) painter.begin(point)
    else painter.lineTo(point)
  }
  ctx.save()
  ctx.globalAlpha = settings.opacity
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : settings.blend === 'multiply' ? 'multiply' : 'source-over'
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}
