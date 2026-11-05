import { createCanvas, createId, getContext2d } from './document.ts'
import { mapPath, type ShapePath } from './path.ts'
import type { TraceImage, TraceOptions, TraceResult } from './trace.ts'
import { runTrace } from './traceRun.ts'
import { shapeFromPaths } from './traceLayers.ts'
import { drawText, eachFont, textReach } from '../text/textLayer.ts'
import { loadFont } from '../text/fonts.ts'
import type { EditorDocument, LayerGroup, Point, ShapeFill, ShapeLayer, TextLayer } from './types.ts'

// Words into shapes (pro: Create Outlines): the letters of a text become shapes, so each letter's
// outline can be bent, pulled and filled like any shape, and the design looks the same everywhere,
// even where its fonts are missing. Each color of the text becomes one shape. The words themselves
// stay hidden below, so they can still be changed and turned into shapes again.

// Letters are drawn this big while their outlines are found, so the curves come out smooth.
const LETTER_SIZE = 220
// The longest side drawn, so very long texts stay quick.
const MOST_SIDE = 4000

export function canBeShapes(layer: TextLayer): boolean {
  return !layer.flow && !layer.pageNumber && layer.text.trim().length > 0
}

// One color of the text: what fills its shape, and which letters have it.
interface Part {
  fill: ShapeFill
  // The color of words that have their own; null for the text's own fill.
  color: string | null
}

function partsOf(layer: TextLayer): Part[] {
  const own: ShapeFill = layer.photo
    ? { kind: 'photo', ...layer.photo }
    : layer.style.gradient
      ? { kind: 'gradient', gradient: layer.style.gradient }
      : { kind: 'color', color: layer.style.color }
  const parts: Part[] = [{ fill: own, color: null }]
  for (const span of layer.spans ?? []) {
    const color = span.style.color
    if (!color || color === layer.style.color || parts.some((p) => p.color === color)) continue
    parts.push({ fill: { kind: 'color', color }, color })
  }
  return parts
}

const INK = '#000000'
const PAPER = '#ffffff'

// The text drawn in black on white with only one part's letters showing, its box unturned,
// `scale` pixels for each design pixel, with `margin` design pixels around it.
function partPicture(layer: TextLayer, part: Part, scale: number, margin: number): TraceImage {
  const w = Math.abs(layer.box.width)
  const h = Math.abs(layer.box.height)
  const width = Math.max(1, Math.ceil((w + 2 * margin) * scale))
  const height = Math.max(1, Math.ceil((h + 2 * margin) * scale))
  const mine = (color: string | undefined) => (part.color === null ? !color || color === layer.style.color : color === part.color)
  const plain: TextLayer = {
    ...layer,
    box: { cx: w / 2 + margin, cy: h / 2 + margin, width: w, height: h, rotation: 0 },
    style: { ...layer.style, color: part.color === null ? INK : PAPER, gradient: null },
    spans: layer.spans?.map((span) => ({ ...span, style: { ...span.style, color: mine(span.style.color) ? INK : PAPER } })),
    photo: undefined,
  }
  if (!plain.spans) delete plain.spans
  delete plain.photo
  const canvas = createCanvas(width, height)
  const ctx = getContext2d(canvas)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, width, height)
  ctx.scale(scale, scale)
  drawText(ctx, plain)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

// How the letters are found: black ink on white paper, keeping every small mark (dots, accents
// and Hebrew vowel points).
const OPTIONS: TraceOptions = { mode: 'ink', colors: 2, cutoff: 0.5, detail: 0.85, dropBackground: true }

export interface WordPictures {
  scale: number
  margin: number
  parts: Part[]
  pictures: TraceImage[]
}

// Draws each color of the text, once its fonts are ready.
export async function wordPictures(layer: TextLayer): Promise<WordPictures> {
  await Promise.all(eachFont(layer).map((font) => loadFont(font.style, font.text)))
  const margin = textReach(layer)
  const longest = Math.max(Math.abs(layer.box.width), Math.abs(layer.box.height)) + 2 * margin
  const scale = Math.max(0.5, Math.min(LETTER_SIZE / Math.max(1, layer.style.size), MOST_SIDE / Math.max(1, longest)))
  const parts = partsOf(layer)
  return { scale, margin, parts, pictures: parts.map((part) => partPicture(layer, part, scale, margin)) }
}

// Finds the outlines of each color's letters, one after another. Null when it was stopped.
export async function traceWords(pictures: WordPictures): Promise<TraceResult[] | null> {
  const results: TraceResult[] = []
  for (const picture of pictures.pictures) {
    const result = await runTrace(picture, OPTIONS)
    if (!result) return null
    results.push(result)
  }
  return results
}

// The shapes, exactly over the text: one for each of its colors. Several are kept together under
// the text's own group, or a new one named after it.
export function wordShapes(layer: TextLayer, made: WordPictures, results: TraceResult[], name: string): ShapeLayer[] {
  const { box } = layer
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const fx = box.width < 0 ? -1 : 1
  const fy = box.height < 0 ? -1 : 1
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  const place = (p: Point): Point => {
    const x = (p.x / made.scale - made.margin - w / 2) * fx
    const y = (p.y / made.scale - made.margin - h / 2) * fy
    return { x: box.cx + x * cos - y * sin, y: box.cy + x * sin + y * cos }
  }
  const found = results.map((result, i) => ({ part: made.parts[i], paths: result.colors.flatMap((c) => c.paths) })).filter((f) => f.paths.length > 0)
  const group: LayerGroup | undefined = layer.group ?? (found.length > 1 ? { id: createId('group'), name } : undefined)
  return found.map(({ part, paths }): ShapeLayer => {
    const shape = shapeFromPaths(
      paths.map((p: ShapePath) => mapPath(p, place)),
      box.rotation,
    )
    return {
      id: createId('layer'),
      kind: 'shape',
      name,
      visible: true,
      opacity: layer.opacity,
      locked: false,
      adjust: layer.adjust,
      ...(group ? { group } : {}),
      ...(layer.effects ? { effects: layer.effects } : {}),
      ...(layer.blend ? { blend: layer.blend } : {}),
      box: shape.box,
      geometry: { type: 'path', corners: 0, sides: 5, arrow: false, path: shape.path, ...(shape.parts.length ? { parts: shape.parts } : {}) },
      fill: part.fill,
      outline: null,
    }
  })
}

// Puts the shapes just above the text and hides the text. The top shape is picked.
export function placeWordShapes(doc: EditorDocument, layerId: string, shapes: ShapeLayer[]): EditorDocument {
  const index = doc.layers.findIndex((l) => l.id === layerId)
  if (index === -1 || shapes.length === 0) return doc
  const layers = doc.layers.map((l) => (l.id === layerId ? { ...l, visible: false } : l))
  layers.splice(index + 1, 0, ...shapes)
  return { ...doc, layers, activeLayerId: shapes[shapes.length - 1].id }
}
