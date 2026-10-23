import { live, msg } from '../i18n/i18n.ts'
import type { BrushSettings } from './brushes.ts'
import { createCanvas, getContext2d } from './document.ts'
import { hidePlacement, layerBounds, layerFrame, MAX_HIDE_SIDE } from './objects.ts'
import { markPixelsChanged } from './pixelVersion.ts'
import { DabPainter, type InputPoint } from './stroke.ts'
import { applyAffine, invertAffine } from './transform.ts'
import type { Layer, LayerHide } from './types.ts'

// Softly hiding parts of a layer, with a brush or a ready-made fade. Nothing on the layer changes:
// the hidden parts are kept on their own, so they can be brought back at any time.

// The part of the layer's frame that hidden parts can cover: the whole layer, with what reaches
// past its box (outlines, tails of letters).
function coverRect(layer: Layer): LayerHide['rect'] {
  const inverse = invertAffine(layerFrame(layer))
  const b = layerBounds(layer)
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height },
    { x: b.x + b.width, y: b.y + b.height },
  ].map((p) => applyAffine(inverse, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  // Never smaller than the frame itself.
  const x = Math.min(0, ...xs)
  const y = Math.min(0, ...ys)
  return { x, y, width: Math.max(1, ...xs) - x, height: Math.max(1, ...ys) - y }
}

// Nothing hidden yet, ready to be brushed on: about one spot per design pixel, up to a limit.
export function emptyHide(layer: Layer): LayerHide {
  const rect = coverRect(layer)
  const frame = layerFrame(layer)
  const across = Math.hypot(frame.a, frame.b) * rect.width
  const down = Math.hypot(frame.c, frame.d) * rect.height
  const scale = Math.min(1, MAX_HIDE_SIDE / Math.max(across, down, 1))
  const canvas = createCanvas(Math.max(1, Math.round(across * scale)), Math.max(1, Math.round(down * scale)))
  return { canvas, rect }
}

// A copy that can be changed without touching the one kept for undo.
function copyHide(hide: LayerHide): LayerHide {
  const canvas = createCanvas(hide.canvas.width, hide.canvas.height)
  getContext2d(canvas).drawImage(hide.canvas, 0, 0)
  return { canvas, rect: hide.rect }
}

export type FadeSide = 'edges' | 'bottom' | 'top' | 'left' | 'right'

export interface FadeChoice {
  side: FadeSide
  name: string
  description: string
}

// Ready-made fades, the most common reasons to hide part of something.
export const FADES: FadeChoice[] = live([
  { side: 'edges', name: msg('Soft edges'), description: msg('All the edges fade softly away, like an old photo or a dreamy picture.') },
  { side: 'bottom', name: msg('Fade bottom'), description: msg('The bottom fades softly away, so it melts into what is behind it.') },
  { side: 'top', name: msg('Fade top'), description: msg('The top fades softly away, so it melts into what is behind it.') },
  { side: 'left', name: msg('Fade left'), description: msg('The left side fades softly away. Good for putting words next to a photo.') },
  { side: 'right', name: msg('Fade right'), description: msg('The right side fades softly away. Good for putting words next to a photo.') },
])

// How much of the layer a fade covers, from the side it starts on.
const FADE_LENGTH = 0.45

// Adds a soft fade to what's already hidden (or starts hiding with it).
export function addFade(layer: Layer, side: FadeSide, length = FADE_LENGTH): LayerHide {
  const hide = layer.hide ? copyHide(layer.hide) : emptyHide(layer)
  const { canvas, rect } = hide
  const ctx = getContext2d(canvas)
  // In frame coordinates: the layer's box is 0 to 1 both ways.
  ctx.setTransform(canvas.width / rect.width, 0, 0, canvas.height / rect.height, (-rect.x * canvas.width) / rect.width, (-rect.y * canvas.height) / rect.height)
  const outside = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  const ramp = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    // Eased, so the fade starts gently and ends fully hidden at the edge.
    for (let i = 0; i <= 8; i++) {
      const k = i / 8
      g.addColorStop(k, `rgba(0, 0, 0, ${(k * k * (3 - 2 * k)).toFixed(4)})`)
    }
    return g
  }
  if (side === 'edges') {
    // An oval fade from the middle: an oval fades to its edge all round, and a rectangle's corners
    // fade the most, like an old photo.
    const g = ctx.createRadialGradient(0.5, 0.5, 0.5 * (1 - length), 0.5, 0.5, 0.5)
    for (let i = 0; i <= 8; i++) {
      const k = i / 8
      g.addColorStop(k, `rgba(0, 0, 0, ${(k * k * (3 - 2 * k)).toFixed(4)})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(outside.x, outside.y, outside.width, outside.height)
  } else {
    const from = side === 'bottom' ? [0, 1 - length, 0, 1] : side === 'top' ? [0, length, 0, 0] : side === 'left' ? [length, 0, 0, 0] : [1 - length, 0, 1, 0]
    ctx.fillStyle = ramp(from[0], from[1], from[2], from[3])
    // Past the far edge everything stays hidden; before the fade starts nothing is.
    if (side === 'bottom') ctx.fillRect(outside.x, 1 - length, outside.width, outside.y + outside.height - (1 - length))
    else if (side === 'top') ctx.fillRect(outside.x, outside.y, outside.width, length - outside.y)
    else if (side === 'left') ctx.fillRect(outside.x, outside.y, length - outside.x, outside.height)
    else ctx.fillRect(1 - length, outside.y, outside.x + outside.width - (1 - length), outside.height)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return hide
}

// Whether anything is hidden at all.
export function hidesAnything(hide: LayerHide | null | undefined): boolean {
  if (!hide) return false
  const { width, height } = hide.canvas
  const data = getContext2d(hide.canvas).getImageData(0, 0, width, height).data
  for (let i = 3; i < data.length; i += 4) if (data[i] > 2) return true
  return false
}

export type HideMode = 'hide' | 'show'

export interface HideBrush {
  // Diameter in design pixels.
  size: number
  // 0 = crisp edge, 1 = edge fades out completely.
  softness: number
  // How much one stroke hides or brings back, 0.05 to 1.
  strength: number
}

export const DEFAULT_HIDE_BRUSH: HideBrush = { size: 120, softness: 0.7, strength: 1 }

// One stroke of the hiding brush. It paints on a copy, so the layer shows the change while
// brushing, and the copy is kept only when the stroke ends.
export class HideStroke {
  readonly layer: Layer
  readonly hide: LayerHide
  private readonly base: HTMLCanvasElement
  private readonly stroke: HTMLCanvasElement
  private readonly painter: DabPainter
  private readonly mode: HideMode
  private readonly strength: number

  constructor(layer: Layer, brush: HideBrush, mode: HideMode) {
    const start = layer.hide ?? emptyHide(layer)
    this.base = start.canvas
    this.hide = copyHide(start)
    this.mode = mode
    this.strength = brush.strength
    this.layer = { ...layer, hide: this.hide }
    this.stroke = createCanvas(this.hide.canvas.width, this.hide.canvas.height)
    const ctx = getContext2d(this.stroke)
    // The brush works in design pixels, turned and stretched like the layer.
    const m = invertAffine(hidePlacement(layer, this.hide))
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
    const settings: BrushSettings = { size: brush.size, softness: brush.softness, opacity: 1, flow: 1, smoothing: 0, pressure: false, blend: 'normal', tip: 'round' }
    this.painter = new DabPainter(ctx, settings, { r: 0, g: 0, b: 0 })
  }

  begin(point: InputPoint): void {
    this.painter.begin(point)
    this.update()
  }

  lineTo(point: InputPoint): void {
    this.painter.lineTo(point)
    this.update()
  }

  // The kept parts with this stroke on them, shown on the layer right away.
  private update(): void {
    this.painter.takePainted()
    const ctx = getContext2d(this.hide.canvas)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'copy'
    ctx.globalAlpha = 1
    ctx.drawImage(this.base, 0, 0)
    ctx.globalCompositeOperation = this.mode === 'hide' ? 'source-over' : 'destination-out'
    ctx.globalAlpha = this.strength
    ctx.drawImage(this.stroke, 0, 0)
    ctx.restore()
    markPixelsChanged(this.hide.canvas)
  }
}
