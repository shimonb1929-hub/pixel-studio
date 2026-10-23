import { pointOnSegment, segmentAt, segmentCount, type ShapePath } from '../editor/path.ts'
import type { Point, TextLayer, TextStyle } from '../editor/types.ts'
import { cssFont, fontsVersion } from './fonts.ts'
import type { TextLayout } from './layout.ts'
import { styledPieces } from './spans.ts'

// Text that runs along a curve: bent into an arc (the Bend slider), or along the edge of a shape.
// The text is laid out straight first, exactly like any text (so Hebrew and Yiddish read right to
// left, with numbers and English inside them the right way round), and then each letter is set on
// the curve at the same distance along it, turned to follow it.

// Where text runs along the edge of a shape. The edge is kept in the text's own space, centered
// on the text box's middle, so moving or turning the text moves the edge with it.
export interface TextPath {
  path: ShapePath
  // Where the middle of the text sits along the edge, from 0 (its start) to 1 (its end).
  at: number
  // Runs the other way along the edge, so the letters sit on its other side.
  flip: boolean
}

export interface CurvedGlyph {
  // One letter as people see it, where it starts in the text, and how it looks.
  text: string
  index: number
  style: TextStyle
  rtl: boolean
  width: number
  // Where the letter's left end of its baseline sits, and how far it's turned.
  x: number
  y: number
  angle: number
  // Its height above and below the baseline.
  ascent: number
  descent: number
}

export interface CurvedText {
  glyphs: CurvedGlyph[]
  // The middle of the text's box, in the curve's own space (where the curve's origin is 0, 0).
  center: Point
  width: number
  height: number
}

// How far letters stand off the edge of a shape they run along, as a share of their size.
const EDGE_GAP = 0.15

// How far letters can be bent: 1 makes the text a full circle.
export const MAX_BEND = 1

export function isCurved(layer: TextLayer): boolean {
  return !!layer.along || !!layer.style.bend
}

let measurer: CanvasRenderingContext2D | null = null
function measuringContext(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')!
  return measurer
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function splitLetters(text: string, offset: number): { text: string; index: number }[] {
  if (graphemes) return [...graphemes.segment(text)].map((s) => ({ text: s.segment, index: offset + s.index }))
  const out: { text: string; index: number }[] = []
  let i = offset
  for (const letter of Array.from(text)) {
    out.push({ text: letter, index: i })
    i += letter.length
  }
  return out
}

interface StraightGlyph {
  text: string
  index: number
  style: TextStyle
  rtl: boolean
  x: number
  width: number
  baseline: number
}

// Every letter of the text laid out straight, left to right as they appear, each measured in its
// own font, and stretched to fill exactly the width the whole piece takes (joins and kerning).
function straightGlyphs(layer: TextLayer, layout: TextLayout): StraightGlyph[] {
  const ctx = measuringContext()
  const { style } = layer
  ctx.letterSpacing = `${style.letterSpacing * style.size}px`
  const out: StraightGlyph[] = []
  for (const line of layout.lines) {
    let x = line.x
    for (const run of line.runs) {
      ctx.direction = run.rtl ? 'rtl' : 'ltr'
      const looks = styledPieces(layer.spans, style, run.start, run.end)
      for (const look of run.rtl ? looks.reverse() : looks) {
        ctx.font = cssFont(look.style)
        const piece = layer.text.slice(look.start, look.end)
        const total = ctx.measureText(piece).width
        const letters = splitLetters(piece, look.start)
        if (run.rtl) letters.reverse()
        const widths = letters.map((letter) => ctx.measureText(letter.text).width)
        const sum = widths.reduce((a, b) => a + b, 0)
        const fit = sum > 0 ? total / sum : 1
        letters.forEach((letter, i) => {
          const width = widths[i] * fit
          out.push({ text: letter.text, index: letter.index, style: look.style, rtl: run.rtl, x, width, baseline: line.baseline })
          x += width
        })
      }
    }
  }
  return out
}

// A spot on a curve and which way the curve runs there.
interface CurveSpot {
  x: number
  y: number
  angle: number
}

// An arc through 0, 0 that bends `bend` of a full circle over `length`: up like a rainbow when
// positive, down like a smile when negative.
function arcAt(bend: number, length: number): (s: number) => CurveSpot {
  const k = Math.sign(bend)
  const radius = length / (Math.abs(bend) * 2 * Math.PI)
  return (s) => {
    const theta = s / radius
    return { x: radius * Math.sin(theta), y: k * radius * (1 - Math.cos(theta)), angle: k * theta }
  }
}

interface Polyline {
  points: Point[]
  // Distance along the line to each point.
  lengths: number[]
  total: number
  closed: boolean
}

const STEPS = 32

// The edge as many short straight pieces, measured along their length.
export function flatten(path: ShapePath): Polyline {
  const points: Point[] = []
  const count = segmentCount(path)
  if (path.nodes.length) points.push({ x: path.nodes[0].x, y: path.nodes[0].y })
  for (let i = 0; i < count; i++) {
    const segment = segmentAt(path, i)
    for (let step = 1; step <= STEPS; step++) points.push(pointOnSegment(segment, step / STEPS))
  }
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  return { points, lengths, total: lengths[lengths.length - 1] ?? 0, closed: path.closed }
}

// The spot `s` along the edge. A closed edge goes round and round; past the ends of an open one,
// the text carries straight on.
function spotOnLine(line: Polyline, s: number): CurveSpot {
  const { points, lengths, total } = line
  if (points.length < 2 || total <= 0) return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, angle: 0 }
  if (line.closed) s = ((s % total) + total) % total
  let i: number
  if (s <= 0) i = 1
  else if (s >= total) i = points.length - 1
  else {
    let lo = 1
    let hi = points.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (lengths[mid] < s) lo = mid + 1
      else hi = mid
    }
    i = lo
  }
  // Skips pieces of no length, so the direction is always known.
  let j = i
  while (j > 1 && lengths[j] - lengths[j - 1] < 1e-9) j--
  const a = points[j - 1]
  const b = points[j]
  const piece = lengths[j] - lengths[j - 1] || 1
  const t = (s - lengths[j - 1]) / piece
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

// Where along an edge it's highest on the page, as a share of its length: text put on a shape
// starts out centered there.
export function topOfPath(path: ShapePath): { at: number; flip: boolean } {
  const line = flatten(path)
  if (line.total <= 0) return { at: 0.5, flip: false }
  // The middle of the highest stretch, so a flat top is used from its middle. A closed edge's last
  // point is its first again; a stretch across its start counts from before the start.
  const count = line.closed ? line.points.length - 1 : line.points.length
  const top = Math.min(...line.points.slice(0, count).map((p) => p.y))
  const highest = line.points
    .slice(0, count)
    .map((p, i) => (p.y <= top + 1e-6 ? i : -1))
    .filter((i) => i >= 0)
  const wraps = line.closed && highest.includes(0) && highest.includes(count - 1)
  const spots = highest.map((i) => (wraps && i > count / 2 ? line.lengths[i] - line.total : line.lengths[i]))
  const middle = (Math.min(...spots) + Math.max(...spots)) / 2
  // An open line's highest spot can be an end; its middle reads better then.
  const atEnd = !line.closed && (highest[0] === 0 || highest[highest.length - 1] === count - 1)
  const at = atEnd ? 0.5 : (((middle % line.total) + line.total) % line.total) / line.total
  const spot = spotOnLine(line, at * line.total)
  // Letters stand upright when the edge runs left to right under them.
  return { at, flip: Math.cos(spot.angle) < 0 }
}

const cache = new WeakMap<TextLayer, { version: number; layout: TextLayout; curved: CurvedText | null }>()

// The text set on its curve, worked out again only when the text, its look or a font changes.
export function curvedText(layer: TextLayer, layout: TextLayout): CurvedText | null {
  if (!isCurved(layer)) return null
  const version = fontsVersion()
  const known = cache.get(layer)
  if (known && known.version === version && known.layout === layout) return known.curved
  const curved = layOnCurve(layer, layout)
  cache.set(layer, { version, layout, curved })
  return curved
}

function layOnCurve(layer: TextLayer, layout: TextLayout): CurvedText {
  const straight = straightGlyphs(layer, layout)
  const firstBaseline = layout.lines[0]?.baseline ?? 0
  const middle = layout.width / 2
  let at: (s: number) => CurveSpot
  // The distance along the curve of a spot along the straight text (from its middle).
  let along: (d: number) => number
  let turn = 0
  if (layer.along) {
    const line = flatten(layer.along.path)
    const center = layer.along.at * line.total
    const flip = layer.along.flip
    at = (s) => spotOnLine(line, s)
    along = (d) => (flip ? center - d : center + d)
    turn = flip ? Math.PI : 0
  } else {
    const arc = arcAt(Math.max(-MAX_BEND, Math.min(MAX_BEND, layer.style.bend ?? 0)), Math.max(1, layout.width))
    at = arc
    along = (d) => d
  }
  const metrics = new Map<TextStyle, { ascent: number; descent: number }>()
  const ctx = measuringContext()
  const glyphs: CurvedGlyph[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const g of straight) {
    let m = metrics.get(g.style)
    if (!m) {
      ctx.font = cssFont(g.style)
      const measured = ctx.measureText('Hgא')
      m = { ascent: measured.fontBoundingBoxAscent || g.style.size * 0.8, descent: measured.fontBoundingBoxDescent || g.style.size * 0.2 }
      metrics.set(g.style, m)
    }
    const spot = at(along(g.x + g.width / 2 - middle))
    const angle = spot.angle + turn
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Lines below the first sit further along the side the letters' feet point to.
    // Along a shape, the letters stand a little off its edge, so they never touch its outline.
    const drop = g.baseline - firstBaseline - (layer.along ? layer.style.size * EDGE_GAP : 0)
    const place = (lx: number, ly: number) => ({ x: spot.x + lx * cos - ly * sin, y: spot.y + lx * sin + ly * cos })
    const start = place(-g.width / 2, drop)
    glyphs.push({ text: g.text, index: g.index, style: g.style, rtl: g.rtl, width: g.width, x: start.x, y: start.y, angle, ascent: m.ascent, descent: m.descent })
    for (const [lx, ly] of [
      [-g.width / 2, drop - m.ascent],
      [g.width / 2, drop - m.ascent],
      [-g.width / 2, drop + m.descent],
      [g.width / 2, drop + m.descent],
    ]) {
      const p = place(lx, ly)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!glyphs.length) {
    // Nothing typed yet: a box one line high where the text will start.
    const size = layer.style.size * layer.style.lineHeight
    minX = -size / 4
    maxX = size / 4
    minY = -size
    maxY = 0
  }
  if (layer.along) {
    // Along a shape, the box stays centered on the shape's edge, so the edge never moves when the
    // words change; it's big enough for both.
    const line = flatten(layer.along.path)
    for (const p of line.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const halfWidth = Math.max(Math.abs(minX), Math.abs(maxX))
    const halfHeight = Math.max(Math.abs(minY), Math.abs(maxY))
    return { glyphs, center: { x: 0, y: 0 }, width: Math.max(1, 2 * halfWidth), height: Math.max(1, 2 * halfHeight) }
  }
  return { glyphs, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

// The letter of curved text nearest a point in the curve's own space, for putting the cursor there.
export function curvedIndexAt(curved: CurvedText, point: Point, textLength: number): number {
  let best = textLength
  let bestDistance = Infinity
  for (const g of curved.glyphs) {
    const cos = Math.cos(g.angle)
    const sin = Math.sin(g.angle)
    const dx = point.x - g.x
    const dy = point.y - g.y
    // The point in the letter's own directions: along its baseline and up from it.
    const lx = dx * cos + dy * sin
    const ly = -dx * sin + dy * cos
    const cx = Math.max(0, Math.min(g.width, lx))
    const cy = Math.max(-g.ascent, Math.min(g.descent, ly))
    const distance = Math.hypot(lx - cx, ly - cy)
    if (distance < bestDistance) {
      bestDistance = distance
      // The near half of a letter puts the cursor before it, the far half after it.
      const after = g.rtl ? lx < g.width / 2 : lx >= g.width / 2
      best = after ? g.index + g.text.length : g.index
    }
  }
  return best
}

// True if a point in the curve's own space is on (or within `slack` of) a letter.
export function hitsCurved(curved: CurvedText, point: Point, slack: number): boolean {
  return curved.glyphs.some((g) => {
    const cos = Math.cos(g.angle)
    const sin = Math.sin(g.angle)
    const dx = point.x - g.x
    const dy = point.y - g.y
    const lx = dx * cos + dy * sin
    const ly = -dx * sin + dy * cos
    return lx >= -slack && lx <= g.width + slack && ly >= -g.ascent - slack && ly <= g.descent + slack
  })
}
