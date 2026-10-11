import type { Adjustments } from './adjust.ts'
import { drawLayer } from './compose.ts'
import { createCanvas, createDesignId, createId, getContext2d, layerFromCanvas, MAX_LAYER_SIDE, validateDocumentSize } from './document.ts'
import { EXPORT_FORMATS } from './fileNames.ts'
import { pixelVersion } from './pixelVersion.ts'
import type { Selection, SelectionOp } from './selection.ts'
import type { TransformBox } from './transform.ts'
import type { TextAlign, TextDirection } from '../text/layout.ts'
import { loadDesignFonts } from '../text/textLayer.ts'
import type { EditorDocument, Layer, ShapeGeometry, ShapeOutline, ShapeType, TextStyle } from './types.ts'

// A project keeps everything needed to carry on editing later: the design's size, every layer
// with its pixels, position and settings, and the selection. The same format is used for
// project files people download and for designs kept in the browser.
//
// Layout: the letters "PXSTUDIO", the length of the description as 4 bytes (little-endian),
// the description as JSON text, then the pictures as PNGs, one after another: each pixel layer's
// pixels, and each photo inside a shape, in layer order.
//
// Version 2 added shapes, resized and turned pictures (box), locks and editable adjustments.
// Version 3 added text. Older files still open.

export const PROJECT_VERSION = 3

const MAGIC = 'PXSTUDIO'
const HEADER_BYTES = MAGIC.length + 4
const MAX_LAYERS = 1000
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
  // Which layer was selected, counted from the bottom.
  activeLayer: number
  selection: Selection | null
  // Bottom layer first.
  layers: ProjectLayer[]
}

// A problem with the file itself, explained in plain words.
export class ProjectError extends Error {}

const DAMAGED = "This project file is damaged, so it can't be opened."
const TOO_NEW =
  'This project was saved by a newer version of Pixel Studio. Reload this page to get the newest version, then open it again.'

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
  if (file.size < HEADER_BYTES || !(await hasMagic(file))) throw new ProjectError(DAMAGED)
  const length = new DataView(await file.slice(MAGIC.length, HEADER_BYTES).arrayBuffer()).getUint32(0, true)
  if (length > MAX_DESCRIPTION_BYTES || HEADER_BYTES + length > file.size) throw new ProjectError(DAMAGED)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(HEADER_BYTES, HEADER_BYTES + length).arrayBuffer()))
  } catch {
    throw new ProjectError(DAMAGED)
  }
  const manifest = validateManifest(parsed)
  let offset = HEADER_BYTES + length
  const images = manifest.layers.flatMap(pictureSizes).map((bytes) => {
    const image = file.slice(offset, offset + bytes, 'image/png')
    offset += bytes
    return image
  })
  if (offset > file.size) throw new ProjectError(DAMAGED)
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
  throw new ProjectError(DAMAGED)
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

const COLOR = /^#[0-9a-f]{6}$/i
const SHAPE_TYPES: ShapeType[] = ['rectangle', 'ellipse', 'polygon', 'star', 'line']

function readColor(value: unknown): string {
  if (typeof value !== 'string' || !COLOR.test(value)) damaged()
  return value
}

function readGeometry(value: unknown): ShapeGeometry {
  if (!isRecord(value) || !SHAPE_TYPES.includes(value.type as ShapeType)) damaged()
  if (!isBetween(value.corners, 0, 1) || !isWhole(value.sides, 3, 64) || typeof value.arrow !== 'boolean') damaged()
  return { type: value.type as ShapeType, corners: value.corners, sides: value.sides, arrow: value.arrow }
}

function readFill(value: unknown): ProjectFill {
  if (!isRecord(value)) damaged()
  if (value.kind === 'none') return { kind: 'none' }
  if (value.kind === 'color') return { kind: 'color', color: readColor(value.color) }
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
  }
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
  if (!isRecord(value) || !Array.isArray(value.ops)) throw new ProjectError(DAMAGED)
  const ops = value.ops.map((op): SelectionOp => {
    if (isRecord(op) && op.kind === 'invert') return { kind: 'invert' }
    if (!isRecord(op) || op.kind !== 'polygon' || typeof op.subtract !== 'boolean' || !Array.isArray(op.points)) {
      throw new ProjectError(DAMAGED)
    }
    const points = op.points.map((p) => {
      if (!isRecord(p) || !isCoordinate(p.x) || !isCoordinate(p.y)) throw new ProjectError(DAMAGED)
      return { x: p.x, y: p.y }
    })
    return { kind: 'polygon', subtract: op.subtract, points }
  })
  return ops.length > 0 ? { ops } : null
}

// Checks everything in a project's description, so a damaged or made-up file can't break the editor.
export function validateManifest(value: unknown): ProjectManifest {
  if (!isRecord(value) || !Number.isInteger(value.version) || (value.version as number) < 1) damaged()
  if ((value.version as number) > PROJECT_VERSION) throw new ProjectError(TOO_NEW)
  const { name, width, height, activeLayer, layers } = value
  if (typeof name !== 'string' || typeof width !== 'number' || typeof height !== 'number' || validateDocumentSize(width, height)) damaged()
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) damaged()
  const checked = layers.map(readLayer)
  const totalPixels = checked.reduce((sum, layer) => sum + picturePixels(layer), 0)
  if (totalPixels > MAX_TOTAL_PIXELS) throw new ProjectError('This project is too big for Pixel Studio to open.')
  if (!isWhole(activeLayer, 0, checked.length - 1)) damaged()
  return {
    version: value.version as number,
    name: name.slice(0, MAX_NAME_LENGTH),
    width,
    height,
    activeLayer,
    selection: readSelection(value.selection),
    layers: checked,
  }
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
        reject(new Error('Saving failed. A layer may be too large for this browser.'))
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
  const base: ProjectLayerBase = { name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked, adjust: layer.adjust }
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
  // Layers are read now, before waiting, so later changes don't end up half in the file.
  const layers = doc.layers
  const pictures = await Promise.all(layers.map((layer) => Promise.all(layerPictures(layer).map(canvasPng))))
  const manifest: ProjectManifest = {
    version: PROJECT_VERSION,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    activeLayer: Math.max(0, layers.findIndex((layer) => layer.id === doc.activeLayerId)),
    selection: doc.selection,
    layers: layers.map((layer, i) => describeLayer(layer, pictures[i].map((png) => png.size))),
  }
  return packProject(manifest, pictures.flat())
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
  const { name, visible, opacity, locked, adjust } = info
  if (info.kind === 'raster') {
    const canvas = await decodePicture(pngs[0], info.width, info.height)
    return { ...layerFromCanvas(name, canvas, info.x, info.y), box: info.box, visible, opacity, locked, adjust }
  }
  if (info.kind === 'text') {
    return { id: createId('layer'), kind: 'text', name, visible, opacity, locked, adjust, box: info.box, text: info.text, style: info.style, wrap: info.wrap }
  }
  const fill =
    info.fill.kind === 'photo'
      ? { kind: 'photo' as const, canvas: await decodePicture(pngs[0], info.fill.width, info.fill.height), zoom: info.fill.zoom, x: info.fill.x, y: info.fill.y }
      : info.fill
  return { id: createId('layer'), kind: 'shape', name, visible, opacity, locked, adjust, box: info.box, geometry: info.geometry, fill, outline: info.outline }
}

// Turns a project back into a design. `id` keeps a design kept in the browser under its own
// name; files opened from the computer get a new one, so they never replace a kept design.
export async function decodeProject(file: Blob, id = createDesignId()): Promise<EditorDocument> {
  const { manifest, images } = await unpackProject(file)
  let next = 0
  const layers = await Promise.all(
    manifest.layers.map((info) => {
      const count = pictureSizes(info).length
      const pngs = images.slice(next, next + count)
      next += count
      return decodeLayer(info, pngs)
    }),
  )
  return {
    id,
    name: manifest.name,
    width: manifest.width,
    height: manifest.height,
    layers,
    activeLayerId: layers[manifest.activeLayer].id,
    selection: manifest.selection,
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
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make a preview.'))), 'image/png'),
  )
}
