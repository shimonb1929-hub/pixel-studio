import type { BrushSettings } from './brushes.ts'
import { hexToRgb, type Rgb } from './color.ts'
import { createCanvas, getContext2d } from './document.ts'
import type { Layer, Point } from './types.ts'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface InputPoint extends Point {
  // 0–1. A mouse always reports 1; a drawing tablet reports how hard you press.
  pressure: number
}

export type StrokeMode = 'paint' | 'erase'

// Dabs are placed this far apart, as a fraction of the brush diameter.
const SPACING = 0.1
// The lightest pen touch still draws at a quarter of the full size.
const MIN_PRESSURE_SCALE = 0.25

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

// Snaps a rectangle outward to whole pixels and trims it to the design. Null if nothing is left.
export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

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

// Reused between strokes, so drawing on a big poster doesn't allocate two huge canvases each time.
let strokeCanvas: HTMLCanvasElement | null = null
let previewCanvas: HTMLCanvasElement | null = null

function pooled(canvas: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  return canvas && canvas.width === width && canvas.height === height ? canvas : createCanvas(width, height)
}

// One brush or eraser stroke, from pointer down to pointer up.
//
// Dabs go onto a separate stroke canvas at full strength. The preview shows the layer with the
// stroke laid on top at the brush opacity, so overlapping dabs within one stroke never build up
// darker than the opacity you chose. When the stroke ends, the preview is copied into the layer
// and the before/after pixels are kept for undo.
export class StrokeSession {
  readonly layerId: string
  readonly preview: HTMLCanvasElement
  private readonly layer: Layer
  private readonly settings: BrushSettings
  private readonly mode: StrokeMode
  private readonly stroke: HTMLCanvasElement
  private readonly previewCtx: CanvasRenderingContext2D
  private readonly painter: DabPainter
  private readonly width: number
  private readonly height: number
  private smoothed: InputPoint | null = null
  private target: InputPoint | null = null
  private total: Rect | null = null

  constructor(layer: Layer, settings: BrushSettings, color: string, mode: StrokeMode, width: number, height: number) {
    this.layerId = layer.id
    this.layer = layer
    this.settings = settings
    this.mode = mode
    this.width = width
    this.height = height

    strokeCanvas = pooled(strokeCanvas, width, height)
    previewCanvas = pooled(previewCanvas, width, height)
    this.stroke = strokeCanvas
    this.preview = previewCanvas

    const strokeCtx = getContext2d(this.stroke)
    strokeCtx.clearRect(0, 0, width, height)
    this.previewCtx = getContext2d(this.preview)
    this.previewCtx.clearRect(0, 0, width, height)
    this.previewCtx.drawImage(layer.canvas, 0, 0)

    this.painter = new DabPainter(strokeCtx, settings, mode === 'erase' ? { r: 0, g: 0, b: 0 } : hexToRgb(color))
  }

  get endPoint(): Point | null {
    return this.target && { x: this.target.x, y: this.target.y }
  }

  begin(point: InputPoint): void {
    this.smoothed = point
    this.target = point
    this.painter.begin(point)
  }

  // Follows the pointer, smoothed by the "steady hand" setting.
  moveTo(point: InputPoint): void {
    if (!this.smoothed) {
      this.begin(point)
      return
    }
    this.target = point
    this.followTarget()
  }

  // A straight line with no smoothing, for Shift + click.
  lineTo(point: InputPoint): void {
    if (!this.smoothed) this.begin(point)
    this.painter.lineTo(point)
    this.smoothed = point
    this.target = point
  }

  // Shows everything painted so far. Returns false if nothing changed.
  flush(): boolean {
    const painted = this.painter.takePainted()
    const rect = painted && clampRect(painted, this.width, this.height)
    if (!rect) return false
    this.total = unionRect(this.total, rect)
    const { x, y, width, height } = rect
    const ctx = this.previewCtx
    ctx.save()
    ctx.clearRect(x, y, width, height)
    ctx.drawImage(this.layer.canvas, x, y, width, height, x, y, width, height)
    ctx.globalAlpha = this.settings.opacity
    ctx.globalCompositeOperation =
      this.mode === 'erase' ? 'destination-out' : this.settings.blend === 'multiply' ? 'multiply' : 'source-over'
    ctx.drawImage(this.stroke, x, y, width, height, x, y, width, height)
    ctx.restore()
    return true
  }

  // Ends the stroke and writes it into the layer. Null if it never touched the design.
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
