import { hexToRgb, rgbToHex, type Rgb } from './color.ts'
import { contrastRatio, DARK_TEXT, LIGHT_TEXT } from './readable.ts'
import type { EditorDocument, Layer, ShapeFill, TextLayer } from './types.ts'

// Colors from a photo (pro: Extract color theme), and giving a whole design those colors
// (pro: Recolor artwork to a theme). Colors are compared in OKLab, where equal steps look equally
// different to the eye, so "close" and "far" mean what people see.

export interface Lab {
  L: number
  a: number
  b: number
}

export interface PaletteColor {
  hex: string
  // How much of the photo is about this color, 0 to 1.
  share: number
  // 0 (black) to 1 (white).
  lightness: number
  // 0 for grays; around 0.1 and up for clear colors.
  chroma: number
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function labToRgb({ L, a, b }: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

export const hexToLab = (hex: string): Lab => rgbToLab(hexToRgb(hex))
export const labToHex = (lab: Lab): string => rgbToHex(labToRgb(lab))
export const labDistance = (p: Lab, q: Lab): number => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b)
const chromaOf = (lab: Lab) => Math.hypot(lab.a, lab.b)

interface Point {
  lab: Lab
  weight: number
}

// Close colors are counted together first (32 steps per channel), so even a big photo is only a
// few thousand points to sort out.
function colorCounts(data: ArrayLike<number>): Point[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < data.length; i += 4) {
    // See-through parts are not part of the photo.
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bin = bins.get(key)
    if (bin) {
      bin.n++
      bin.r += r
      bin.g += g
      bin.b += b
    } else bins.set(key, { n: 1, r, g, b })
  }
  return [...bins.values()].map((bin) => ({ lab: rgbToLab({ r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n }), weight: bin.n }))
}

// Groups the colors into `k` families (weighted k-means). The first centers are spread out: the
// most common color, then each time the color farthest from those already chosen (weighted a
// little by how common it is), so a small bright flower gets its own family, not just big areas.
function clusters(points: Point[], k: number): Point[] {
  if (points.length <= k) return points.map((p) => ({ lab: { ...p.lab }, weight: p.weight }))
  const centers: Lab[] = [points.reduce((best, p) => (p.weight > best.weight ? p : best)).lab]
  const nearest = points.map((p) => labDistance(p.lab, centers[0]))
  while (centers.length < k) {
    let pick = -1
    let score = 0
    for (let i = 0; i < points.length; i++) {
      const s = Math.sqrt(points[i].weight) * nearest[i] * nearest[i]
      if (s > score) {
        score = s
        pick = i
      }
    }
    if (pick < 0) break
    centers.push({ ...points[pick].lab })
    for (let i = 0; i < points.length; i++) nearest[i] = Math.min(nearest[i], labDistance(points[i].lab, points[pick].lab))
  }
  const owner = new Int32Array(points.length)
  for (let round = 0; round < 12; round++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestDistance = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = labDistance(points[i].lab, centers[c])
        if (d < bestDistance) {
          bestDistance = d
          best = c
        }
      }
      if (owner[i] !== best) moved = true
      owner[i] = best
    }
    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, w: 0 }))
    points.forEach((p, i) => {
      const s = sums[owner[i]]
      s.L += p.lab.L * p.weight
      s.a += p.lab.a * p.weight
      s.b += p.lab.b * p.weight
      s.w += p.weight
    })
    sums.forEach((s, c) => {
      if (s.w > 0) centers[c] = { L: s.L / s.w, a: s.a / s.w, b: s.b / s.w }
    })
    if (!moved && round > 0) break
  }
  const weights = centers.map(() => 0)
  points.forEach((p, i) => (weights[owner[i]] += p.weight))
  return centers.map((lab, c) => ({ lab, weight: weights[c] })).filter((c) => c.weight > 0)
}

// Colors closer than this look like the same color, so a palette never shows two of them.
const SAME_COLOR = 0.07

// The main colors of a photo, darkest first. `data` is RGBA pixels (a small copy is plenty). Big
// plain areas (a sky, a wall) count less than their size, and clear colors count more than grays,
// so the palette has the colors that make the photo what it is.
export function extractPalette(data: ArrayLike<number>, count = 6): PaletteColor[] {
  const points = colorCounts(data)
  const total = points.reduce((sum, p) => sum + p.weight, 0)
  if (total === 0) return []
  const families = clusters(points, Math.max(count * 2, 8))
  const scored = families
    .map((f) => {
      const share = f.weight / total
      const chroma = chromaOf(f.lab)
      return { ...f, share, chroma, score: Math.sqrt(share) * (0.35 + Math.min(chroma, 0.25) * 5) }
    })
    // Specks (less than half a percent) are noise, not a color of the photo.
    .filter((f) => f.share >= 0.005)
    .sort((p, q) => q.score - p.score)
  const chosen: typeof scored = []
  for (const f of scored) {
    if (chosen.length >= count) break
    const twin = chosen.find((c) => labDistance(c.lab, f.lab) < SAME_COLOR)
    if (twin) {
      // Counted with the color it looks like.
      twin.share += f.share
      continue
    }
    chosen.push({ ...f })
  }
  return chosen
    .map((c) => {
      const hex = labToHex(c.lab)
      const lab = hexToLab(hex)
      return { hex, share: c.share, lightness: Math.min(1, Math.max(0, lab.L)), chroma: chromaOf(lab) }
    })
    .sort((p, q) => p.lightness - q.lightness)
}

// A layer's photo: a picture (or drawing), or the photo filling a shape.
function photoOf(layer: Layer): HTMLCanvasElement | null {
  if (layer.kind === 'raster') return layer.canvas
  if (layer.kind === 'shape' && layer.fill.kind === 'photo') return layer.fill.canvas
  return null
}

// The photos the colors come from: the picked one when a photo is picked, otherwise every photo
// that can be seen.
export function photoSources(doc: EditorDocument, pickedId?: string): { canvases: HTMLCanvasElement[]; picked: boolean } {
  const pickedLayer = doc.layers.find((l) => l.id === pickedId)
  const own = pickedLayer && photoOf(pickedLayer)
  if (own) return { canvases: [own], picked: true }
  return { canvases: doc.layers.flatMap((l) => (l.visible && photoOf(l) ? [photoOf(l)!] : [])), picked: false }
}

// ---- Giving the design the photo's colors ----

// For each color used on shapes (most used first), the photo color that takes its place. Each
// keeps about how light it was, so dark stays dark and light stays light, and clear colors are
// preferred to grays. Different colors get different photo colors while there are enough.
export function shapeColorMap(colors: string[], palette: PaletteColor[]): Map<string, string> {
  const map = new Map<string, string>()
  if (palette.length === 0) return map
  const used = new Set<string>()
  for (const color of colors) {
    if (map.has(color)) continue
    const L = hexToLab(color).L
    let best = palette[0]
    let bestCost = Infinity
    for (const p of palette) {
      const cost = Math.abs(p.lightness - L) + 0.3 * (1 - Math.min(1, p.chroma / 0.15)) + (used.has(p.hex) ? 0.25 : 0)
      if (cost < bestCost) {
        bestCost = cost
        best = p
      }
    }
    used.add(best.hex)
    map.set(color, best.hex)
  }
  return map
}

// How well a color reads on what is behind some words: a plain color, or a measure of the real
// pixels behind them (see readable.ts).
export type Contrast = (color: string) => number
const on = (background: string | Contrast): Contrast => (typeof background === 'string' ? (color) => contrastRatio(color, background) : background)

// The photo color that reads best on the background. When none is clear enough, the best one is
// made darker (or lighter) until it is, so it keeps a tint of the photo.
export function textColorOn(background: string | Contrast, palette: PaletteColor[], needed = 4.5): string {
  const contrast = on(background)
  const plain = contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  const candidates = palette.map((p) => p.hex)
  if (candidates.length === 0) return plain
  const best = candidates.reduce((p, q) => (contrast(q) > contrast(p) ? q : p))
  if (contrast(best) >= needed) return best
  // Toward white or near-black, just until it reads.
  const from = hexToRgb(best)
  const end = hexToRgb(plain)
  for (let step = 1; step <= 20; step++) {
    const k = step / 20
    const hex = rgbToHex({ r: from.r + (end.r - from.r) * k, g: from.g + (end.g - from.g) * k, b: from.b + (end.b - from.b) * k })
    if (contrast(hex) >= needed) return hex
  }
  return plain
}

// A clear photo color for a few words with their own color (a name in red), if one reads well
// enough on the background; otherwise null.
function accentOn(contrast: Contrast, palette: PaletteColor[], except: string): string | null {
  const accents = palette.filter((p) => p.hex !== except && p.chroma > 0.06 && contrast(p.hex) >= 3)
  return accents.sort((p, q) => q.chroma - p.chroma)[0]?.hex ?? null
}

function shapeArea(layer: Layer): number {
  return layer.kind === 'shape' ? Math.abs(layer.box.width * layer.box.height) : 0
}

function recolorFill(fill: ShapeFill, map: Map<string, string>): ShapeFill {
  if (fill.kind === 'color') return { kind: 'color', color: map.get(fill.color) ?? fill.color }
  if (fill.kind === 'gradient') return { kind: 'gradient', gradient: { ...fill.gradient, stops: fill.gradient.stops.map((s) => ({ ...s, color: map.get(s.color) ?? s.color })) } }
  return fill
}

// Things that take part: visible shapes and texts that aren't locked.
const recolorable = (layer: Layer) => layer.visible && !layer.locked && (layer.kind === 'shape' || layer.kind === 'text')

// Gives the shapes and words on the page the photo's colors. Shapes take the photo's colors by how
// light they were; words take the photo color that reads best on what is behind them
// (`backgroundOf` says what is there, on the design with its shapes already recolored).
export function matchDesignToPalette(
  doc: EditorDocument,
  palette: PaletteColor[],
  backgroundOf: (doc: EditorDocument, layer: TextLayer) => string | Contrast,
  neededFor: (layer: TextLayer) => number = () => 4.5,
): EditorDocument {
  if (palette.length === 0) return doc
  const shapes = doc.layers.filter((l) => recolorable(l) && l.kind === 'shape').sort((p, q) => shapeArea(q) - shapeArea(p))
  const colors: string[] = []
  for (const layer of shapes) {
    if (layer.kind !== 'shape') continue
    if (layer.fill.kind === 'color') colors.push(layer.fill.color)
    if (layer.fill.kind === 'gradient') colors.push(...layer.fill.gradient.stops.map((s) => s.color))
    if (layer.outline) colors.push(layer.outline.color)
  }
  const map = shapeColorMap(colors, palette)
  let next: EditorDocument = {
    ...doc,
    layers: doc.layers.map((layer) =>
      recolorable(layer) && layer.kind === 'shape'
        ? { ...layer, fill: recolorFill(layer.fill, map), outline: layer.outline && { ...layer.outline, color: map.get(layer.outline.color) ?? layer.outline.color } }
        : layer,
    ),
  }
  // Words bottom to top, each on the design as recolored so far.
  for (const layer of next.layers) {
    if (!recolorable(layer) || layer.kind !== 'text' || layer.style.gradient) continue
    const background = on(backgroundOf(next, layer))
    const color = textColorOn(background, palette, neededFor(layer))
    const accent = accentOn(background, palette, color)
    const spans = layer.spans?.map((span) => (span.style.color && span.style.color !== layer.style.color ? { ...span, style: { ...span.style, color: accent ?? color } } : span))
    const changed: TextLayer = { ...layer, style: { ...layer.style, color }, ...(spans ? { spans } : {}) }
    next = { ...next, layers: next.layers.map((l) => (l.id === layer.id ? changed : l)) }
  }
  const same = next.layers.every((layer, i) => JSON.stringify(colorsOf(layer)) === JSON.stringify(colorsOf(doc.layers[i])))
  return same ? doc : next
}

// The colors a layer shows, to tell whether recoloring changed anything.
function colorsOf(layer: Layer): string[] {
  if (layer.kind === 'text') return [layer.style.color, ...(layer.spans ?? []).map((s) => s.style.color ?? '')]
  if (layer.kind !== 'shape') return []
  const fill = layer.fill.kind === 'color' ? [layer.fill.color] : layer.fill.kind === 'gradient' ? layer.fill.gradient.stops.map((s) => s.color) : []
  return [...fill, layer.outline?.color ?? '']
}

// How many shapes and texts would change color.
export function recoloredCount(before: EditorDocument, after: EditorDocument): number {
  return after.layers.filter((layer, i) => JSON.stringify(colorsOf(layer)) !== JSON.stringify(colorsOf(before.layers[i]))).length
}
