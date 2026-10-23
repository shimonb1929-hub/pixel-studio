import type { Adjustments } from './adjust.ts'
import { drawLayer } from './compose.ts'
import { BLEND_MODES, hasEffects, type BlendMode, type LayerEffects } from './effects.ts'
import { createCanvas, createDesignId, createId, getContext2d, layerFromCanvas, MAX_LAYER_SIDE, validateDocumentSize } from './document.ts'
import { EXPORT_FORMATS } from './fileNames.ts'
import { pixelVersion } from './pixelVersion.ts'
import type { Selection, SelectionOp } from './selection.ts'
import type { TransformBox } from './transform.ts'
import type { TextAlign, TextDirection } from '../text/layout.ts'
import { loadDesignFonts } from '../text/textLayer.ts'
import { tidyGroups } from './layers.ts'
import { allPages, pageIndex } from './pages.ts'
import type { DesignPage, EditorDocument, Layer, LayerGroup, Point, ShapeGeometry, ShapeOutline, ShapeType, TextStyle } from './types.ts'
import { paintPage, type Gradient, type GradientStop } from './gradient.ts'
import type { PathNode, ShapePath } from './path.ts'
import { msg, t } from '../i18n/i18n.ts'
import { MAX_PPI } from './units.ts'

// A project keeps everything needed to carry on editing later: the design's size, every layer
// with its pixels, position and settings, and the selection. The same format is used for
// project files people download and for designs kept in the browser.
//
// Layout: the letters "PXSTUDIO", the length of the description as 4 bytes (little-endian),
// the description as JSON text, then the pictures as PNGs, one after another: each pixel layer's
// pixels, and each photo inside a shape, in layer order.
//
// Version 2 added shapes, resized and turned pictures (box), locks and editable adjustments.
// Version 3 added text. Version 4 added the page color, and designs with nothing on the page yet.
// Version 5 added things kept together (group). Version 6 added effects (shadow, glow, outline) and
// blend modes. Version 7 added pen paths and gradient fills. Version 8 added designs with several
// pages (pages): then each page has its own layers, and the pictures come page by page. Older files
// still open.

export const PROJECT_VERSION = 8

const MAGIC = 'PXSTUDIO'
const HEADER_BYTES = MAGIC.length + 4
const MAX_LAYERS = 1000
const MAX_PAGES = 500
const MAX_DESCRIPTION_BYTES = 64 * 1024 * 1024
// All layers together. Far beyond what a browser tab could hold anyway.
const MAX_TOTAL_PIXELS = 1_000_000_000
const MAX_NAME_LENGTH = 200

interface ProjectLayerBase {
  name: string
  visible: boolean
  opacity: number
  locked: boolean
  adjust: Adjustments | null
  // Layers kept together share one group.
  group?: LayerGroup
  effects?: LayerEffects | null
  blend?: BlendMode
}

export interface ProjectPixelLayer extends ProjectLayerBase {
  kind: 'raster'
  x: number
  y: number
  width: number
  height: number
  box: TransformBox | null
  // The length of this layer's PNG, which comes right after the previous picture's.
  bytes: number
}

export type ProjectFill =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; gradient: Gradient }
  | { kind: 'photo'; zoom: number; x: number; y: number; width: number; height: number; bytes: number }

export interface ProjectShapeLayer extends ProjectLayerBase {
  kind: 'shape'
  box: TransformBox
  geometry: ShapeGeometry
  fill: ProjectFill
  outline: ShapeOutline | null
}

export interface ProjectTextLayer extends ProjectLayerBase {
  kind: 'text'
  box: TransformBox
  text: string
  style: TextStyle
  wrap: boolean
}

export type ProjectLayer = ProjectPixelLayer | ProjectShapeLayer | ProjectTextLayer

// The PNGs a layer brings along, in order.
function pictureSizes(layer: ProjectLayer): number[] {
  if (layer.kind === 'raster') return [layer.bytes]
  if (layer.kind === 'text') return []
  return layer.fill.kind === 'photo' ? [layer.fill.bytes] : []
}

export interface ProjectManifest {
  version: number
  name: string
  width: number
  height: number
  // The page's color, or null when it's see-through. Older files had a layer for it instead.
  background: string | null
  pageGradient?: Gradient
  // Pixels per inch on paper. Older files don't have it.
  ppi?: number
  // Which layer was selected, counted from the bottom; -1 when the page was picked.
  activeLayer: number
  selection: Selection | null
  // Bottom layer first.
  layers: ProjectLayer[]
  // A design with several pages has them here instead of `layers`, and `page` says which page was
  // being worked on.
  pages?: ProjectPage[]
  page?: number
}

export interface ProjectPage {
  background: string | null
  // Colors fading across the page instead of one color. Older files don't have it.
  pageGradient?: Gradient
  activeLayer: number
  layers: ProjectLayer[]
}

// Every page in a project, also for one-page files.
function manifestPages(manifest: ProjectManifest): ProjectPage[] {
  return manifest.pages ?? [{ background: manifest.background, pageGradient: manifest.pageGradient, activeLayer: manifest.activeLayer, layers: manifest.layers }]
}

// A problem with the file itself, explained in plain words.
export class ProjectError extends Error {}

const DAMAGED = msg("This project file is damaged, so it can't be opened.")
const TOO_NEW =
  msg('This project was saved by a newer version of Pixel Studio. Reload this page to get the newest version, then open it again.')

export function packProject(manifest: ProjectManifest, images: Blob[]): Blob {
  const description = new TextEncoder().encode(JSON.stringify(manifest))
  const header = new Uint8Array(HEADER_BYTES)
  header.set(new TextEncoder().encode(MAGIC))
  new DataView(header.buffer).setUint32(MAGIC.length, description.length, true)
  return new Blob([header, description, ...images], { type: EXPORT_FORMATS.project.mime })
}

async function hasMagic(file: Blob): Promise<boolean> {
  const start = new Uint8Array(await file.slice(0, MAGIC.length).arrayBuffer())
  return new TextDecoder().decode(start) === MAGIC
}

// True if the file is a Pixel Studio project, whatever its name.
export async function isProjectFile(file: Blob): Promise<boolean> {
  return file.size >= HEADER_BYTES && hasMagic(file)
}

// Reads the description and finds each picture's PNG, without decoding any pixels yet.
export async function unpackProject(file: Blob): Promise<{ manifest: ProjectManifest; images: Blob[] }> {
  if (file.size < HEADER_BYTES || !(await hasMagic(file))) throw new ProjectError(t(DAMAGED))
  const length = new DataView(await file.slice(MAGIC.length, HEADER_BYTES).arrayBuffer()).getUint32(0, true)
  if (length > MAX_DESCRIPTION_BYTES || HEADER_BYTES + length > file.size) throw new ProjectError(t(DAMAGED))
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(HEADER_BYTES, HEADER_BYTES + length).arrayBuffer()))
  } catch {
    throw new ProjectError(t(DAMAGED))
  }
  const manifest = validateManifest(parsed)
  let offset = HEADER_BYTES + length
  const images = manifestPages(manifest).flatMap((page) => page.layers).flatMap(pictureSizes).map((bytes) => {
    const image = file.slice(offset, offset + bytes, 'image/png')
    offset += bytes
    return image
  })
  if (offset > file.size) throw new ProjectError(t(DAMAGED))
  return { manifest, images }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7
}

function isBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max
}

function damaged(): never {
  throw new ProjectError(t(DAMAGED))
}

function readBox(value: unknown): TransformBox {
  if (!isRecord(value)) damaged()
  const { cx, cy, width, height, rotation } = value
  if (!isCoordinate(cx) || !isCoordinate(cy) || !isCoordinate(width) || !isCoordinate(height) || !isBetween(rotation, -10, 10)) damaged()
  if (Math.abs(width) < 0.01 || Math.abs(height) < 0.01) damaged()
  return { cx, cy, width, height, rotation }
}

const ADJUSTMENT_KEYS = ['brightness', 'contrast', 'saturation', 'warmth', 'blur', 'sharpen'] as const

function readAdjust(value: unknown): Adjustments | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) damaged()
  const settings = {} as Adjustments
  for (const key of ADJUSTMENT_KEYS) {
    const v = value[key]
    const min = key === 'blur' || key === 'sharpen' ? 0 : -1
    if (!isBetween(v, min, 1)) damaged()
    settings[key] = v
  }
  return settings
}

const MAX_EFFECT_SIZE = 100000

function readEffects(value: unknown): LayerEffects | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) damaged()
  const { shadow, glow, outline } = value
  const effects: LayerEffects = { shadow: null, glow: null, outline: null }
  if (shadow !== null && shadow !== undefined) {
    if (!isRecord(shadow) || !isBetween(shadow.opacity, 0, 1) || !isBetween(shadow.blur, 0, MAX_EFFECT_SIZE)) damaged()
    if (!isBetween(shadow.distance, 0, MAX_EFFECT_SIZE) || !isBetween(shadow.angle, -360, 360)) damaged()
    effects.shadow = { color: readColor(shadow.color), opacity: shadow.opacity, blur: shadow.blur, distance: shadow.distance, angle: shadow.angle }
  }
  if (glow !== null && glow !== undefined) {
    if (!isRecord(glow) || !isBetween(glow.opacity, 0, 1) || !isBetween(glow.size, 0, MAX_EFFECT_SIZE)) damaged()
    effects.glow = { color: readColor(glow.color), opacity: glow.opacity, size: glow.size }
  }
  if (outline !== null && outline !== undefined) {
    if (!isRecord(outline) || !isBetween(outline.width, 0, MAX_EFFECT_SIZE)) damaged()
    effects.outline = { color: readColor(outline.color), width: outline.width }
  }
  return hasEffects(effects) ? effects : null
}

function readBlend(value: unknown): BlendMode | undefined {
  if (value === undefined || value === 'normal') return undefined
  if (!BLEND_MODES.some((b) => b.mode === value)) damaged()
  return value as BlendMode
}

const COLOR = /^#[0-9a-f]{6}$/i
const SHAPE_TYPES: ShapeType[] = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'path']
const MAX_PATH_NODES = 100_000
// Path points are relative to the box, so they stay near -0.5 to 0.5; handles may reach further.
const PATH_REACH = 1e6

function readColor(value: unknown): string {
  if (typeof value !== 'string' || !COLOR.test(value)) damaged()
  return value
}

function readPoint(value: unknown): Point {
  if (!isRecord(value) || !isBetween(value.x, -PATH_REACH, PATH_REACH) || !isBetween(value.y, -PATH_REACH, PATH_REACH)) damaged()
  return { x: value.x, y: value.y }
}

function readPath(value: unknown): ShapePath {
  if (!isRecord(value) || !Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > MAX_PATH_NODES || typeof value.closed !== 'boolean') damaged()
  const nodes = value.nodes.map((node: unknown): PathNode => {
    if (!isRecord(node) || typeof node.smooth !== 'boolean') damaged()
    const { x, y } = readPoint(node)
    return { x, y, in: readPoint(node.in), out: readPoint(node.out), smooth: node.smooth }
  })
  return { nodes, closed: value.closed }
}

function readGeometry(value: unknown): ShapeGeometry {
  if (!isRecord(value) || !SHAPE_TYPES.includes(value.type as ShapeType)) damaged()
  if (!isBetween(value.corners, 0, 1) || !isWhole(value.sides, 3, 64) || typeof value.arrow !== 'boolean') damaged()
  const geometry: ShapeGeometry = { type: value.type as ShapeType, corners: value.corners, sides: value.sides, arrow: value.arrow }
  if (geometry.type === 'path') geometry.path = readPath(value.path)
  return geometry
}

function readGradient(value: unknown): Gradient {
  if (!isRecord(value) || (value.type !== 'linear' && value.type !== 'radial') || !isBetween(value.angle, -3600, 3600)) damaged()
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 64) damaged()
  const stops = value.stops.map((stop: unknown): GradientStop => {
    if (!isRecord(stop) || !isBetween(stop.at, 0, 1) || !isBetween(stop.opacity, 0, 1)) damaged()
    return { at: stop.at, color: readColor(stop.color), opacity: stop.opacity }
  })
  return { type: value.type, angle: value.angle, stops }
}

function readFill(value: unknown): ProjectFill {
  if (!isRecord(value)) damaged()
  if (value.kind === 'none') return { kind: 'none' }
  if (value.kind === 'color') return { kind: 'color', color: readColor(value.color) }
  if (value.kind === 'gradient') return { kind: 'gradient', gradient: readGradient(value.gradient) }
  if (
    value.kind !== 'photo' ||
    !isBetween(value.zoom, 1, 20) ||
    !isBetween(value.x, -1, 1) ||
    !isBetween(value.y, -1, 1) ||
    !isWhole(value.width, 1, MAX_LAYER_SIDE) ||
    !isWhole(value.height, 1, MAX_LAYER_SIDE) ||
    !isWhole(value.bytes, 1, Number.MAX_SAFE_INTEGER)
  ) {
    damaged()
  }
  return { kind: 'photo', zoom: value.zoom, x: value.x, y: value.y, width: value.width, height: value.height, bytes: value.bytes }
}

function readOutline(value: unknown): ShapeOutline | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !isBetween(value.width, 0, 10000)) damaged()
  return { color: readColor(value.color), width: value.width }
}

const TEXT_ALIGNS: TextAlign[] = ['auto', 'left', 'center', 'right', 'justify']
const TEXT_DIRECTIONS: TextDirection[] = ['auto', 'rtl', 'ltr']
const MAX_TEXT_LENGTH = 1_000_000

function readTextStyle(value: unknown): TextStyle {
  if (!isRecord(value)) damaged()
  const { font, size, weight, italic, color, align, direction, letterSpacing, lineHeight } = value
  if (typeof font !== 'string' || font.length === 0 || font.length > 100) damaged()
  if (!isBetween(size, 0.1, 100000) || !isBetween(weight, 1, 1000) || typeof italic !== 'boolean') damaged()
  if (!TEXT_ALIGNS.includes(align as TextAlign) || !TEXT_DIRECTIONS.includes(direction as TextDirection)) damaged()
  if (!isBetween(letterSpacing, -1, 5) || !isBetween(lineHeight, 0.3, 10)) damaged()
  return { font, size, weight, italic, color: readColor(color), align: align as TextAlign, direction: direction as TextDirection, letterSpacing, lineHeight }
}

function readGroup(group: unknown): { group?: LayerGroup } {
  if (group === undefined) return {}
  if (!isRecord(group) || typeof group.id !== 'string' || group.id.length > MAX_NAME_LENGTH || typeof group.name !== 'string') damaged()
  return { group: { id: group.id, name: group.name.slice(0, MAX_NAME_LENGTH) } }
}

// Checks one layer's description. Settings missing from version 1 files get their defaults.
function readLayer(layer: unknown): ProjectLayer {
  if (!isRecord(layer) || typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' || !isBetween(layer.opacity, 0, 1)) damaged()
  if (layer.locked !== undefined && typeof layer.locked !== 'boolean') damaged()
  const base: ProjectLayerBase = {
    name: layer.name.slice(0, MAX_NAME_LENGTH),
    visible: layer.visible,
    opacity: layer.opacity,
    locked: layer.locked === true,
    adjust: readAdjust(layer.adjust),
    ...readGroup(layer.group),
  }
  const effects = readEffects(layer.effects)
  if (effects) base.effects = effects
  const blend = readBlend(layer.blend)
  if (blend) base.blend = blend
  if (layer.kind === 'shape') {
    return { ...base, kind: 'shape', box: readBox(layer.box), geometry: readGeometry(layer.geometry), fill: readFill(layer.fill), outline: readOutline(layer.outline) }
  }
  if (layer.kind === 'text') {
    if (typeof layer.text !== 'string' || layer.text.length > MAX_TEXT_LENGTH || typeof layer.wrap !== 'boolean') damaged()
    return { ...base, kind: 'text', box: readBox(layer.box), text: layer.text, style: readTextStyle(layer.style), wrap: layer.wrap }
  }
  if (
    layer.kind !== 'raster' ||
    !isWhole(layer.x, -1e7, 1e7) ||
    !isWhole(layer.y, -1e7, 1e7) ||
    !isWhole(layer.width, 1, MAX_LAYER_SIDE) ||
    !isWhole(layer.height, 1, MAX_LAYER_SIDE) ||
    !isWhole(layer.bytes, 1, Number.MAX_SAFE_INTEGER)
  ) {
    damaged()
  }
  const box = layer.box === null || layer.box === undefined ? null : readBox(layer.box)
  return { ...base, kind: 'raster', x: layer.x, y: layer.y, width: layer.width, height: layer.height, box, bytes: layer.bytes }
}

function picturePixels(layer: ProjectLayer): number {
  if (layer.kind === 'raster') return layer.width * layer.height
  if (layer.kind === 'text') return 0
  return layer.fill.kind === 'photo' ? layer.fill.width * layer.fill.height : 0
}

function readSelection(value: unknown): Selection | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !Array.isArray(value.ops)) throw new ProjectError(t(DAMAGED))
  const ops = value.ops.map((op): SelectionOp => {
    if (isRecord(op) && op.kind === 'invert') return { kind: 'invert' }
    if (!isRecord(op) || op.kind !== 'polygon' || typeof op.subtract !== 'boolean' || !Array.isArray(op.points)) {
      throw new ProjectError(t(DAMAGED))
    }
    const points = op.points.map((p) => {
      if (!isRecord(p) || !isCoordinate(p.x) || !isCoordinate(p.y)) throw new ProjectError(t(DAMAGED))
      return { x: p.x, y: p.y }
    })
    return { kind: 'polygon', subtract: op.subtract, points }
  })
  return ops.length > 0 ? { ops } : null
}

// Checks everything in a project's description, so a damaged or made-up file can't break the editor.
export function validateManifest(value: unknown): ProjectManifest {
  if (!isRecord(value) || !Number.isInteger(value.version) || (value.version as number) < 1) damaged()
  if ((value.version as number) > PROJECT_VERSION) throw new ProjectError(t(TOO_NEW))
  const { name, width, height, ppi } = value
  if (ppi !== undefined && !isBetween(ppi, 1, MAX_PPI)) damaged()
  if (typeof name !== 'string' || typeof width !== 'number' || typeof height !== 'number' || validateDocumentSize(width, height)) damaged()
  const main = readPage(value)
  let pages: ProjectPage[] | undefined
  let page: number | undefined
  if (value.pages !== undefined) {
    if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > MAX_PAGES) damaged()
    pages = value.pages.map((p) => (isRecord(p) ? readPage(p) : damaged()))
    if (!isWhole(value.page, 0, pages.length - 1)) damaged()
    page = value.page
  }
  const all = pages ?? [main]
  if (all.reduce((sum, p) => sum + p.layers.length, 0) > MAX_LAYERS) damaged()
  const totalPixels = all.flatMap((p) => p.layers).reduce((sum, layer) => sum + picturePixels(layer), 0)
  if (totalPixels > MAX_TOTAL_PIXELS) throw new ProjectError(t('This project is too big for Pixel Studio to open.'))
  return {
    version: value.version as number,
    name: name.slice(0, MAX_NAME_LENGTH),
    width,
    height,
    ...main,
    ...(ppi === undefined ? {} : { ppi }),
    selection: readSelection(value.selection),
    ...(pages ? { pages, page } : {}),
  }
}

function readPage(value: Record<string, unknown>): ProjectPage {
  const { activeLayer, layers, background, pageGradient } = value
  if (!Array.isArray(layers) || layers.length > MAX_LAYERS) damaged()
  const checked = layers.map(readLayer)
  if (!isWhole(activeLayer, -1, checked.length - 1)) damaged()
  const color = background === undefined || background === null ? null : readColor(background)
  return { background: color, ...(color && pageGradient !== undefined ? { pageGradient: readGradient(pageGradient) } : {}), activeLayer, layers: checked }
}

// Encoding a big picture takes a moment, so each PNG is kept until its pixels change.
const encoded = new WeakMap<HTMLCanvasElement, { version: number; png: Blob }>()

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const version = pixelVersion(canvas)
  const cached = encoded.get(canvas)
  if (cached && cached.version === version) return Promise.resolve(cached.png)
  return new Promise((resolve, reject) => {
    // The browser copies the pixels right away, so painting while it encodes is fine.
    canvas.toBlob((png) => {
      if (!png) {
        reject(new Error(t('Saving failed. A layer may be too large for this browser.')))
        return
      }
      encoded.set(canvas, { version, png })
      resolve(png)
    }, 'image/png')
  })
}

// The pictures a layer brings along: its pixels, or the photo inside a shape.
function layerPictures(layer: Layer): HTMLCanvasElement[] {
  if (layer.kind === 'raster') return [layer.canvas]
  if (layer.kind === 'text') return []
  return layer.fill.kind === 'photo' ? [layer.fill.canvas] : []
}

function describeLayer(layer: Layer, sizes: number[]): ProjectLayer {
  const base: ProjectLayerBase = {
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    locked: layer.locked,
    adjust: layer.adjust,
    ...(layer.group ? { group: layer.group } : {}),
    effects: hasEffects(layer.effects) ? layer.effects : null,
    blend: layer.blend && layer.blend !== 'normal' ? layer.blend : undefined,
  }
  if (layer.kind === 'raster') {
    return { ...base, kind: 'raster', x: layer.x, y: layer.y, width: layer.canvas.width, height: layer.canvas.height, box: layer.box, bytes: sizes[0] }
  }
  if (layer.kind === 'text') return { ...base, kind: 'text', box: layer.box, text: layer.text, style: layer.style, wrap: layer.wrap }
  const { fill } = layer
  const savedFill: ProjectFill =
    fill.kind === 'photo'
      ? { kind: 'photo', zoom: fill.zoom, x: fill.x, y: fill.y, width: fill.canvas.width, height: fill.canvas.height, bytes: sizes[0] }
      : fill
  return { ...base, kind: 'shape', box: layer.box, geometry: layer.geometry, fill: savedFill, outline: layer.outline }
}

export async function encodeProject(doc: EditorDocument): Promise<Blob> {
  // Pages are read now, before waiting, so later changes don't end up half in the file.
  const pages = allPages(doc)
  const pictures = await Promise.all(pages.map((page) => Promise.all(page.layers.map((layer) => Promise.all(layerPictures(layer).map(canvasPng))))))
  const described = pages.map((page, p): ProjectPage => ({
    background: page.background,
    ...(page.background && page.pageGradient ? { pageGradient: page.pageGradient } : {}),
    activeLayer: page.layers.findIndex((layer) => layer.id === page.activeLayerId),
    layers: page.layers.map((layer, i) => describeLayer(layer, pictures[p][i].map((png) => png.size))),
  }))
  const several = pages.length > 1
  const manifest: ProjectManifest = {
    version: PROJECT_VERSION,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    ...(several ? { background: doc.background, ...(described[pageIndex(doc)].pageGradient ? { pageGradient: described[pageIndex(doc)].pageGradient } : {}), activeLayer: -1, layers: [] } : described[0]),
    ...(doc.ppi ? { ppi: doc.ppi } : {}),
    selection: doc.selection,
    ...(several ? { pages: described, page: pageIndex(doc) } : {}),
  }
  return packProject(manifest, pictures.flat(2))
}

async function decodePicture(png: Blob, width: number, height: number): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(png)
  } catch {
    damaged()
  }
  try {
    if (bitmap.width !== width || bitmap.height !== height) damaged()
    const canvas = createCanvas(width, height)
    getContext2d(canvas).drawImage(bitmap, 0, 0)
    return canvas
  } finally {
    bitmap.close()
  }
}

async function decodeLayer(info: ProjectLayer, pngs: Blob[]): Promise<Layer> {
  const layer = await decodeLayerKind(info, pngs)
  return info.group ? { ...layer, group: info.group } : layer
}

async function decodeLayerKind(info: ProjectLayer, pngs: Blob[]): Promise<Layer> {
  const { name, visible, opacity, locked, adjust } = info
  const extras: Pick<Layer, 'effects' | 'blend'> = {}
  if (info.effects) extras.effects = info.effects
  if (info.blend) extras.blend = info.blend
  if (info.kind === 'raster') {
    const canvas = await decodePicture(pngs[0], info.width, info.height)
    return { ...layerFromCanvas(name, canvas, info.x, info.y), box: info.box, visible, opacity, locked, adjust, ...extras }
  }
  if (info.kind === 'text') {
    return { id: createId('layer'), kind: 'text', name, visible, opacity, locked, adjust, ...extras, box: info.box, text: info.text, style: info.style, wrap: info.wrap }
  }
  const fill =
    info.fill.kind === 'photo'
      ? { kind: 'photo' as const, canvas: await decodePicture(pngs[0], info.fill.width, info.fill.height), zoom: info.fill.zoom, x: info.fill.x, y: info.fill.y }
      : info.fill
  return { id: createId('layer'), kind: 'shape', name, visible, opacity, locked, adjust, ...extras, box: info.box, geometry: info.geometry, fill, outline: info.outline }
}

// Turns a project back into a design. `id` keeps a design kept in the browser under its own
// name; files opened from the computer get a new one, so they never replace a kept design.
export async function decodeProject(file: Blob, id = createDesignId()): Promise<EditorDocument> {
  const { manifest, images } = await unpackProject(file)
  let next = 0
  // Groups get new ids, like layers do, and only whole groups are kept.
  const groupIds = new Map<string, string>()
  const pages = await Promise.all(
    manifestPages(manifest).map(async (info): Promise<DesignPage> => {
      const layers = await Promise.all(
        info.layers.map((layerInfo) => {
          const count = pictureSizes(layerInfo).length
          const pngs = images.slice(next, next + count)
          next += count
          return decodeLayer(layerInfo, pngs)
        }),
      )
      const regrouped = layers.map((layer) => {
        if (!layer.group) return layer
        if (!groupIds.has(layer.group.id)) groupIds.set(layer.group.id, createId('group'))
        return { ...layer, group: { id: groupIds.get(layer.group.id)!, name: layer.group.name } }
      })
      const tidy = tidyGroups({ id, name: '', width: 1, height: 1, background: null, layers: regrouped, activeLayerId: regrouped[info.activeLayer]?.id ?? '', selection: null })
      return { id: createId('page'), background: info.background, pageGradient: info.pageGradient ?? null, layers: tidy.layers, activeLayerId: tidy.activeLayerId }
    }),
  )
  const index = manifest.page ?? 0
  const open = pages[index]
  return {
    id,
    name: manifest.name,
    width: manifest.width,
    height: manifest.height,
    background: open.background,
    pageGradient: open.pageGradient ?? null,
    ...(manifest.ppi ? { ppi: manifest.ppi } : {}),
    layers: open.layers,
    activeLayerId: open.activeLayerId,
    selection: manifest.selection,
    ...(pages.length > 1 ? { pages, pageIndex: index } : {}),
  }
}

// A small picture of the whole design, for the list of designs on the start screen.
export async function designThumbnail(doc: EditorDocument, maxSide = 320): Promise<Blob> {
  await loadDesignFonts(doc)
  const scale = Math.min(1, maxSide / Math.max(doc.width, doc.height))
  const canvas = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)))
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(scale, scale)
  paintPage(ctx, doc, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('Could not make a preview.')))), 'image/png'),
  )
}
