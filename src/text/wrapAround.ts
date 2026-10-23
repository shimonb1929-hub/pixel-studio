import { arrangeBox } from '../editor/arrange.ts'
import { rings } from '../editor/combine.ts'
import { canFill } from '../editor/objects.ts'
import { pageIndex } from '../editor/pages.ts'
import { pixelVersion } from '../editor/pixelVersion.ts'
import { fitTable } from '../editor/table.ts'
import { applyAffine, boxCorners, boxMatrix, translateAffine, type Affine } from '../editor/transform.ts'
import type { AvoidArea, EditorDocument, Layer, PixelLayer, Point, TextLayer, TextWrap } from '../editor/types.ts'
import { outlineBounds } from './avoid.ts'
import { hasRtlLetters } from './layout.ts'
import { reflowText } from './textFlow.ts'
import { fitText, textLocalPoint } from './textLayer.ts'

// Text that flows around pictures and shapes. A picture or shape with `textWrap` keeps text in a
// box out of its way; after every change, each paragraph box is told what it flows around (in its
// own coordinates), and its lines are laid out with that room. Only boxes that wrap their lines
// take part: text that only breaks where Enter was pressed has no width to flow in. Text on every
// page stays as it is, since each page's copy has to be the same.

// The space kept around a picture or shape, as a share of the design's shorter side.
export const WRAP_GAP_SHARE = 0.015

export function defaultTextWrap(doc: Pick<EditorDocument, 'width' | 'height'>): TextWrap {
  return { mode: 'shape', gap: Math.max(1, Math.round(Math.min(doc.width, doc.height) * WRAP_GAP_SHARE)) }
}

// Whether text can flow around a layer: pictures and shapes can, text can't.
export function canWrapText(layer: Layer | null | undefined): boolean {
  return !!layer && layer.kind !== 'text'
}

// Pictures are looked at this small to find the outline of what's drawn on them.
const SAMPLE = 200
// A pixel at least this solid counts as part of the picture.
const SOLID = 24

const pictureOutlines = new WeakMap<HTMLCanvasElement, { version: number; outlines: Point[][] }>()

// The outline of what's drawn on a picture, in its own pixels: row by row, from its leftmost to its
// rightmost solid pixel. A photo with its background taken away has the outline of what's left.
function drawnOutlines(canvas: HTMLCanvasElement): Point[][] {
  const version = pixelVersion(canvas)
  const cached = pictureOutlines.get(canvas)
  if (cached && cached.version === version) return cached.outlines
  const scale = Math.min(1, SAMPLE / Math.max(canvas.width, canvas.height, 1))
  const w = Math.max(1, Math.round(canvas.width * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const ctx = small.getContext('2d', { willReadFrequently: true })
  const outlines: Point[][] = []
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    const sx = canvas.width / w
    const sy = canvas.height / h
    let left: Point[] = []
    let right: Point[] = []
    const close = () => {
      if (left.length) outlines.push([...left, ...right.reverse()])
      left = []
      right = []
    }
    for (let y = 0; y < h; y++) {
      let min = -1
      let max = -1
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] < SOLID) continue
        if (min < 0) min = x
        max = x
      }
      if (min < 0) {
        close()
        continue
      }
      left.push({ x: min * sx, y: y * sy }, { x: min * sx, y: (y + 1) * sy })
      right.push({ x: (max + 1) * sx, y: y * sy }, { x: (max + 1) * sx, y: (y + 1) * sy })
    }
    close()
  }
  pictureOutlines.set(canvas, { version, outlines })
  return outlines
}

function pictureMatrix(layer: PixelLayer): Affine {
  return layer.box ? boxMatrix(layer.box, layer.canvas.width, layer.canvas.height) : translateAffine(layer.x, layer.y)
}

// What text keeps out of, in the design: the outlines, and the space kept around them (a shape's
// outline line counts as part of it).
export function wrapOutlines(layer: Layer): { outlines: Point[][]; gap: number } | null {
  const wrap = layer.textWrap
  if (!wrap || layer.kind === 'text') return null
  if (wrap.mode === 'shape') {
    if (layer.kind === 'shape' && canFill(layer.geometry)) {
      const outlines = rings(layer).map((ring) => ring.map(([x, y]) => ({ x, y })))
      return { outlines, gap: wrap.gap + (layer.outline ? layer.outline.width / 2 : 0) }
    }
    if (layer.kind === 'raster') {
      const m = pictureMatrix(layer)
      return { outlines: drawnOutlines(layer.canvas).map((outline) => outline.map((p) => applyAffine(m, p))), gap: wrap.gap }
    }
  }
  const box = arrangeBox(layer)
  if (!box) return null
  const outline = layer.kind === 'shape' && layer.outline ? layer.outline.width / 2 : 0
  return { outlines: [boxCorners(box)], gap: wrap.gap + outline }
}

const round = (n: number) => Math.round(n * 100) / 100

// What a paragraph box flows around: the things that overlap it or sit below its top, where it
// could grow into them.
export function areasFor(text: TextLayer, things: { layer: Layer; outlines: Point[][]; gap: number }[]): AvoidArea[] {
  const width = Math.abs(text.box.width)
  const rtl = text.style.direction === 'rtl' || (text.style.direction === 'auto' && hasRtlLetters(text.flow?.full ?? text.text))
  const areas: AvoidArea[] = []
  for (const thing of things) {
    const outlines = thing.outlines.map((outline) => outline.map((p) => {
      const local = textLocalPoint(text, p)
      return { x: round(local.x), y: round(local.y) }
    }))
    const { minX, maxX, maxY } = outlineBounds(outlines)
    const gap = round(thing.gap)
    if (!(maxY + gap > 0) || maxX + gap <= 0 || minX - gap >= width) continue
    // Text runs down the side with more room; when both have the same, the side it starts reading from.
    const roomLeft = minX - gap
    const roomRight = width - maxX - gap
    const side = thing.layer.textWrap?.mode === 'jump' ? 'none' : roomRight > roomLeft + 0.5 ? 'right' : roomLeft > roomRight + 0.5 ? 'left' : rtl ? 'right' : 'left'
    areas.push({ outlines, gap, side })
  }
  return areas
}

function sameAreas(a: AvoidArea[] | undefined, b: AvoidArea[]): boolean {
  if (!a?.length) return b.length === 0
  return JSON.stringify(a) === JSON.stringify(b)
}

// Whether a text takes part: boxes that wrap their lines, apart from text on every page.
function flows(layer: TextLayer): boolean {
  return layer.wrap && !layer.everyPage && !layer.pageNumber
}

type Thing = { layer: Layer; outlines: Point[][]; gap: number }

// The things on a page that text flows around.
function wrapThings(layers: Layer[]): Thing[] {
  return layers.flatMap((layer) => {
    if (!layer.visible || !layer.textWrap) return []
    const found = wrapOutlines(layer)
    return found ? [{ layer, ...found }] : []
  })
}

// A text told what it flows around. The same text when nothing changes.
function wrapped(layer: TextLayer, things: Thing[]): TextLayer {
  const areas = flows(layer) ? areasFor(layer, things) : []
  if (sameAreas(layer.avoid, areas)) return layer
  const { avoid: _, ...rest } = layer
  const updated: TextLayer = areas.length ? { ...rest, avoid: areas } : rest
  // Text running from box to box is split again afterwards; other text grows or shrinks to fit.
  return updated.flow ? updated : fitText(updated)
}

// A text being typed (which isn't on the page yet) flowing around what's on the page.
export function wrapTextOn(layers: Layer[], text: TextLayer): TextLayer {
  return wrapped(text, wrapThings(layers))
}

// One page's layers with every paragraph box told what it flows around. The same list when
// nothing changes.
export function wrapLayers(layers: Layer[]): Layer[] {
  const things = wrapThings(layers)
  if (things.length === 0 && !layers.some((l) => l.kind === 'text' && l.avoid)) return layers
  let changed = false
  const next = layers.map((layer) => {
    if (layer.kind !== 'text') return layer
    const updated = wrapped(layer, things)
    if (updated !== layer) changed = true
    return updated
  })
  return changed ? next : layers
}

// The design with text flowing around pictures and shapes on every page, and text running from box
// to box split again. The same design when nothing changes.
// Tables fitted to their rows again (a font that arrived can make the words taller).
function fitTables(layers: Layer[]): Layer[] {
  let changed = false
  const fitted = layers.map((layer) => {
    if (layer.kind !== 'table') return layer
    const next = fitTable(layer)
    if (next !== layer) changed = true
    return next
  })
  return changed ? fitted : layers
}

export function settleText(doc: EditorDocument): EditorDocument {
  const layers = wrapLayers(fitTables(doc.layers))
  let next = reflowText(layers === doc.layers ? doc : { ...doc, layers })
  const index = pageIndex(doc)
  if (next.pages) {
    let changed = false
    const pages = next.pages.map((page, i) => {
      if (i === index) return page
      const wrapped = wrapLayers(fitTables(page.layers))
      if (wrapped === page.layers) return page
      changed = true
      return { ...page, layers: reflowText({ ...next, layers: wrapped, pages: undefined, pageIndex: undefined }).layers }
    })
    if (changed) next = { ...next, pages }
  }
  return next
}
