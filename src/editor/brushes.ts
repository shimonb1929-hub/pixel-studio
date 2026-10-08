export type BrushBlend = 'normal' | 'multiply'

export interface BrushSettings {
  // Diameter in design pixels.
  size: number
  // 0 = crisp edge, 1 = edge fades out completely.
  softness: number
  // How solid the whole stroke is, 0.01–1. Overlapping parts of one stroke don't get darker.
  opacity: number
  // How much each dab adds; below 1 lets a stroke build up gradually, like spray.
  flow: number
  // 0 = follows the pointer exactly, 1 = very smooth but trails behind.
  smoothing: number
  // Pen pressure changes the size (only with a drawing tablet).
  pressure: boolean
  blend: BrushBlend
}

export interface BrushPreset {
  id: string
  name: string
  description: string
  settings: BrushSettings
}

export const MIN_BRUSH_SIZE = 1
export const MAX_BRUSH_SIZE = 500

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'pencil',
    name: 'Pencil',
    description: 'A thin, crisp line. Good for sketching and outlines.',
    settings: { size: 4, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: true, blend: 'normal' },
  },
  {
    id: 'pen',
    name: 'Ink pen',
    description: 'A smooth, clean line that stays steady even if your hand shakes. Good for drawing and lettering.',
    settings: { size: 10, softness: 0.05, opacity: 1, flow: 1, smoothing: 0.6, pressure: true, blend: 'normal' },
  },
  {
    id: 'marker',
    name: 'Marker',
    description: 'A thick line you can see through a little. Crossing lines get darker, like a real marker.',
    settings: { size: 28, softness: 0.1, opacity: 0.7, flow: 1, smoothing: 0.35, pressure: false, blend: 'normal' },
  },
  {
    id: 'soft',
    name: 'Soft brush',
    description: 'A big brush with soft, fading edges. Good for shading, glows and gentle color.',
    settings: { size: 90, softness: 1, opacity: 0.8, flow: 0.25, smoothing: 0.3, pressure: true, blend: 'normal' },
  },
  {
    id: 'highlighter',
    name: 'Highlighter',
    description: 'Colors over things like a real highlighter: dark parts underneath stay visible.',
    settings: { size: 36, softness: 0, opacity: 0.55, flow: 1, smoothing: 0.4, pressure: false, blend: 'multiply' },
  },
]

export const ERASER_PRESETS: BrushPreset[] = [
  {
    id: 'precise',
    name: 'Precise',
    description: 'A small eraser with a sharp edge, for cleaning up details.',
    settings: { size: 8, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: true, blend: 'normal' },
  },
  {
    id: 'block',
    name: 'Block',
    description: 'A medium eraser with a sharp edge, for removing parts quickly.',
    settings: { size: 40, softness: 0.05, opacity: 1, flow: 1, smoothing: 0.2, pressure: false, blend: 'normal' },
  },
  {
    id: 'soft',
    name: 'Soft',
    description: 'A big eraser with soft edges, for fading things out gently.',
    settings: { size: 100, softness: 1, opacity: 1, flow: 0.3, smoothing: 0.2, pressure: true, blend: 'normal' },
  },
]

// The size slider is curved: most of its length covers small sizes, where small steps matter.
const SIZE_CURVE = 2.2

export function sizeToSlider(size: number): number {
  const clamped = Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, size))
  return ((clamped - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) ** (1 / SIZE_CURVE)
}

export function sliderToSize(position: number): number {
  const p = Math.min(1, Math.max(0, position))
  return Math.round(MIN_BRUSH_SIZE + (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE) * p ** SIZE_CURVE)
}

// The [ and ] keys: steps that feel even at every size.
export function stepBrushSize(size: number, direction: 1 | -1): number {
  const step = size < 10 ? 1 : size < 50 ? 5 : size < 100 ? 10 : 25
  const next = direction > 0 ? size + step : size - (size <= 10 ? 1 : size <= 50 ? 5 : size <= 100 ? 10 : 25)
  return Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, next))
}

export function describeSmoothing(smoothing: number): string {
  if (smoothing < 0.05) return 'Off. Lines follow your pointer exactly.'
  if (smoothing < 0.4) return 'A little smoothing. Small wobbles disappear.'
  if (smoothing < 0.75) return 'Smooth. Shaky lines come out clean.'
  return 'Very smooth. Lines trail a little behind your pointer.'
}

export function describeSize(size: number): string {
  return `${size} pixels wide. Tip: press [ or ] to change the size while you work.`
}

export function describeSoftness(softness: number): string {
  if (softness < 0.05) return 'Crisp. The edge is sharp and clean.'
  if (softness < 0.5) return 'Slightly soft. The edge blends a little.'
  return 'Very soft. The edge fades out gently, like an airbrush.'
}

export function describeOpacity(opacity: number, erasing: boolean): string {
  if (erasing) {
    if (opacity >= 0.99) return 'Full strength. Removes paint completely.'
    return 'Partial. Removes some paint and leaves a faded look.'
  }
  if (opacity >= 0.99) return 'Solid. Covers everything underneath.'
  if (opacity >= 0.5) return 'Partly see-through. What is underneath shows a little.'
  return 'Very see-through, like tinted glass.'
}

export function sameSettings(a: BrushSettings, b: BrushSettings): boolean {
  return (Object.keys(a) as (keyof BrushSettings)[]).every((key) => a[key] === b[key])
}
