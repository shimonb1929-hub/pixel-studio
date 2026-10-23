import { mainDirection } from '../text/textLayer.ts'
import { arrangeBox } from './arrange.ts'
import { boxOf, withBox } from './documentOps.ts'
import { polygonBounds, unionRect, type Rect } from './geometry.ts'
import { createId } from './document.ts'
import { copyPageLayers, insertPages } from './pages.ts'
import { boxCorners, type TransformBox } from './transform.ts'
import type { DesignPage, EditorDocument, Layer } from './types.ts'

// One design made again at other sizes: a square post as a phone story, a website banner and a
// printed poster. No AI model is needed, only a few plain rules:
// - Something that covers the whole page (a photo or a color behind everything) covers the new
//   page too.
// - When the new page has about the same shape, everything grows or shrinks together and keeps its
//   place: what was near the left edge stays near the left edge, what was in the middle stays in
//   the middle.
// - When the new page is much wider, the rows of the design are set side by side in two columns.
//   When it's much taller, the columns are stacked one above the other. Hebrew and Yiddish designs
//   start on the right.

// How much the page's shape may change before things are set side by side or stacked.
const RESHAPE = 1.6
// Covering this much of the page, both ways, makes something a background.
const BACKGROUND_SHARE = 0.85
// The space kept free around the edge of the new page, as a share of its shorter side.
const MIN_MARGIN = 0.04
const MAX_MARGIN = 0.12

interface Unit {
  layers: Layer[]
  // Around what's drawn on the layers.
  rect: Rect
}

// Where a layer's box goes on the new page.
type Place = (box: TransformBox) => TransformBox

function drawnRect(layer: Layer): Rect | null {
  const box = arrangeBox(layer)
  return box && polygonBounds(boxCorners(box))
}

// Things kept together stay together; everything else is a unit of its own.
function units(layers: Layer[]): Unit[] {
  const byGroup = new Map<string, Layer[]>()
  const list: Layer[][] = []
  for (const layer of layers) {
    const group = layer.group?.id
    if (group && byGroup.has(group)) {
      byGroup.get(group)!.push(layer)
      continue
    }
    const members = [layer]
    if (group) byGroup.set(group, members)
    list.push(members)
  }
  return list.flatMap((members): Unit[] => {
    const rect = members.map(drawnRect).reduce<Rect | null>((all, r) => (r ? unionRect(all, r) : all), null)
    return rect ? [{ layers: members, rect }] : []
  })
}

function isBackground(rect: Rect, width: number, height: number): boolean {
  const across = Math.min(rect.x + rect.width, width) - Math.max(rect.x, 0)
  const down = Math.min(rect.y + rect.height, height) - Math.max(rect.y, 0)
  return across >= width * BACKGROUND_SHARE && down >= height * BACKGROUND_SHARE
}

// A layer placed with `place`, its outline, letters and effects growing by `scale`.
function placed(layer: Layer, place: Place, scale: number): Layer {
  const box = place(boxOf(layer))
  const next = withBox(layer, box, scale)
  const effects = layer.effects
  if (!effects || scale === 1) return next
  return {
    ...next,
    effects: {
      shadow: effects.shadow && { ...effects.shadow, blur: effects.shadow.blur * scale, distance: effects.shadow.distance * scale },
      glow: effects.glow && { ...effects.glow, size: effects.glow.size * scale },
      outline: effects.outline && { ...effects.outline, width: effects.outline.width * scale },
    },
  }
}

// Grows evenly by `k`, moving the point (fromX, fromY) to (toX, toY).
function evenly(k: number, fromX: number, fromY: number, toX: number, toY: number): Place {
  return (box) => ({ ...box, cx: toX + (box.cx - fromX) * k, cy: toY + (box.cy - fromY) * k, width: box.width * k, height: box.height * k })
}

// A background covers the new page. Plain shapes stretch to fill it; photos and words grow evenly
// until they cover it, so nothing gets squashed.
function placeBackground(unit: Unit, from: { width: number; height: number }, to: { width: number; height: number }): Layer[] {
  const sx = to.width / from.width
  const sy = to.height / from.height
  const even = Math.sqrt(sx * sy)
  const stretchy = unit.layers.every((l) => l.kind === 'shape' && Math.abs(Math.sin(l.box.rotation)) < 1e-9)
  if (stretchy) return unit.layers.map((l) => placed(l, (box) => ({ ...box, cx: box.cx * sx, cy: box.cy * sy, width: box.width * sx, height: box.height * sy }), even))
  const k = Math.max(sx, sy)
  return unit.layers.map((l) => placed(l, evenly(k, from.width / 2, from.height / 2, to.width / 2, to.height / 2), k))
}

// Where a thing goes along one side of the page when it keeps its place: near the start or end it
// keeps its (scaled) distance from that edge, otherwise it stays as far from the middle.
function keepPlace(start: number, size: number, from: number, to: number, k: number): number {
  const middle = (start + size / 2) / from
  if (size >= from * 0.6 || (middle >= 1 / 3 && middle <= 2 / 3)) return to / 2 + (start + size / 2 - from / 2) * k - (size * k) / 2
  if (middle < 1 / 3) return start * k
  return to - (from - start - size) * k - size * k
}

// Splits things into bands along one side: things whose extents overlap share a band.
function bands(list: Unit[], axis: 'x' | 'y'): Unit[][] {
  const start = (u: Unit) => (axis === 'y' ? u.rect.y : u.rect.x)
  const size = (u: Unit) => (axis === 'y' ? u.rect.height : u.rect.width)
  const sorted = [...list].sort((a, b) => start(a) - start(b))
  const result: Unit[][] = []
  let end = -Infinity
  for (const unit of sorted) {
    // A little overlap (like a shadow reaching into the next row) doesn't join two bands.
    const slack = Math.min(size(unit), result.length ? Math.max(...result.at(-1)!.map(size)) : 0) * 0.15
    if (result.length && start(unit) < end - slack) {
      result.at(-1)!.push(unit)
      end = Math.max(end, start(unit) + size(unit))
    } else {
      result.push([unit])
      end = start(unit) + size(unit)
    }
  }
  return result
}

function frame(list: Unit[]): Rect {
  return list.map((u) => u.rect).reduce<Rect | null>((all, r) => unionRect(all, r), null)!
}

// Splits bands in two, in order, so both halves are as close to the same length as can be.
function halves(list: Unit[][], axis: 'x' | 'y'): Unit[][] {
  const length = (part: Unit[][]) => {
    const f = frame(part.flat())
    return axis === 'y' ? f.height : f.width
  }
  let best = 1
  let bestLength = Infinity
  for (let i = 1; i < list.length; i++) {
    const longest = Math.max(length(list.slice(0, i)), length(list.slice(i)))
    if (longest < bestLength) {
      bestLength = longest
      best = i
    }
  }
  return [list.slice(0, best).flat(), list.slice(best).flat()]
}

// A photo, or a shape with a photo in it.
function hasPhoto(unit: Unit): boolean {
  return unit.layers.some((l) => l.kind === 'raster' || (l.kind === 'shape' && l.fill.kind === 'photo'))
}

// The rows of a design set in two columns: the row with the photo in one and the rest in the other
// (like a banner with the photo on one side and the words on the other), or else split evenly.
function columns(rows: Unit[][]): Unit[][] {
  const withPhoto = rows.filter((row) => row.some(hasPhoto))
  if (withPhoto.length === 1) return [withPhoto[0], rows.filter((row) => row !== withPhoto[0]).flat()]
  return halves(rows, 'y')
}

// Whether the design's words mostly read right to left.
function readsRightToLeft(layers: Layer[]): boolean {
  let rtl = 0
  let ltr = 0
  for (const layer of layers) {
    if (layer.kind !== 'text' || !layer.text.trim()) continue
    if (mainDirection(layer.text, layer.style.direction) === 'rtl') rtl += layer.text.length
    else ltr += layer.text.length
  }
  return rtl > ltr
}

// Sets parts next to each other (across) or one above the other (down), all at one scale, the whole
// arrangement in the middle of the free area. With `kept`, the parts are rows of one column: the
// space between them is the design's own, grown along, and room left over is shared out between
// them so a tall page doesn't end up with everything bunched in the middle.
function placeParts(parts: Unit[][], direction: 'across' | 'down', area: Rect, gap: number, cap: number, kept = false): Layer[] {
  const frames = parts.map(frame)
  const across = direction === 'across'
  const lengthOf = (f: Rect) => (across ? f.width : f.height)
  const breadthOf = (f: Rect) => (across ? f.height : f.width)
  // The design's own space between parts, or none when the gap is fixed.
  const own = frames.slice(1).map((f, i) => (kept ? Math.max(0, (across ? f.x : f.y) - ((across ? frames[i].x + frames[i].width : frames[i].y + frames[i].height))) : 0))
  const fixed = kept ? 0 : gap * (parts.length - 1)
  const room = across ? area.width : area.height
  const k = Math.min((room - fixed) / (frames.reduce((sum, f) => sum + lengthOf(f), 0) + own.reduce((a, b) => a + b, 0)), (across ? area.height : area.width) / Math.max(...frames.map(breadthOf)))
  const scale = Math.max(0.01, Math.min(k, cap))
  const used = frames.reduce((sum, f) => sum + lengthOf(f) * scale, 0) + fixed + own.reduce((a, b) => a + b, 0) * scale
  // Kept rows share what's left between them (and the edges), up to a calm amount each.
  const extra = kept ? Math.min(Math.max(0, room - used) / (parts.length + 1), gap * 2) : 0
  const spaces = own.map((g) => (kept ? g * scale + extra : gap))
  const total = used + extra * (parts.length - 1)
  let at = (across ? area.x + area.width / 2 : area.y + area.height / 2) - total / 2
  return parts.flatMap((part, i) => {
    const f = frames[i]
    const length = lengthOf(f) * scale
    const toX = across ? at + length / 2 : area.x + area.width / 2
    const toY = across ? area.y + area.height / 2 : at + length / 2
    at += length + (spaces[i] ?? 0)
    const place = evenly(scale, f.x + f.width / 2, f.y + f.height / 2, toX, toY)
    return part.flatMap((unit) => unit.layers.map((l) => placed(l, place, scale)))
  })
}

// The layers of the open page, made again for a page `width` by `height`. They're copies: the open
// page doesn't change. Without `copy`, pictures are shared with the open page, which is only right
// for a preview that is drawn and thrown away.
export function layersForSize(doc: EditorDocument, width: number, height: number, copy = true): Layer[] {
  const from = { width: doc.width, height: doc.height }
  const to = { width, height }
  const layers = copy ? copyPageLayers(doc.layers) : doc.layers
  const sx = width / from.width
  const sy = height / from.height
  const all = units(layers)
  const back = new Set(all.filter((u) => isBackground(u.rect, from.width, from.height)))
  const content = all.filter((u) => !back.has(u))
  const placedLayers = new Map<Layer, Layer>()
  for (const unit of back) {
    const next = placeBackground(unit, from, to)
    unit.layers.forEach((l, i) => placedLayers.set(l, next[i]))
  }

  if (content.length > 0) {
    const shapeChange = sx / sy
    const wider = shapeChange >= RESHAPE
    const taller = shapeChange <= 1 / RESHAPE
    // Much wider: the rows, split into two columns. Much taller: the columns, stacked.
    const split = wider ? bands(content, 'y') : taller ? bands(content, 'x') : []
    let next: Layer[]
    let order: Layer[]
    if (wider || taller) {
      // The free area keeps a margin like the one the design had.
      const f = frame(content)
      const shortSide = Math.min(from.width, from.height)
      const had = Math.max(0, Math.min(f.x, f.y, from.width - f.x - f.width, from.height - f.y - f.height)) / shortSide
      const margin = Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, had)) * Math.min(width, height)
      const area = { x: margin, y: margin, width: width - 2 * margin, height: height - 2 * margin }
      // Much taller with only one column: its rows are spread out down the page instead.
      const rows = taller && split.length < 2
      let parts = rows ? bands(content, 'y') : wider && split.length > 1 ? columns(split) : split
      if (wider && readsRightToLeft(layers)) parts = [...parts].reverse()
      // Things never grow past how much the page itself grew.
      next = placeParts(parts, wider ? 'across' : 'down', area, margin, Math.max(sx, sy), rows)
      order = parts.flat().flatMap((u) => u.layers)
    } else {
      // About the same shape: everything grows together and keeps its place on the page.
      const k = Math.min(sx, sy)
      next = []
      order = []
      for (const unit of content) {
        const left = keepPlace(unit.rect.x, unit.rect.width, from.width, width, k)
        const top = keepPlace(unit.rect.y, unit.rect.height, from.height, height, k)
        const place = evenly(k, unit.rect.x, unit.rect.y, left, top)
        for (const l of unit.layers) {
          next.push(placed(l, place, k))
          order.push(l)
        }
      }
    }
    order.forEach((l, i) => placedLayers.set(l, next[i]))
  }
  // Empty layers come along as they are; everything keeps its place in the stack.
  return layers.map((l) => placedLayers.get(l) ?? l)
}

// The open page as a new page of another size.
export function pageForSize(doc: EditorDocument, width: number, height: number): DesignPage {
  const layers = layersForSize(doc, width, height)
  const active = doc.layers.findIndex((l) => l.id === doc.activeLayerId)
  return { id: createId('page'), width, height, background: doc.background, pageGradient: doc.pageGradient ?? null, layers, activeLayerId: layers[active]?.id ?? '' }
}

// Adds the open page again at each size, right after it, and goes to the first one.
export function makeOtherSizes(doc: EditorDocument, sizes: { width: number; height: number }[]): EditorDocument {
  return insertPages(doc, sizes.map((size) => pageForSize(doc, size.width, size.height)))
}
