import { live, msg, t } from '../i18n/i18n.ts'
export type BrushBlend = 'normal' | 'multiply'

// The shape of the brush's tip. A round tip paints a plain line; the others paint with texture:
// streaks of bristles, flicked drops, or paint that runs down.
export type BrushTip = 'round' | 'oil' | 'splatter' | 'drips'

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
  tip: BrushTip
}

export interface BrushPreset {
  id: string
  name: string
  description: string
  // Brushes are shown in groups: plain ones for drawing, and ones that paint with texture.
  kind?: 'draw' | 'paint'
  settings: BrushSettings
}

export const MIN_BRUSH_SIZE = 1
export const MAX_BRUSH_SIZE = 500

export const BRUSH_PRESETS: BrushPreset[] = live([
  {
    id: 'pencil',
    name: msg('Pencil'),
    description: msg('A thin, crisp line. Good for sketching and outlines.'),
    settings: { size: 4, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: true, blend: 'normal', tip: 'round' },
  },
  {
    id: 'pen',
    name: msg('Ink pen'),
    description: msg('A smooth, clean line that stays steady even if your hand shakes. Good for drawing and lettering.'),
    settings: { size: 10, softness: 0.05, opacity: 1, flow: 1, smoothing: 0.6, pressure: true, blend: 'normal', tip: 'round' },
  },
  {
    id: 'marker',
    name: msg('Marker'),
    description: msg('A thick line you can see through a little. Crossing lines get darker, like a real marker.'),
    settings: { size: 28, softness: 0.1, opacity: 0.7, flow: 1, smoothing: 0.35, pressure: false, blend: 'normal', tip: 'round' },
  },
  {
    id: 'soft',
    name: msg('Soft brush'),
    description: msg('A big brush with soft, fading edges. Good for shading, glows and gentle color.'),
    settings: { size: 90, softness: 1, opacity: 0.8, flow: 0.25, smoothing: 0.3, pressure: true, blend: 'normal', tip: 'round' },
  },
  {
    id: 'highlighter',
    name: msg('Highlighter'),
    description: msg('Colors over things like a real highlighter: dark parts underneath stay visible.'),
    settings: { size: 36, softness: 0, opacity: 0.55, flow: 1, smoothing: 0.4, pressure: false, blend: 'multiply', tip: 'round' },
  },
  {
    id: 'oil',
    name: msg('Oil paint'),
    kind: 'paint',
    description: msg('Thick paint with the streaks of a real bristle brush, in light and dark shades of your color.'),
    settings: { size: 34, softness: 0, opacity: 1, flow: 1, smoothing: 0.35, pressure: true, blend: 'normal', tip: 'oil' },
  },
  {
    id: 'splatter',
    name: msg('Splatter'),
    kind: 'paint',
    description: msg('Flicks drops of paint around the line, big and small, like shaking a wet brush.'),
    settings: { size: 60, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: false, blend: 'normal', tip: 'splatter' },
  },
  {
    id: 'drips',
    name: msg('Drips'),
    kind: 'paint',
    description: msg('Wet paint that runs down in drips, each ending in a round drop.'),
    settings: { size: 24, softness: 0, opacity: 1, flow: 1, smoothing: 0.35, pressure: false, blend: 'normal', tip: 'drips' },
  },
])

export const ERASER_PRESETS: BrushPreset[] = live([
  {
    id: 'precise',
    name: msg('Precise'),
    description: msg('A small eraser with a sharp edge, for cleaning up details.'),
    settings: { size: 8, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: true, blend: 'normal', tip: 'round' },
  },
  {
    id: 'block',
    name: msg('Block'),
    description: msg('A medium eraser with a sharp edge, for removing parts quickly.'),
    settings: { size: 40, softness: 0.05, opacity: 1, flow: 1, smoothing: 0.2, pressure: false, blend: 'normal', tip: 'round' },
  },
  {
    id: 'soft',
    name: msg('Soft'),
    description: msg('A big eraser with soft edges, for fading things out gently.'),
    settings: { size: 100, softness: 1, opacity: 1, flow: 0.3, smoothing: 0.2, pressure: true, blend: 'normal', tip: 'round' },
  },
])

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
  if (smoothing < 0.05) return t('Off. Lines follow your pointer exactly.')
  if (smoothing < 0.4) return t('A little smoothing. Small wobbles disappear.')
  if (smoothing < 0.75) return t('Smooth. Shaky lines come out clean.')
  return t('Very smooth. Lines trail a little behind your pointer.')
}

export function describeSize(size: number): string {
  return t('{size} pixels wide. Tip: press [ or ] to change the size while you work.', { size })
}

export function describeSoftness(softness: number): string {
  if (softness < 0.05) return t('Crisp. The edge is sharp and clean.')
  if (softness < 0.5) return t('Slightly soft. The edge blends a little.')
  return t('Very soft. The edge fades out gently, like an airbrush.')
}

export function describeOpacity(opacity: number, erasing: boolean): string {
  if (erasing) {
    if (opacity >= 0.99) return t('Full strength. Removes paint completely.')
    return t('Partial. Removes some paint and leaves a faded look.')
  }
  if (opacity >= 0.99) return t('Solid. Covers everything underneath.')
  if (opacity >= 0.5) return t('Partly see-through. What is underneath shows a little.')
  return t('Very see-through, like tinted glass.')
}

export function sameSettings(a: BrushSettings, b: BrushSettings): boolean {
  return (Object.keys(a) as (keyof BrushSettings)[]).every((key) => a[key] === b[key])
}
