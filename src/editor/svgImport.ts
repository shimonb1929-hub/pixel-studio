import { t } from '../i18n/i18n.ts'
import { rgbToHex } from './color.ts'
import { createId } from './document.ts'
import { cornerNode, type PathNode, type ShapePath } from './path.ts'
import { shapeFromPaths } from './traceLayers.ts'
import type { LayerGroup, Point, ShapeFill, ShapeLayer, ShapeOutline } from './types.ts'

// Opening an SVG (a logo or drawing from another program) as shapes that stay sharp and can be
// recolored, moved and edited point by point, like shapes drawn here. Each filled or outlined part
// becomes one shape, kept together. The browser itself works out where everything is (with every
// transform applied) and which colors it has; the SVG is never run, only read: scripts, links,
// pictures and anything that could reach outside are taken out first.

export interface SvgShapes {
  width: number
  height: number
  shapes: ShapeLayer[]
}

// More parts than this and the SVG opens as a picture instead: it would be too many layers.
const MAX_SHAPES = 400
// Small icons are made bigger, so they are easy to work on.
const MIN_SIDE = 1000

const DRAWN = 'path, rect, circle, ellipse, line, polyline, polygon'
const UNSAFE = 'script, foreignObject, iframe, image, use, a, animate, animateMotion, animateTransform, set, audio, video, style[media], feImage'

function number(value: string | null, fallback = 0): number {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

// The size the SVG says it is, in pixels.
function svgSize(svg: SVGSVGElement): { width: number; height: number; viewBox: [number, number, number, number] } {
  const box = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
  const attr = (name: string) => {
    const value = svg.getAttribute(name) ?? ''
    // Percentages and other units say nothing about pixels.
    return /^\s*[\d.]+(px)?\s*$/.test(value) ? number(value) : 0
  }
  let width = attr('width') || (hasBox ? box[2] : 0)
  let height = attr('height') || (hasBox ? box[3] : 0)
  if (!width && height && hasBox) width = (height * box[2]) / box[3]
  if (!height && width && hasBox) height = (width * box[3]) / box[2]
  if (!width || !height) {
    width = 1000
    height = 1000
  }
  return { width, height, viewBox: hasBox ? (box as [number, number, number, number]) : [0, 0, width, height] }
}

// ---- Outlines out of SVG path data -----------------------------------------------------------

type Cubic = [Point, Point, Point]

interface Outline {
  start: Point
  curves: Cubic[]
  closed: boolean
}

function line(a: Point, b: Point): Cubic {
  return [{ ...a }, { ...b }, { ...b }]
}

// An arc from the SVG's endpoint form, as cubic curves (each a quarter turn or less).
function arcCurves(from: Point, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, to: Point): Cubic[] {
  if (rx === 0 || ry === 0) return [line(from, to)]
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (angle * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (grow > 1) {
    rx *= Math.sqrt(grow)
    ry *= Math.sqrt(grow)
  }
  const top = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const bottom = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, top / bottom))
  const cx1 = (factor * rx * y1) / ry
  const cy1 = (-factor * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angleOf(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let span = angleOf((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && span > 0) span -= 2 * Math.PI
  if (sweep && span < 0) span += 2 * Math.PI
  const pieces = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9))
  const step = span / pieces
  const k = (4 / 3) * Math.tan(step / 4)
  const at = (theta: number) => ({ x: cx + rx * Math.cos(theta) * cos - ry * Math.sin(theta) * sin, y: cy + rx * Math.cos(theta) * sin + ry * Math.sin(theta) * cos })
  const slope = (theta: number) => ({ x: -rx * Math.sin(theta) * cos - ry * Math.cos(theta) * sin, y: -rx * Math.sin(theta) * sin + ry * Math.cos(theta) * cos })
  const curves: Cubic[] = []
  for (let i = 0; i < pieces; i++) {
    const a = start + i * step
    const b = a + step
    const p0 = at(a)
    const p3 = i === pieces - 1 ? { ...to } : at(b)
    const d0 = slope(a)
    const d3 = slope(b)
    curves.push([
      { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      { x: p3.x - k * d3.x, y: p3.y - k * d3.y },
      p3,
    ])
  }
  return curves
}

// Reads SVG path data (M, L, H, V, C, S, Q, T, A, Z, and their small-letter relative forms).
export function parsePathData(d: string): Outline[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  const outlines: Outline[] = []
  let current = null as Outline | null
  let at: Point = { x: 0, y: 0 }
  let lastControl: Point | null = null
  let lastQuad: Point | null = null
  let command = ''
  let i = 0
  const next = () => Number(tokens[i++])
  const hasNumber = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])
  const begin = (p: Point) => {
    current = { start: { ...p }, curves: [], closed: false }
    outlines.push(current)
  }
  const add = (curve: Cubic) => {
    if (!current) begin(at)
    current!.curves.push(curve)
  }
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++]
    else if (!command) break
    const rel = command === command.toLowerCase()
    const ox = rel ? at.x : 0
    const oy = rel ? at.y : 0
    const c = command.toUpperCase()
    if (c === 'Z') {
      if (current) {
        current.closed = true
        at = { ...current.start }
      }
      current = null
      lastControl = lastQuad = null
      continue
    }
    if (!hasNumber()) break
    if (c === 'M') {
      at = { x: ox + next(), y: oy + next() }
      begin(at)
      // More pairs after a move are lines.
      command = rel ? 'l' : 'L'
      lastControl = lastQuad = null
    } else if (c === 'L') {
      const p = { x: ox + next(), y: oy + next() }
      add(line(at, p))
      at = p
      lastControl = lastQuad = null
    } else if (c === 'H') {
      const p = { x: (rel ? at.x : 0) + next(), y: at.y }
      add(line(at, p))
      at = p
      lastControl = lastQuad = null
    } else if (c === 'V') {
      const p = { x: at.x, y: (rel ? at.y : 0) + next() }
      add(line(at, p))
      at = p
      lastControl = lastQuad = null
    } else if (c === 'C' || c === 'S') {
      const c1: Point = c === 'C' ? { x: ox + next(), y: oy + next() } : lastControl ? { x: 2 * at.x - lastControl.x, y: 2 * at.y - lastControl.y } : { ...at }
      const c2 = { x: ox + next(), y: oy + next() }
      const p = { x: ox + next(), y: oy + next() }
      add([c1, c2, p])
      lastControl = c2
      lastQuad = null
      at = p
    } else if (c === 'Q' || c === 'T') {
      const q: Point = c === 'Q' ? { x: ox + next(), y: oy + next() } : lastQuad ? { x: 2 * at.x - lastQuad.x, y: 2 * at.y - lastQuad.y } : { ...at }
      const p = { x: ox + next(), y: oy + next() }
      add([
        { x: at.x + (2 / 3) * (q.x - at.x), y: at.y + (2 / 3) * (q.y - at.y) },
        { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) },
        p,
      ])
      lastQuad = q
      lastControl = null
      at = p
    } else if (c === 'A') {
      const rx = next()
      const ry = next()
      const angle = next()
      const large = next() !== 0
      const sweep = next() !== 0
      const p = { x: ox + next(), y: oy + next() }
      for (const curve of arcCurves(at, rx, ry, angle, large, sweep, p)) add(curve)
      at = p
      lastControl = lastQuad = null
    } else break
  }
  return outlines.filter((o) => o.curves.length > 0)
}

const KAPPA = 0.5522847498

function ellipseOutline(cx: number, cy: number, rx: number, ry: number): Outline {
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  return {
    start: { x: cx + rx, y: cy },
    closed: true,
    curves: [
      [{ x: cx + rx, y: cy + ky }, { x: cx + kx, y: cy + ry }, { x: cx, y: cy + ry }],
      [{ x: cx - kx, y: cy + ry }, { x: cx - rx, y: cy + ky }, { x: cx - rx, y: cy }],
      [{ x: cx - rx, y: cy - ky }, { x: cx - kx, y: cy - ry }, { x: cx, y: cy - ry }],
      [{ x: cx + kx, y: cy - ry }, { x: cx + rx, y: cy - ky }, { x: cx + rx, y: cy }],
    ],
  }
}

function pointsOutline(points: string | null, closed: boolean): Outline[] {
  const values = (points ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  const list: Point[] = []
  for (let i = 0; i + 1 < values.length; i += 2) list.push({ x: values[i], y: values[i + 1] })
  if (list.length < 2) return []
  return [{ start: list[0], closed, curves: list.slice(1).map((p, i) => line(list[i], p)) }]
}

// The outlines of one drawn element, in its own units.
function outlinesOf(el: Element): Outline[] {
  const a = (name: string) => number(el.getAttribute(name))
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return parsePathData(el.getAttribute('d') ?? '')
    case 'rect': {
      const x = a('x')
      const y = a('y')
      const w = a('width')
      const h = a('height')
      if (w <= 0 || h <= 0) return []
      let rx = el.hasAttribute('rx') ? a('rx') : el.hasAttribute('ry') ? a('ry') : 0
      let ry = el.hasAttribute('ry') ? a('ry') : rx
      rx = Math.min(rx, w / 2)
      ry = Math.min(ry, h / 2)
      if (rx <= 0 || ry <= 0) {
        const corners = [
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ]
        return [{ start: { x, y }, closed: true, curves: corners.map((p, i) => line(i === 0 ? { x, y } : corners[i - 1], p)) }]
      }
      const kx = rx * KAPPA
      const ky = ry * KAPPA
      const r = x + w
      const b = y + h
      return [
        {
          start: { x: x + rx, y },
          closed: true,
          curves: [
            line({ x: x + rx, y }, { x: r - rx, y }),
            [{ x: r - rx + kx, y }, { x: r, y: y + ry - ky }, { x: r, y: y + ry }],
            line({ x: r, y: y + ry }, { x: r, y: b - ry }),
            [{ x: r, y: b - ry + ky }, { x: r - rx + kx, y: b }, { x: r - rx, y: b }],
            line({ x: r - rx, y: b }, { x: x + rx, y: b }),
            [{ x: x + rx - kx, y: b }, { x, y: b - ry + ky }, { x, y: b - ry }],
            line({ x, y: b - ry }, { x, y: y + ry }),
            [{ x, y: y + ry - ky }, { x: x + rx - kx, y }, { x: x + rx, y }],
          ],
        },
      ]
    }
    case 'circle':
      return a('r') > 0 ? [ellipseOutline(a('cx'), a('cy'), a('r'), a('r'))] : []
    case 'ellipse':
      return a('rx') > 0 && a('ry') > 0 ? [ellipseOutline(a('cx'), a('cy'), a('rx'), a('ry'))] : []
    case 'line':
      return [{ start: { x: a('x1'), y: a('y1') }, closed: false, curves: [line({ x: a('x1'), y: a('y1') }, { x: a('x2'), y: a('y2') })] }]
    case 'polyline':
      return pointsOutline(el.getAttribute('points'), false)
    case 'polygon':
      return pointsOutline(el.getAttribute('points'), true)
    default:
      return []
  }
}

// An outline as the points of a shape, moved by `place`.
function toShapePath(outline: Outline, place: (p: Point) => Point): ShapePath {
  const nodes: PathNode[] = [cornerNode(place(outline.start))]
  for (const [c1, c2, p] of outline.curves) {
    nodes[nodes.length - 1].out = place(c1)
    const node = cornerNode(place(p))
    node.in = place(c2)
    nodes.push(node)
  }
  // A closed outline that ends where it started: the last point is the first one.
  if (outline.closed && nodes.length > 1) {
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      first.in = last.in
      nodes.pop()
    }
  }
  return { nodes, closed: outline.closed }
}

// ---- Colors ------------------------------------------------------------------------------------

// A color the browser worked out ("rgb(1, 2, 3)" or "rgba(…)") as a color code and how solid it is.
function readColor(css: string): { color: string; alpha: number } | null {
  const match = css.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/)
  if (!match) return null
  const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? Number.parseFloat(match[4]) / 100 : Number(match[4])
  return { color: rgbToHex({ r: Math.round(Number(match[1])), g: Math.round(Number(match[2])), b: Math.round(Number(match[3])) }), alpha }
}

// A fill from a gradient or pattern: its first color, so the shape still shows.
function referencedColor(svg: SVGSVGElement, css: string): { color: string; alpha: number } | null {
  const id = css.match(/url\(\s*["']?#([^"')]+)["']?\s*\)/)?.[1]
  const stop = id ? svg.querySelector(`[id="${CSS.escape(id)}"] stop`) : null
  if (!stop) return null
  const style = getComputedStyle(stop)
  const color = readColor(style.stopColor)
  return color ? { color: color.color, alpha: color.alpha * number(style.stopOpacity, 1) } : null
}

function paintOf(svg: SVGSVGElement, css: string): { color: string; alpha: number } | null {
  if (!css || css === 'none') return null
  return css.startsWith('url(') ? referencedColor(svg, css) : readColor(css)
}

// ---- Putting it together -----------------------------------------------------------------------

export async function svgToShapes(text: string, group: LayerGroup): Promise<SvgShapes | null> {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
  const source = parsed.documentElement
  if (source.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return null
  for (const el of [...source.querySelectorAll(UNSAFE)]) el.remove()
  for (const el of [source, ...source.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#'))) el.removeAttribute(attr.name)
    }
  }
  // Styles may only name things inside the SVG, never load anything.
  for (const style of [...source.querySelectorAll('style')]) style.textContent = (style.textContent ?? '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*["']?(?!#)[^)]*\)/gi, 'none')

  const svg = document.importNode(source, true) as unknown as SVGSVGElement
  const size = svgSize(svg)
  const grow = Math.max(1, MIN_SIDE / Math.max(size.width, size.height))
  const width = Math.round(size.width * grow)
  const height = Math.round(size.height * grow)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', size.viewBox.join(' '))
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;'
  holder.appendChild(svg)
  document.body.appendChild(holder)
  try {
    const drawn = [...svg.querySelectorAll(DRAWN)].filter((el) => !el.closest('defs, clipPath, mask, marker, pattern, symbol'))
    if (drawn.length === 0 || drawn.length > MAX_SHAPES) return null
    const root = svg.getScreenCTM()
    const shapes: ShapeLayer[] = []
    for (const el of drawn as SVGGraphicsElement[]) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const screen = el.getScreenCTM()
      if (!screen || !root) continue
      // From the part's own units to the SVG's view box, and from there to the design's pixels.
      const [vx, vy, vw, vh] = size.viewBox
      const m = new DOMMatrix().scale(width / vw, height / vh).translate(-vx, -vy).multiply(root.inverse().multiply(screen))
      const place = (p: Point) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
      const outlines = outlinesOf(el)
      if (outlines.length === 0) continue
      let opacity = 1
      for (let node: Element | null = el; node && node !== svg; node = node.parentElement) opacity *= number(getComputedStyle(node).opacity, 1)
      const fillPaint = paintOf(svg, style.fill)
      const fillAlpha = (fillPaint?.alpha ?? 1) * number(style.fillOpacity, 1)
      const strokePaint = paintOf(svg, style.stroke)
      const strokeWidth = number(style.strokeWidth, 1) * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
      const tag = el.tagName.toLowerCase()
      // Filled parts are closed, as SVG fills them; lines are only outlined.
      const closed = tag !== 'line' && tag !== 'polyline' && (outlines.some((o) => o.closed) || (!!fillPaint && fillAlpha > 0))
      const fill: ShapeFill = fillPaint && closed && fillAlpha > 0 ? { kind: 'color', color: fillPaint.color } : { kind: 'none' }
      const outline: ShapeOutline | null = strokePaint && strokeWidth > 0 ? { color: strokePaint.color, width: strokeWidth } : null
      if (fill.kind === 'none' && !outline) continue
      const paths = outlines.map((o) => toShapePath(closed ? { ...o, closed: true } : o, place))
      const { box, path, parts } = shapeFromPaths(paths, 0)
      shapes.push({
        id: createId('layer'),
        kind: 'shape',
        name: t('Part {n}', { n: shapes.length + 1 }),
        visible: true,
        // How see-through the fill or outline is comes along as how solid the whole shape is.
        opacity: Math.max(0, Math.min(1, opacity * (fill.kind === 'color' ? fillAlpha : (strokePaint?.alpha ?? 1) * number(style.strokeOpacity, 1)))),
        locked: false,
        adjust: null,
        group,
        box,
        geometry: { type: 'path', corners: 0, sides: 5, arrow: false, path, ...(parts.length ? { parts } : {}) },
        fill,
        outline,
      })
    }
    if (shapes.length === 0) return null
    // One part alone isn't kept together with anything.
    if (shapes.length === 1) delete shapes[0].group
    return { width, height, shapes }
  } finally {
    holder.remove()
  }
}
