import { hexToRgb, rgbToHex } from './color.ts'

// Colors that fade smoothly into each other, across a shape (straight) or out from its middle (round).

export interface GradientStop {
  // Where along the gradient, 0 (start) to 1 (end).
  at: number
  color: string
  // 1 is solid, 0 fully see-through.
  opacity: number
}

export type GradientType = 'linear' | 'radial'

export interface Gradient {
  type: GradientType
  // Which way a straight gradient runs, in degrees: 0 is left to right, 90 top to bottom.
  angle: number
  // Always at least two, in order.
  stops: GradientStop[]
}

export interface GradientPreset {
  name: string
  gradient: Gradient
}

const two = (a: string, b: string, angle = 0): Gradient => ({
  type: 'linear',
  angle,
  stops: [
    { at: 0, color: a, opacity: 1 },
    { at: 1, color: b, opacity: 1 },
  ],
})

export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: 'Sunset', gradient: two('#ff7e5f', '#feb47b', 90) },
  { name: 'Ocean', gradient: two('#2193b0', '#6dd5ed', 90) },
  { name: 'Purple dream', gradient: two('#7f53ac', '#647dee', 45) },
  { name: 'Fresh green', gradient: two('#56ab2f', '#a8e063', 45) },
  { name: 'Fire', gradient: two('#f12711', '#f5af19', 90) },
  { name: 'Night sky', gradient: two('#0f2027', '#2c5364', 90) },
  { name: 'Pastel', gradient: two('#fbc2eb', '#a6c1ee', 0) },
  {
    name: 'Gold',
    gradient: {
      type: 'linear',
      angle: 30,
      stops: [
        { at: 0, color: '#bf953f', opacity: 1 },
        { at: 0.5, color: '#fcf6ba', opacity: 1 },
        { at: 1, color: '#b38728', opacity: 1 },
      ],
    },
  },
  {
    name: 'Rainbow',
    gradient: {
      type: 'linear',
      angle: 0,
      stops: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'].map((color, i) => ({ at: i / 5, color, opacity: 1 })),
    },
  },
  {
    name: 'Glow',
    gradient: {
      type: 'radial',
      angle: 0,
      stops: [
        { at: 0, color: '#fff6c2', opacity: 1 },
        { at: 1, color: '#ff8a00', opacity: 1 },
      ],
    },
  },
  {
    name: 'Fade to see-through',
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { at: 0, color: '#1b1d23', opacity: 1 },
        { at: 1, color: '#1b1d23', opacity: 0 },
      ],
    },
  },
]

// A two-color gradient starting from one color, for turning a plain fill into a gradient.
export function gradientFrom(color: string): Gradient {
  const { r, g, b } = hexToRgb(color)
  const lift = (v: number) => Math.round(v + (255 - v) * 0.6)
  const lighter = rgbToHex({ r: lift(r), g: lift(g), b: lift(b) })
  return two(color, lighter === color ? '#3366ff' : lighter, 90)
}

function rgba(stop: GradientStop): string {
  const { r, g, b } = hexToRgb(stop.color)
  return `rgba(${r}, ${g}, ${b}, ${stop.opacity})`
}

function sorted(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.at - b.at)
}

// Where a straight gradient starts and ends in a w × h shape centered on 0, 0, so it reaches every
// corner (like CSS gradients).
export function gradientLine(angle: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const radians = (angle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  return { x0: -dx * half, y0: -dy * half, x1: dx * half, y1: dy * half }
}

// The gradient as a canvas fill for a w × h shape centered on 0, 0.
export function canvasGradient(ctx: CanvasRenderingContext2D, gradient: Gradient, w: number, h: number): CanvasGradient {
  let fill: CanvasGradient
  if (gradient.type === 'radial') {
    fill = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(Math.hypot(w, h) / 2, 0.5))
  } else {
    const { x0, y0, x1, y1 } = gradientLine(gradient.angle, w, h)
    fill = ctx.createLinearGradient(x0, y0, x1, y1)
  }
  for (const stop of sorted(gradient.stops)) fill.addColorStop(Math.max(0, Math.min(1, stop.at)), rgba(stop))
  return fill
}

// The gradient as CSS, for swatches and the gradient bar.
export function cssGradient(gradient: Gradient, straight = false): string {
  const stops = sorted(gradient.stops)
    .map((s) => `${rgba(s)} ${(s.at * 100).toFixed(1)}%`)
    .join(', ')
  if (gradient.type === 'radial' && !straight) return `radial-gradient(circle closest-side, ${stops})`
  // CSS measures angles from "up"; ours from "right".
  return `linear-gradient(${straight ? 90 : gradient.angle + 90}deg, ${stops})`
}

// The color a gradient has at a point along it, for adding a stop that doesn't change the look.
export function stopAt(gradient: Gradient, at: number): GradientStop {
  const stops = sorted(gradient.stops)
  if (at <= stops[0].at) return { ...stops[0], at }
  const last = stops[stops.length - 1]
  if (at >= last.at) return { ...last, at }
  const i = stops.findIndex((s) => s.at >= at)
  const a = stops[i - 1]
  const b = stops[i]
  const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at)
  const ca = hexToRgb(a.color)
  const cb = hexToRgb(b.color)
  const mix = (k: 'r' | 'g' | 'b') => Math.round(ca[k] + (cb[k] - ca[k]) * t)
  return { at, color: rgbToHex({ r: mix('r'), g: mix('g'), b: mix('b') }), opacity: a.opacity + (b.opacity - a.opacity) * t }
}

// The colors in the other order.
export function reverseGradient(gradient: Gradient): Gradient {
  return { ...gradient, stops: gradient.stops.map((s) => ({ ...s, at: 1 - s.at })).reverse() }
}

export function sameGradient(a: Gradient, b: Gradient): boolean {
  return (
    a.type === b.type &&
    a.angle === b.angle &&
    a.stops.length === b.stops.length &&
    a.stops.every((s, i) => s.at === b.stops[i].at && s.color.toLowerCase() === b.stops[i].color.toLowerCase() && s.opacity === b.stops[i].opacity)
  )
}
