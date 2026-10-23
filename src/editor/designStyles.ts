import { createId } from './document.ts'
import type { Gradient } from './gradient.ts'
import type { LayerEffects } from './effects.ts'
import { allPages, changeEveryPage } from './pages.ts'
import type { EditorDocument, Layer, SavedTextStyle, ShapeFill, TextLayer, TextStyle } from './types.ts'
import { changeText } from '../text/textLayer.ts'
import { t } from '../i18n/i18n.ts'

// The design's own colors and text styles. Colors are kept to use again anywhere in the design,
// and changing one changes it everywhere it was used. A text style is a look kept under a name:
// texts that use it change together when the style changes.

export const MAX_DESIGN_COLORS = 18
export const MAX_TEXT_STYLES = 12

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function designColors(doc: EditorDocument): string[] {
  return doc.colors ?? []
}

export function keepColor(doc: EditorDocument, hex: string): EditorDocument {
  const colors = designColors(doc)
  if (colors.some((c) => same(c, hex))) return doc
  return { ...doc, colors: [...colors, hex.toLowerCase()].slice(-MAX_DESIGN_COLORS) }
}

export function forgetColor(doc: EditorDocument, hex: string): EditorDocument {
  const colors = designColors(doc).filter((c) => !same(c, hex))
  const next: EditorDocument = { ...doc, colors }
  if (colors.length === 0) delete next.colors
  return next
}

function swap(color: string, from: string, to: string): string {
  return same(color, from) ? to : color
}

function swapGradient(gradient: Gradient, from: string, to: string): Gradient {
  if (!gradient.stops.some((s) => same(s.color, from))) return gradient
  return { ...gradient, stops: gradient.stops.map((s) => ({ ...s, color: swap(s.color, from, to) })) }
}

function swapEffects(effects: LayerEffects, from: string, to: string): LayerEffects {
  const next = { ...effects }
  if (next.shadow) next.shadow = { ...next.shadow, color: swap(next.shadow.color, from, to) }
  if (next.glow) next.glow = { ...next.glow, color: swap(next.glow.color, from, to) }
  if (next.outline) next.outline = { ...next.outline, color: swap(next.outline.color, from, to) }
  return next
}

function swapFill(fill: ShapeFill, from: string, to: string): ShapeFill {
  if (fill.kind === 'color') return { ...fill, color: swap(fill.color, from, to) }
  if (fill.kind === 'gradient') return { ...fill, gradient: swapGradient(fill.gradient, from, to) }
  return fill
}

function swapTextStyle(style: TextStyle, from: string, to: string): TextStyle {
  return { ...style, color: swap(style.color, from, to), ...(style.gradient ? { gradient: swapGradient(style.gradient, from, to) } : {}) }
}

function recolorLayer(layer: Layer, from: string, to: string): Layer {
  const effects = layer.effects ? { effects: swapEffects(layer.effects, from, to) } : {}
  if (layer.kind === 'shape') {
    return { ...layer, ...effects, fill: swapFill(layer.fill, from, to), outline: layer.outline && { ...layer.outline, color: swap(layer.outline.color, from, to) } }
  }
  if (layer.kind === 'text') {
    const spans = layer.spans?.map((span) => (span.style.color ? { ...span, style: { ...span.style, color: swap(span.style.color, from, to) } } : span))
    return { ...layer, ...effects, style: swapTextStyle(layer.style, from, to), ...(spans ? { spans } : {}) }
  }
  return { ...layer, ...effects }
}

// Every use of a color, on every page, becomes another color: shapes, outlines, letters, words with
// their own color, gradients, shadows and glows, the page itself, and the design's colors and text
// styles. Photos and drawings keep their pixels.
export function recolorEverywhere(doc: EditorDocument, from: string, to: string): EditorDocument {
  const target = to.toLowerCase()
  const changed = changeEveryPage(doc, (page) => ({
    ...page,
    background: page.background && swap(page.background, from, target),
    pageGradient: page.pageGradient ? swapGradient(page.pageGradient, from, target) : page.pageGradient,
    layers: page.layers.map((layer) => recolorLayer(layer, from, target)),
  }))
  const next: EditorDocument = { ...changed }
  if (doc.colors) {
    // Two saved colors that become the same are one color now.
    next.colors = [...new Set(doc.colors.map((c) => swap(c, from, target)))]
  }
  if (doc.textStyles) next.textStyles = doc.textStyles.map((s) => ({ ...s, style: swapTextStyle(s.style, from, target) }))
  return next
}

// How many things on every page use a color, so the Color panel can say what will change.
export function colorUses(doc: EditorDocument, hex: string): number {
  let count = 0
  const check = (color: string | null | undefined) => {
    if (color && same(color, hex)) count++
  }
  const checkGradient = (gradient: Gradient | null | undefined) => gradient?.stops.forEach((s) => check(s.color))
  for (const page of allPages(doc)) {
    if (!page.pageGradient) check(page.background)
    checkGradient(page.pageGradient)
    for (const layer of page.layers) {
      check(layer.effects?.shadow?.color)
      check(layer.effects?.glow?.color)
      check(layer.effects?.outline?.color)
      if (layer.kind === 'shape') {
        if (layer.fill.kind === 'color') check(layer.fill.color)
        if (layer.fill.kind === 'gradient') checkGradient(layer.fill.gradient)
        check(layer.outline?.color)
      } else if (layer.kind === 'text') {
        if (layer.style.gradient) checkGradient(layer.style.gradient)
        else check(layer.style.color)
        layer.spans?.forEach((span) => check(span.style.color))
      }
    }
  }
  return count
}

// Text styles.

export function textStyles(doc: EditorDocument): SavedTextStyle[] {
  return doc.textStyles ?? []
}

export function findTextStyle(doc: EditorDocument, id: string | undefined): SavedTextStyle | undefined {
  return id ? textStyles(doc).find((s) => s.id === id) : undefined
}

// The parts of a text's look a style keeps. Which way it reads always comes from its own words.
function lookOf(style: TextStyle): TextStyle {
  const { gradient, ...rest } = style
  return { ...rest, direction: 'auto', ...(gradient ? { gradient } : {}) }
}

// What applying a style changes on a text.
export function lookPatch(look: TextStyle): Partial<TextStyle> {
  const { direction: _, ...rest } = look
  return { ...rest, gradient: look.gradient ?? null }
}

function sameGradientLook(a: Gradient | null | undefined, b: Gradient | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// Whether a text still looks exactly like its style.
export function matchesStyle(style: TextStyle, look: TextStyle): boolean {
  return (
    style.font === look.font &&
    Math.abs(style.size - look.size) < 0.01 &&
    style.weight === look.weight &&
    style.italic === look.italic &&
    same(style.color, look.color) &&
    style.align === look.align &&
    Math.abs(style.letterSpacing - look.letterSpacing) < 1e-6 &&
    Math.abs(style.lineHeight - look.lineHeight) < 1e-6 &&
    sameGradientLook(style.gradient, look.gradient)
  )
}

export function nextStyleName(doc: EditorDocument): string {
  const names = new Set(textStyles(doc).map((s) => s.name))
  for (let n = textStyles(doc).length + 1; ; n++) {
    const name = t('Style {number}', { number: n })
    if (!names.has(name)) return name
  }
}

function eachText(doc: EditorDocument, change: (layer: TextLayer) => TextLayer): EditorDocument {
  return changeEveryPage(doc, (page) => ({ ...page, layers: page.layers.map((layer) => (layer.kind === 'text' ? change(layer) : layer)) }))
}

// Styles opened from a project keep their ids, so a new one must not take one of theirs.
export function newStyleId(doc: EditorDocument): string {
  let id = createId('style')
  while (findTextStyle(doc, id)) id = createId('style')
  return id
}

// Keeps a text's look as a new style; the texts given use it from now on.
export function saveTextStyle(doc: EditorDocument, name: string, style: TextStyle, textIds: string[], id = newStyleId(doc)): EditorDocument {
  const saved: SavedTextStyle = { id, name, style: lookOf(style) }
  const next = textIds.length ? eachText(doc, (layer) => (textIds.includes(layer.id) ? { ...layer, styleId: id } : layer)) : doc
  return { ...next, textStyles: [...textStyles(doc), saved] }
}

// Gives texts a style's look, and links them to it.
export function applyTextStyle(doc: EditorDocument, styleId: string, textIds: string[]): EditorDocument {
  const saved = findTextStyle(doc, styleId)
  if (!saved) return doc
  return eachText(doc, (layer) => (textIds.includes(layer.id) ? { ...changeText(layer, { style: lookPatch(saved.style) }), styleId } : layer))
}

// Changes a style, and every text that uses it, on every page.
export function updateTextStyle(doc: EditorDocument, styleId: string, style: TextStyle): EditorDocument {
  const saved = findTextStyle(doc, styleId)
  if (!saved) return doc
  const look = lookOf(style)
  const next = eachText(doc, (layer) => (layer.styleId === styleId ? changeText(layer, { style: lookPatch(look) }) : layer))
  return { ...next, textStyles: textStyles(doc).map((s) => (s.id === styleId ? { ...s, style: look } : s)) }
}

export function renameTextStyle(doc: EditorDocument, styleId: string, name: string): EditorDocument {
  return { ...doc, textStyles: textStyles(doc).map((s) => (s.id === styleId ? { ...s, name } : s)) }
}

// Removes a style. Texts that used it keep how they look.
export function removeTextStyle(doc: EditorDocument, styleId: string): EditorDocument {
  const next = eachText(doc, (layer) => {
    if (layer.styleId !== styleId) return layer
    const { styleId: _, ...rest } = layer
    return rest
  })
  const left = textStyles(doc).filter((s) => s.id !== styleId)
  const result: EditorDocument = { ...next, textStyles: left }
  if (left.length === 0) delete result.textStyles
  return result
}

// How many texts on every page use a style.
export function styleUses(doc: EditorDocument, styleId: string): number {
  return allPages(doc).reduce((sum, page) => sum + page.layers.filter((l) => l.kind === 'text' && l.styleId === styleId).length, 0)
}
