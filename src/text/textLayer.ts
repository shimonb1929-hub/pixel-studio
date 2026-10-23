import { boxPoint, type TransformBox } from '../editor/transform.ts'
import type { EditorDocument, Point, TextLayer, TextStyle } from '../editor/types.ts'
import { cssFont, fontReady, fontStack, fontsVersion, loadFont } from './fonts.ts'
import { indexAt, layoutText, mainDirection, plainWidth, resolveAlign, type RangeWidth, type TextLayout, type TextMeasure } from './layout.ts'
import { styledPieces, tidySpans } from './spans.ts'
import { t } from '../i18n/i18n.ts'

// Text objects: measuring and laying them out with real fonts, drawing them, and keeping their
// box fitted to the text as it changes.

let measurer: CanvasRenderingContext2D | null = null

function measuringContext(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')!
  return measurer
}

const widths = new Map<string, number>()
const baselines = new Map<string, number>()
let probe: { box: HTMLDivElement; marker: HTMLSpanElement } | null = null

// Where the browser puts the baseline in a line of this font and height, measured on a hidden line
// laid out exactly like the typing box, so text never jumps when typing ends.
function measuredBaseline(style: TextStyle, lineHeight: number): number | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined
  const key = `${fontsVersion()}|${cssFont(style)}|${lineHeight}`
  const known = baselines.get(key)
  if (known !== undefined) return known
  if (!probe) {
    const box = document.createElement('div')
    box.setAttribute('aria-hidden', 'true')
    box.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;white-space:pre;pointer-events:none'
    box.textContent = 'Hgא'
    const marker = document.createElement('span')
    marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
    box.appendChild(marker)
    document.body.appendChild(box)
    probe = { box, marker }
  }
  const { box, marker } = probe
  box.style.fontFamily = fontStack(style.font)
  box.style.fontSize = `${style.size}px`
  box.style.fontWeight = String(style.weight)
  box.style.fontStyle = style.italic ? 'italic' : 'normal'
  box.style.lineHeight = `${lineHeight}px`
  const baseline = marker.getBoundingClientRect().top - box.getBoundingClientRect().top
  if (baselines.size > 2000) baselines.clear()
  baselines.set(key, baseline)
  return baseline
}

// Measures text exactly as it will be drawn: same font, letter spacing and direction.
export function textMeasure(style: TextStyle): TextMeasure {
  const ctx = measuringContext()
  const font = cssFont(style)
  const spacing = `${style.letterSpacing * style.size}px`
  ctx.font = font
  ctx.letterSpacing = spacing
  ctx.direction = 'ltr'
  const metrics = ctx.measureText('Hgא')
  const ascent = metrics.fontBoundingBoxAscent || style.size * 0.8
  const descent = metrics.fontBoundingBoxDescent || style.size * 0.2
  const prefix = `${fontsVersion()}|${font}|${spacing}|`
  return {
    ascent,
    descent,
    baseline: (lineHeight) => measuredBaseline(style, lineHeight) ?? (lineHeight - (ascent + descent)) / 2 + ascent,
    width: (text, direction) => {
      const key = prefix + direction + text
      let width = widths.get(key)
      if (width === undefined) {
        ctx.font = font
        ctx.letterSpacing = spacing
        ctx.direction = direction
        width = ctx.measureText(text).width
        if (widths.size > 20000) widths.clear()
        widths.set(key, width)
      }
      return width
    },
  }
}

// Measures part of a text, each look with its own font: a bold word is measured bold.
function textWidth(layer: TextLayer): RangeWidth {
  if (!layer.spans?.length) return plainWidth(layer.text, textMeasure(layer.style))
  return (start, end, direction) =>
    styledPieces(layer.spans, layer.style, start, end).reduce((sum, piece) => sum + textMeasure(piece.style).width(layer.text.slice(piece.start, piece.end), direction), 0)
}

// Each look's font, so every letter is drawn with a font that has it.
function eachFont(layer: TextLayer): { style: TextStyle; text: string }[] {
  if (!layer.spans?.length) return [{ style: layer.style, text: layer.text }]
  return [{ style: layer.style, text: layer.text }, ...layer.spans.map((span) => ({ style: { ...layer.style, ...span.style }, text: layer.text.slice(span.start, span.end) }))]
}

const layouts = new WeakMap<TextLayer, { version: number; layout: TextLayout }>()

// The text laid out in lines, worked out again only when the text or a font changes.
export function textLayout(layer: TextLayer): TextLayout {
  const version = fontsVersion()
  const cached = layouts.get(layer)
  if (cached && cached.version === version) return cached.layout
  const layout = layoutText(layer.text, layer.style, layer.wrap ? Math.abs(layer.box.width) : null, textMeasure(layer.style), textWidth(layer))
  layouts.set(layer, { version, layout })
  return layout
}

// How far drawn letters can reach past the text's box: tails of script letters, accents, italics.
export function textReach(layer: TextLayer): number {
  return layer.style.size * 0.6
}

// How far the lines sit from the box's left edge. Normally none; if a font arrived after the box
// was fitted, the text keeps its place by its lined-up side.
function lineShift(layer: TextLayer, layout: TextLayout): number {
  if (layer.wrap) return 0
  const w = Math.abs(layer.box.width)
  const align = resolveAlign(layer.style.align, layout.direction)
  return align === 'right' ? w - layout.width : align === 'center' ? (w - layout.width) / 2 : 0
}

// Draws a text object in design coordinates.
export function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  const { box, style } = layer
  for (const font of eachFont(layer)) if (!fontReady(font.style, font.text)) void loadFont(font.style, font.text)
  const layout = textLayout(layer)
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  ctx.save()
  ctx.translate(box.cx, box.cy)
  ctx.rotate(box.rotation)
  ctx.scale(box.width < 0 ? -1 : 1, box.height < 0 ? -1 : 1)
  ctx.translate(-w / 2 + lineShift(layer, layout), -h / 2)
  ctx.font = cssFont(style)
  ctx.letterSpacing = `${style.letterSpacing * style.size}px`
  ctx.fillStyle = style.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (const line of layout.lines) {
    ctx.wordSpacing = `${line.wordSpacing}px`
    // Each piece reads one way; they're placed left to right in the order they appear.
    let x = line.x
    for (const run of line.runs) {
      ctx.direction = run.rtl ? 'rtl' : 'ltr'
      // Inside a piece, each look is drawn on its own; right to left, the first one is on the right.
      const looks = styledPieces(layer.spans, style, run.start, run.end)
      for (const look of run.rtl ? looks.reverse() : looks) {
        const piece = layer.text.slice(look.start, look.end)
        if (look.style !== style) {
          ctx.font = cssFont(look.style)
          ctx.fillStyle = look.style.color
        }
        ctx.fillText(piece, x, line.baseline)
        x += ctx.measureText(piece).width
        if (look.style !== style) {
          ctx.font = cssFont(style)
          ctx.fillStyle = style.color
        }
      }
    }
  }
  ctx.restore()
}

export interface PlacedGlyph {
  // One letter as people see it (a letter with its vowel marks stays together).
  text: string
  // Where it starts on its line and how wide it is, in design pixels.
  x: number
  width: number
}

export interface PlacedLine {
  baseline: number
  // Left to right as they appear, so right-to-left words come last letter first.
  glyphs: PlacedGlyph[]
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function splitLetters(text: string): string[] {
  return graphemes ? [...graphemes.segment(text)].map((s) => s.segment) : Array.from(text)
}

// Where every letter of a text object is drawn, for text people can select in a PDF: the matrix
// from the text's own coordinates to the design (like drawText uses), and each line's letters.
export function placeText(layer: TextLayer): { matrix: DOMMatrix; lines: PlacedLine[] } {
  const { box, style } = layer
  const layout = textLayout(layer)
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const matrix = new DOMMatrix()
    .translate(box.cx, box.cy)
    .rotate((box.rotation * 180) / Math.PI)
    .scale(box.width < 0 ? -1 : 1, box.height < 0 ? -1 : 1)
    .translate(-w / 2 + lineShift(layer, layout), -h / 2)
  const ctx = measuringContext()
  ctx.font = cssFont(style)
  ctx.letterSpacing = `${style.letterSpacing * style.size}px`
  const lines = layout.lines.map((line): PlacedLine => {
    ctx.wordSpacing = `${line.wordSpacing}px`
    const glyphs: PlacedGlyph[] = []
    let x = line.x
    for (const run of line.runs) {
      const piece = layer.text.slice(run.start, run.end)
      ctx.direction = run.rtl ? 'rtl' : 'ltr'
      const total = ctx.measureText(piece).width
      const letters = splitLetters(piece)
      if (run.rtl) letters.reverse()
      const widths = letters.map((letter) => ctx.measureText(letter).width)
      // Letters measured one by one add up a little differently (joins, kerning), so they're
      // stretched to fill exactly the width that's drawn.
      const sum = widths.reduce((a, b) => a + b, 0)
      const fit = sum > 0 ? total / sum : 1
      letters.forEach((letter, i) => {
        glyphs.push({ text: letter, x, width: widths[i] * fit })
        x += widths[i] * fit
      })
    }
    ctx.wordSpacing = '0px'
    return { baseline: line.baseline, glyphs }
  })
  return { matrix, lines }
}

// A design point in the text's own coordinates: from its top-left corner, unturned and unflipped.
export function textLocalPoint(layer: TextLayer, point: Point): Point {
  const { box } = layer
  const dx = point.x - box.cx
  const dy = point.y - box.cy
  const cos = Math.cos(-box.rotation)
  const sin = Math.sin(-box.rotation)
  const x = (dx * cos - dy * sin) * (box.width < 0 ? -1 : 1)
  const y = (dx * sin + dy * cos) * (box.height < 0 ? -1 : 1)
  return { x: x + Math.abs(box.width) / 2, y: y + Math.abs(box.height) / 2 }
}

// The place in the text nearest a design point, for putting the cursor where someone clicked.
export function textIndexAt(layer: TextLayer, point: Point): number {
  const layout = textLayout(layer)
  const local = textLocalPoint(layer, point)
  return indexAt(layer.text, layout, local.x - lineShift(layer, layout), local.y, textMeasure(layer.style), textWidth(layer))
}

// The side of the box that stays put while the text changes: where lines line up.
function anchorSide(layout: TextLayout, style: TextStyle): -1 | 0 | 1 {
  const align = resolveAlign(style.align, layout.direction)
  return align === 'right' ? 1 : align === 'center' ? 0 : -1
}

// A box of a new size whose `side` (-1 left, 0 middle, 1 right) and top stay where they were.
function keepSide(box: TransformBox, width: number, height: number, side: -1 | 0 | 1): TransformBox {
  const anchor = boxPoint(box, side, -1)
  const next = { ...box, width: Math.sign(box.width || 1) * width, height: Math.sign(box.height || 1) * height }
  const moved = boxPoint(next, side, -1)
  return { ...next, cx: next.cx + anchor.x - moved.x, cy: next.cy + anchor.y - moved.y }
}

// The text with its box fitted to it again after a change, keeping its lined-up side in place.
export function fitText(layer: TextLayer): TextLayer {
  const layout = textLayout(layer)
  const width = layer.wrap ? Math.abs(layer.box.width) : layout.width
  const box = keepSide(layer.box, width, layout.height, anchorSide(layout, layer.style))
  return { ...layer, box }
}

// Changes the text or how it looks, keeping the box fitted. A change to the whole text's look
// reaches every word: a word that had its own color takes the new one too.
export function changeText(layer: TextLayer, patch: Partial<Pick<TextLayer, 'text' | 'wrap' | 'spans'>> & { style?: Partial<TextStyle> }): TextLayer {
  const style = { ...layer.style, ...patch.style }
  let spans = 'spans' in patch ? patch.spans : layer.spans
  if (patch.style && spans) {
    const changed = Object.keys(patch.style)
    spans = spans.map((span) => ({ ...span, style: Object.fromEntries(Object.entries(span.style).filter(([key]) => !changed.includes(key))) }))
  }
  const next: TextLayer = { ...layer, ...patch, style, spans: tidySpans(spans, style, (patch.text ?? layer.text).length) }
  if (!next.spans) delete next.spans
  return fitText(next)
}

// The text placed in a box dragged with the handles: corners make the letters bigger or smaller,
// the side handles change where lines wrap.
export function textInBox(layer: TextLayer, box: TransformBox): TextLayer {
  const oldWidth = Math.abs(layer.box.width) || 1
  const oldHeight = Math.abs(layer.box.height) || 1
  const scale = Math.abs(box.height) / oldHeight
  const resized = Math.abs(scale - 1) > 1e-6
  const widthChanged = Math.abs(Math.abs(box.width) - oldWidth) > 1e-6
  if (!resized && !widthChanged) return { ...layer, box }
  if (resized) {
    const style = { ...layer.style, size: Math.max(1, layer.style.size * scale) }
    const next: TextLayer = { ...layer, style, box: { ...box, width: layer.wrap ? box.width : Math.sign(box.width || 1) * oldWidth * scale } }
    const fitted = fitText(next)
    // Centered on the dragged box, so the corner that was pulled meets the pointer.
    return { ...fitted, box: { ...fitted.box, cx: box.cx, cy: box.cy } }
  }
  // Only the width changed: the lines wrap to the new width and the top stays put.
  const wrapped = fitText({ ...layer, wrap: true, box: { ...box, width: Math.sign(box.width || 1) * Math.max(1, Math.abs(box.width)) } })
  return { ...wrapped, box: keepSide({ ...box, height: layer.box.height }, Math.abs(wrapped.box.width), Math.abs(wrapped.box.height), 0) }
}

// A short name for the Layers panel, from the text itself.
export function textName(text: string): string {
  const first = text.split('\n').find((line) => line.trim()) ?? ''
  const trimmed = first.trim().replace(/\s+/g, ' ')
  if (!trimmed) return t('Text')
  const letters = [...trimmed]
  return letters.length > 28 ? `${letters.slice(0, 27).join('')}…` : trimmed
}

// The box for new text, before anything is typed: a sliver centered on the point. The first letter
// decides which side stays there: the left for English, the right for Hebrew and Yiddish, so the
// text always starts where you clicked and grows the way it reads.
export function newTextBox(point: { x: number; y: number }, style: TextStyle): TransformBox {
  return { cx: point.x, cy: point.y, width: 1, height: style.size * style.lineHeight, rotation: 0 }
}

export { mainDirection }

// Waits until every font the design's text uses has loaded, so downloads never show a stand-in.
export async function loadDesignFonts(doc: EditorDocument): Promise<void> {
  await Promise.all(doc.layers.flatMap((layer) => (layer.kind === 'text' ? eachFont(layer).map((font) => loadFont(font.style, font.text)) : [])))
}
