import { changeText } from '../text/textLayer.ts'
import type { Layer, ShapeFill, ShapeOutline, TextStyle } from './types.ts'

// "Copy the look" and "Paste the look": how one thing looks (its colors, outline, shadow and other
// effects, how solid it is and how it mixes) goes onto other things, which keep their own place,
// size, words and pictures. Things of another kind take what fits them: a shape's fill color
// colors words, and words' color fills a shape.

export interface Look {
  kind: Layer['kind']
  opacity: number
  blend: Layer['blend']
  effects: Layer['effects']
  // Only photos and drawings pass on their adjustments, and only to other photos and drawings.
  adjust: Layer['adjust']
  // A shape's fill (never a photo inside it) and outline.
  fill?: Exclude<ShapeFill, { kind: 'photo' }>
  outline?: ShapeOutline | null
  // How words look, apart from their size, lining up and reading direction.
  text?: Partial<TextStyle>
}

// The parts of a text's style that are its look.
const TEXT_LOOK = ['font', 'weight', 'italic', 'color', 'gradient', 'letterSpacing', 'lineHeight', 'underline', 'strike'] as const

function copy<T>(value: T): T {
  return value === undefined || value === null ? value : structuredClone(value)
}

// The one color of a fill, if it has one.
function solidColor(look: Look): string | null {
  if (look.fill?.kind === 'color') return look.fill.color
  if (look.text?.color && !look.text.gradient) return look.text.color
  return null
}

export function lookOf(layer: Layer): Look {
  const look: Look = { kind: layer.kind, opacity: layer.opacity, blend: layer.blend, effects: copy(layer.effects ?? null), adjust: layer.kind === 'raster' ? copy(layer.adjust) : null }
  if (layer.kind === 'shape') {
    if (layer.fill.kind !== 'photo') look.fill = copy(layer.fill)
    look.outline = copy(layer.outline)
  }
  if (layer.kind === 'text') {
    const text: Partial<TextStyle> = {}
    for (const key of TEXT_LOOK) if (layer.style[key] !== undefined) (text as Record<string, unknown>)[key] = copy(layer.style[key])
    if (!('gradient' in text)) text.gradient = null
    look.text = text
  }
  return look
}

// The layer with the look on it. Its place, size, words and pictures stay as they are.
export function withLook(layer: Layer, look: Look): Layer {
  const common = { opacity: look.opacity, blend: look.blend, effects: copy(look.effects) }
  if (layer.kind === 'raster') return { ...layer, ...common, adjust: look.kind === 'raster' ? copy(look.adjust) : layer.adjust }
  if (layer.kind === 'shape') {
    const color = solidColor(look)
    // A photo inside the shape stays; otherwise it takes the copied fill, or the words' color.
    const gradient = look.text?.gradient
    const fill: ShapeFill =
      layer.fill.kind === 'photo' ? layer.fill : look.fill ? copy(look.fill) : gradient ? { kind: 'gradient', gradient: copy(gradient) } : color ? { kind: 'color', color } : layer.fill
    const outline = look.kind === 'shape' ? copy(look.outline ?? null) : layer.outline
    return { ...layer, ...common, fill, outline }
  }
  if (layer.kind === 'text') {
    const color = solidColor(look)
    const style: Partial<TextStyle> = look.text
      ? copy(look.text)
      : look.fill?.kind === 'gradient'
        ? { gradient: copy(look.fill.gradient) }
        : color
          ? { color, gradient: null }
          : {}
    return { ...changeText(layer, { style }), ...common }
  }
  return { ...layer, ...common }
}
