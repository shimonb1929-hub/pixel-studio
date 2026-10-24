import { hexToRgb, rgbToHex, type Rgb } from './color.ts'
import { NO_EFFECTS, type LayerEffects } from './effects.ts'
import type { PaletteColor } from './palette.ts'
import type { EditorDocument, LayerGroup, ShapeLayer, TextLayer } from './types.ts'

// Words always readable (pro: contrast check, text over image). Text is checked against the
// pixels really behind it, with the contrast measure from the web's accessibility rules (WCAG):
// 1 is no difference at all, 21 is black on white. Normal text wants 4.5, big text 3.

export const DARK_TEXT = '#1b1d23'
export const LIGHT_TEXT = '#ffffff'

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

// How much light a color gives off, 0 (black) to 1 (white).
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastOfLuminance(p: number, q: number): number {
  return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05)
}

export function contrastRatio(p: string, q: string): number {
  return contrastOfLuminance(luminance(hexToRgb(p)), luminance(hexToRgb(q)))
}

// The contrast words need, by how big they print: 18 points and up (or 14 bold) is big text.
export function neededContrast(layer: TextLayer, ppi = 300): number {
  const points = (layer.style.size / ppi) * 72
  return points >= 18 || (layer.style.weight >= 700 && points >= 14) ? 3 : 4.5
}

// A color that reads on `background`: `start` made darker or lighter (whichever helps more) just
// until it reads, or plain white or near-black.
export function readableOn(background: string, needed = 4.5, start?: string): string {
  const towardLight = contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background)
  const end = hexToRgb(towardLight ? LIGHT_TEXT : DARK_TEXT)
  if (!start) return towardLight ? LIGHT_TEXT : DARK_TEXT
  const from = hexToRgb(start)
  for (let step = 0; step <= 20; step++) {
    const k = step / 20
    const hex = rgbToHex({ r: from.r + (end.r - from.r) * k, g: from.g + (end.g - from.g) * k, b: from.b + (end.b - from.b) * k })
    if (contrastRatio(hex, background) >= needed) return hex
  }
  return towardLight ? LIGHT_TEXT : DARK_TEXT
}

// What is behind some words: how light each spot is (sorted, darkest first) and the color it
// averages out to.
export interface Backdrop {
  lumas: Float32Array
  average: string
}

export function measureBackdrop(data: ArrayLike<number>): Backdrop | null {
  const lumas: number[] = []
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 8) continue
    const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] }
    lumas.push(luminance(rgb))
    r += rgb.r
    g += rgb.g
    b += rgb.b
  }
  if (lumas.length === 0) return null
  const n = lumas.length
  return { lumas: Float32Array.from(lumas).sort(), average: rgbToHex({ r: r / n, g: g / n, b: b / n }) }
}

// The contrast a color has with the hardest tenth of the spots behind it. Using the hardest
// spots, not the average, catches a bright cloud behind white words on a dark photo.
export function worstContrast(color: string, backdrop: Backdrop): number {
  const L = luminance(hexToRgb(color))
  const ratios = Array.from(backdrop.lumas, (l) => contrastOfLuminance(L, l)).sort((p, q) => p - q)
  return ratios[Math.floor((ratios.length - 1) * 0.1)]
}

// A shadow, glow or outline whose color stands out from the words already helps them read.
export function effectsHelp(layer: TextLayer): boolean {
  const e = layer.effects
  if (!e) return false
  const stands = (color: string) => contrastRatio(color, layer.style.color) >= 3
  return (
    (!!e.outline && e.outline.width > 0 && stands(e.outline.color)) ||
    (!!e.shadow && e.shadow.opacity >= 0.5 && e.shadow.blur > 0 && stands(e.shadow.color)) ||
    (!!e.glow && e.glow.opacity >= 0.5 && e.glow.size > 0 && stands(e.glow.color))
  )
}

export interface Readability {
  ratio: number
  needed: number
  ok: boolean
}

export function readability(layer: TextLayer, backdrop: Backdrop, ppi?: number): Readability {
  const needed = neededContrast(layer, ppi)
  // Words in a gradient are checked by their middle color.
  const color = layer.style.gradient ? layer.style.gradient.stops[Math.floor(layer.style.gradient.stops.length / 2)].color : layer.style.color
  const ratio = worstContrast(color, backdrop)
  return { ratio, needed, ok: ratio >= needed || effectsHelp(layer) }
}

export type ReadableFix =
  | { kind: 'color'; color: string; tone: 'light' | 'dark' | 'photo' }
  | { kind: 'shadow'; effects: LayerEffects }
  | { kind: 'backing'; color: string }

// Ways to make the words easy to read, best first: a clearer color (white or dark, or a color from
// the photos), a soft shadow around the letters, or a soft box behind them.
export function readableFixes(layer: TextLayer, backdrop: Backdrop, palette: PaletteColor[] = [], ppi?: number): ReadableFix[] {
  const needed = neededContrast(layer, ppi)
  const fixes: ReadableFix[] = []
  const light = worstContrast(LIGHT_TEXT, backdrop)
  const dark = worstContrast(DARK_TEXT, backdrop)
  if (Math.max(light, dark) >= needed) fixes.push({ kind: 'color', color: light >= dark ? LIGHT_TEXT : DARK_TEXT, tone: light >= dark ? 'light' : 'dark' })
  const photo = palette
    .filter((p) => p.chroma > 0.04 && p.hex !== layer.style.color && worstContrast(p.hex, backdrop) >= needed)
    .sort((p, q) => q.chroma - p.chroma)[0]
  if (photo) fixes.push({ kind: 'color', color: photo.hex, tone: 'photo' })

  // Light words get a dark shadow, dark words a light one.
  const textIsLight = luminance(hexToRgb(layer.style.color)) > 0.35
  const size = layer.style.size
  fixes.push({
    kind: 'shadow',
    effects: {
      ...(layer.effects ?? NO_EFFECTS),
      shadow: { color: textIsLight ? '#000000' : '#ffffff', opacity: 0.85, blur: Math.max(2, Math.round(size * 0.25)), distance: Math.round(size * 0.03), angle: 90 },
    },
  })

  // A box in a photo color that the words read well on, or plain dark or white.
  const box = palette.filter((p) => contrastRatio(p.hex, layer.style.color) >= needed).sort((p, q) => contrastRatio(q.hex, layer.style.color) - contrastRatio(p.hex, layer.style.color))[0]
  fixes.push({ kind: 'backing', color: box?.hex ?? (textIsLight ? DARK_TEXT : LIGHT_TEXT) })
  return fixes
}

// How see-through a backing box is: solid enough to read on, while the photo still shows a little.
export const BACKING_OPACITY = 0.85

// Applies one fix to the text layer. A backing box goes just under the words and is kept together
// with them, so they move as one.
export function applyReadableFix(doc: EditorDocument, layerId: string, fix: ReadableFix, backing: { id: string; name: string; group: LayerGroup }): EditorDocument {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (layer?.kind !== 'text') return doc
  if (fix.kind === 'color') {
    const changed: TextLayer = { ...layer, style: { ...layer.style, color: fix.color, gradient: null } }
    return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? changed : l)) }
  }
  if (fix.kind === 'shadow') return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? { ...layer, effects: fix.effects } : l)) }
  const size = layer.style.size
  const group = layer.group ?? backing.group
  const box: ShapeLayer = {
    id: backing.id,
    kind: 'shape',
    name: backing.name,
    visible: true,
    opacity: BACKING_OPACITY,
    locked: false,
    adjust: null,
    group,
    box: { cx: layer.box.cx, cy: layer.box.cy, width: Math.abs(layer.box.width) + size, height: Math.abs(layer.box.height) + size * 0.6, rotation: layer.box.rotation },
    geometry: { type: 'rectangle', corners: 0.3, sides: 5, arrow: false },
    fill: { kind: 'color', color: fix.color },
    outline: null,
  }
  const layers = doc.layers.flatMap((l) => (l.id === layerId ? [box, { ...layer, group }] : [l]))
  return { ...doc, layers }
}
