import type { BrushSettings } from './brushes.ts'
import { hexToRgb, type Rgb } from './color.ts'
import { createCanvas, getContext2d } from './document.ts'
import { clampRect, unionRect, type Rect } from './geometry.ts'
import type { PixelLayer, Point } from './types.ts'

export interface InputPoint extends Point {
  // 0–1. A mouse always reports 1; a drawing tablet reports how hard you press.
  pressure: number
}

export type StrokeMode = 'paint' | 'erase'

// Dabs are placed this far apart, as a fraction of the brush diameter.
const SPACING = 0.1
// The lightest pen touch still draws at a quarter of the full size.
const MIN_PRESSURE_SCALE = 0.25

// A small random number maker that gives the same numbers from the same seed, so a sample stroke
// always looks the same.
function randomNumbers(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One hair of an oil brush: where it sits across the tip, how thick it is and its shade.
interface Bristle {
  across: number
  size: number
  // -1 (darker) to 1 (lighter); drifts slowly along the stroke, like paint mixing on the brush.
  shade: number
  // For how many more dabs this hair has run dry and leaves a gap.
  dry: number
}

// Paints evenly spaced dabs along a path. Used by real strokes and by the brush previews.
export class DabPainter {
  private last: InputPoint | null = null
  // Distance still to travel before the next dab.
  private carry = 0
  private painted: Rect | null = null
  // Which way the line is going, for brushes whose tip has a direction.
  private direction = { x: 1, y: 0 }
  // How far the line still goes before the next drip runs down.
  private nextDrip = 0
  private bristles: Bristle[] = []
  private readonly ctx: CanvasRenderingContext2D
  private readonly settings: BrushSettings
  private readonly rgb: Rgb
  private readonly solid: string
  private readonly clear: string
  private readonly random: () => number

  constructor(ctx: CanvasRenderingContext2D, settings: BrushSettings, rgb: Rgb, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.ctx = ctx
    this.settings = settings
    this.rgb = rgb
    this.solid = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`
    this.clear = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`
    this.random = randomNumbers(seed)
  }

  begin(point: InputPoint): void {
    this.last = point
    if (this.settings.tip === 'oil') this.bristles = this.makeBristles()
    if (this.settings.tip === 'drips') this.nextDrip = this.dripGap(point.pressure) * this.random()
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
    // The direction turns gently, so a bristle brush doesn't jump on a wobble.
    const turn = Math.min(1, distance / Math.max(1, this.radius(1)))
    const nx = this.direction.x + (dx / distance - this.direction.x) * turn
    const ny = this.direction.y + (dy / distance - this.direction.y) * turn
    const length = Math.hypot(nx, ny) || 1
    this.direction = { x: nx / length, y: ny / length }
    let travelled = this.carry
    while (travelled <= distance) {
      const k = travelled / distance
      const pressure = from.pressure + (point.pressure - from.pressure) * k
      this.dab({ x: from.x + dx * k, y: from.y + dy * k, pressure })
      travelled += this.spacing(pressure)
    }
    this.carry = travelled - distance
    this.last = point
    if (this.settings.tip === 'drips') {
      this.nextDrip -= distance
      if (this.nextDrip <= 0) {
        this.drip(point)
        this.nextDrip = this.dripGap(point.pressure)
      }
    }
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
    const radius = this.radius(pressure)
    // Bristles are thin, so they need dabs close together to make unbroken streaks.
    if (this.settings.tip === 'oil') return Math.max(0.5, (radius * 1.2) / Math.max(1, this.bristles.length))
    // Splatter throws drops every so often, not a solid line.
    if (this.settings.tip === 'splatter') return Math.max(1, radius * 0.7)
    return Math.max(0.5, radius * 2 * SPACING)
  }

  private mark(x: number, y: number, reach: number): void {
    this.painted = unionRect(this.painted, { x: x - reach - 1, y: y - reach - 1, width: reach * 2 + 2, height: reach * 2 + 2 })
  }

  private circle(x: number, y: number, radius: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  private dab(point: InputPoint): void {
    const { tip } = this.settings
    if (tip === 'oil') this.oilDab(point)
    else if (tip === 'splatter') this.splatterDab(point)
    else this.roundDab(point)
  }

  private roundDab({ x, y, pressure }: InputPoint): void {
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
    this.circle(x, y, radius)
    this.mark(x, y, radius)
  }

  // Bristles side by side across the tip, each a little lighter or darker than the color.
  private makeBristles(): Bristle[] {
    const count = Math.round(Math.min(48, Math.max(10, this.settings.size / 1.5)))
    return Array.from({ length: count }, (_, i) => ({
      across: ((i + 0.5) / count) * 2 - 1 + (this.random() - 0.5) * (1.4 / count),
      // Wide enough that neighbors overlap, so the paint covers with no gaps.
      size: (1.3 + this.random() * 0.8) / count,
      shade: this.random() * 2 - 1,
      dry: 0,
    }))
  }

  private shadeOf(shade: number): string {
    const { r, g, b } = this.rgb
    const amount = shade * 0.3
    const mix = (c: number) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount))
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
  }

  // Thick paint made of bristle streaks that overlap, so it covers fully but shows the brush's grain.
  private oilDab({ x, y, pressure }: InputPoint): void {
    const { ctx } = this
    const radius = this.radius(pressure)
    const side = { x: -this.direction.y, y: this.direction.x }
    ctx.globalAlpha = this.settings.flow * 0.7
    for (const bristle of this.bristles) {
      bristle.shade = Math.max(-1, Math.min(1, bristle.shade + (this.random() - 0.5) * 0.06))
      // Now and then a hair runs dry for a little way, which gives the paint its streaky look.
      if (bristle.dry > 0) {
        bristle.dry--
        continue
      }
      if (this.random() < 0.003) bristle.dry = 3 + Math.floor(this.random() * 12)
      ctx.fillStyle = this.shadeOf(bristle.shade + (this.random() - 0.5) * 0.3)
      // Each hair wanders a tiny bit, so the streaks aren't ruler-straight.
      const reach = (bristle.across + (this.random() - 0.5) * 0.03) * radius
      this.circle(x + side.x * reach, y + side.y * reach, Math.max(0.6, bristle.size * radius))
    }
    this.mark(x, y, radius * 1.2)
  }

  // Drops of all sizes around the line: many small ones, a few big ones, and now and then a
  // splash with a trail of tiny drops.
  private splatterDab({ x, y, pressure }: InputPoint): void {
    const { ctx } = this
    const radius = this.radius(pressure)
    ctx.globalAlpha = this.settings.flow
    ctx.fillStyle = this.solid
    const drops = 3 + Math.floor(this.random() * 4)
    for (let i = 0; i < drops; i++) {
      const angle = this.random() * Math.PI * 2
      const distance = radius * 1.1 * this.random() ** 0.7
      const size = Math.max(0.6, radius * (0.03 + 0.2 * this.random() ** 3))
      this.circle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, size)
    }
    if (this.random() < 0.12) {
      const angle = this.random() * Math.PI * 2
      const cx = x + Math.cos(angle) * radius * 0.5 * this.random()
      const cy = y + Math.sin(angle) * radius * 0.5 * this.random()
      const big = radius * (0.22 + 0.15 * this.random())
      this.circle(cx, cy, big)
      const flight = this.random() * Math.PI * 2
      for (let i = 1; i <= 4; i++) {
        const step = big * (1.2 + i * 0.7)
        this.circle(cx + Math.cos(flight) * step, cy + Math.sin(flight) * step, Math.max(0.6, big * (0.45 - i * 0.08)))
      }
      this.mark(cx, cy, big * 5)
    }
    this.mark(x, y, radius * 1.4)
  }

  private dripGap(pressure: number): number {
    return this.radius(pressure) * (2 + this.random() * 5)
  }

  // A run of paint down from the line: wide where it leaves the line, a little thinner lower down,
  // with a round drop at the end.
  private drip({ x, y, pressure }: InputPoint): void {
    const { ctx } = this
    const radius = this.radius(pressure)
    const width = radius * (0.35 + this.random() * 0.4)
    const length = radius * (1.5 + 7 * this.random() ** 1.6)
    const middle = x + (this.random() - 0.5) * radius
    const top = y
    const bottom = top + radius * 0.6 + length
    const join = width * 0.9
    const thin = width * 0.38
    const end = width * 0.42
    ctx.globalAlpha = this.settings.flow
    ctx.fillStyle = this.solid
    ctx.beginPath()
    ctx.moveTo(middle - width / 2 - join, top)
    ctx.quadraticCurveTo(middle - width / 2, top, middle - width / 2, top + join + radius * 0.4)
    ctx.quadraticCurveTo(middle - thin, (top + bottom) / 2, middle - end, bottom)
    ctx.lineTo(middle + end, bottom)
    ctx.quadraticCurveTo(middle + thin, (top + bottom) / 2, middle + width / 2, top + join + radius * 0.4)
    ctx.quadraticCurveTo(middle + width / 2, top, middle + width / 2 + join, top)
    ctx.closePath()
    ctx.fill()
    const drop = width * (0.62 + this.random() * 0.2)
    this.circle(middle, bottom, drop)
    const reach = width / 2 + join + drop
    this.painted = unionRect(this.painted, { x: middle - reach - 1, y: top - 1, width: reach * 2 + 2, height: bottom - top + drop + 2 })
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
  private readonly layer: PixelLayer
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

  constructor(layer: PixelLayer, settings: BrushSettings, color: string, mode: StrokeMode, mask: StrokeMask | null = null) {
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
    this.catchUp()
    if (!this.total) return null

    const { x, y } = this.total
    const before = copyRegion(this.layer.canvas, this.total)
    const after = copyRegion(this.preview, this.total)
    restoreRegion(this.layer.canvas, after, x, y)
    return { x, y, before, after }
  }

  // Ends the stroke without changing the layer, for marking an area: where the stroke went, at
  // full strength, and where that sits in the design. Null if it never touched the layer.
  finishMarks(): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    this.catchUp()
    if (!this.total) return null
    return { canvas: copyRegion(this.stroke, this.total), x: this.total.x + this.x, y: this.total.y + this.y }
  }

  // Lets a smoothed line catch up with where the pointer stopped, so it ends in the right place.
  private catchUp(): void {
    if (this.smoothed && this.target) {
      for (let i = 0; i < 40 && Math.hypot(this.target.x - this.smoothed.x, this.target.y - this.smoothed.y) > 0.5; i++) {
        this.followTarget()
      }
      this.painter.lineTo(this.target)
    }
    this.flush()
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
  // The same seed every time, so a sample always looks the same.
  const painter = new DabPainter(getContext2d(layer), sized, mode === 'erase' ? { r: 0, g: 0, b: 0 } : hexToRgb(color), 7)
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
