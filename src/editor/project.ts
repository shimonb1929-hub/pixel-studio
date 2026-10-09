import { createCanvas, createDesignId, getContext2d, layerFromCanvas, MAX_LAYER_SIDE, validateDocumentSize } from './document.ts'
import { EXPORT_FORMATS } from './fileNames.ts'
import { pixelVersion } from './pixelVersion.ts'
import type { Selection, SelectionOp } from './selection.ts'
import type { EditorDocument, Layer } from './types.ts'

// A project keeps everything needed to carry on editing later: the design's size, every layer
// with its pixels, position and settings, and the selection. The same format is used for
// project files people download and for designs kept in the browser.
//
// Layout: the letters "PXSTUDIO", the length of the description as 4 bytes (little-endian),
// the description as JSON text, then each layer's pixels as a PNG, one after another.

export const PROJECT_VERSION = 1

const MAGIC = 'PXSTUDIO'
const HEADER_BYTES = MAGIC.length + 4
const MAX_LAYERS = 1000
const MAX_DESCRIPTION_BYTES = 64 * 1024 * 1024
// All layers together. Far beyond what a browser tab could hold anyway.
const MAX_TOTAL_PIXELS = 1_000_000_000
const MAX_NAME_LENGTH = 200

export interface ProjectLayer {
  kind: 'raster'
  name: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  opacity: number
  // The length of this layer's PNG, which comes right after the previous layer's.
  bytes: number
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

// Reads the description and finds each layer's PNG, without decoding any pixels yet.
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
  const images = manifest.layers.map((layer) => {
    const image = file.slice(offset, offset + layer.bytes, 'image/png')
    offset += layer.bytes
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
  if (!isRecord(value) || !Number.isInteger(value.version) || (value.version as number) < 1) throw new ProjectError(DAMAGED)
  if ((value.version as number) > PROJECT_VERSION) throw new ProjectError(TOO_NEW)
  const { name, width, height, activeLayer, layers } = value
  if (typeof name !== 'string' || typeof width !== 'number' || typeof height !== 'number' || validateDocumentSize(width, height)) {
    throw new ProjectError(DAMAGED)
  }
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) throw new ProjectError(DAMAGED)
  let totalPixels = 0
  const checked = layers.map((layer): ProjectLayer => {
    if (
      !isRecord(layer) ||
      layer.kind !== 'raster' ||
      typeof layer.name !== 'string' ||
      !isWhole(layer.x, -1e7, 1e7) ||
      !isWhole(layer.y, -1e7, 1e7) ||
      !isWhole(layer.width, 1, MAX_LAYER_SIDE) ||
      !isWhole(layer.height, 1, MAX_LAYER_SIDE) ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.opacity !== 'number' ||
      !(layer.opacity >= 0 && layer.opacity <= 1) ||
      !isWhole(layer.bytes, 1, Number.MAX_SAFE_INTEGER)
    ) {
      throw new ProjectError(DAMAGED)
    }
    totalPixels += layer.width * layer.height
    return {
      kind: 'raster',
      name: layer.name.slice(0, MAX_NAME_LENGTH),
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      visible: layer.visible,
      opacity: layer.opacity,
      bytes: layer.bytes,
    }
  })
  if (totalPixels > MAX_TOTAL_PIXELS) throw new ProjectError('This project is too big for Pixel Studio to open.')
  if (!isWhole(activeLayer, 0, checked.length - 1)) throw new ProjectError(DAMAGED)
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

// Encoding a big layer takes a moment, so each layer's PNG is kept until its pixels change.
const encoded = new WeakMap<HTMLCanvasElement, { version: number; png: Blob }>()

function layerPng(canvas: HTMLCanvasElement): Promise<Blob> {
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

export async function encodeProject(doc: EditorDocument): Promise<Blob> {
  // Layers are read now, before waiting, so later changes don't end up half in the file.
  const layers = doc.layers
  const images = await Promise.all(layers.map((layer) => layerPng(layer.canvas)))
  const manifest: ProjectManifest = {
    version: PROJECT_VERSION,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    activeLayer: Math.max(0, layers.findIndex((layer) => layer.id === doc.activeLayerId)),
    selection: doc.selection,
    layers: layers.map((layer, i) => ({
      kind: 'raster',
      name: layer.name,
      x: layer.x,
      y: layer.y,
      width: layer.canvas.width,
      height: layer.canvas.height,
      visible: layer.visible,
      opacity: layer.opacity,
      bytes: images[i].size,
    })),
  }
  return packProject(manifest, images)
}

async function decodeLayer(info: ProjectLayer, png: Blob): Promise<Layer> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(png)
  } catch {
    throw new ProjectError(DAMAGED)
  }
  try {
    if (bitmap.width !== info.width || bitmap.height !== info.height) throw new ProjectError(DAMAGED)
    const canvas = createCanvas(info.width, info.height)
    getContext2d(canvas).drawImage(bitmap, 0, 0)
    return { ...layerFromCanvas(info.name, canvas, info.x, info.y), visible: info.visible, opacity: info.opacity }
  } finally {
    bitmap.close()
  }
}

// Turns a project back into a design. `id` keeps a design kept in the browser under its own
// name; files opened from the computer get a new one, so they never replace a kept design.
export async function decodeProject(file: Blob, id = createDesignId()): Promise<EditorDocument> {
  const { manifest, images } = await unpackProject(file)
  const layers = await Promise.all(manifest.layers.map((info, i) => decodeLayer(info, images[i])))
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
export function designThumbnail(doc: EditorDocument, maxSide = 320): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(doc.width, doc.height))
  const canvas = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)))
  const ctx = getContext2d(canvas)
  ctx.imageSmoothingQuality = 'high'
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(layer.canvas, layer.x * scale, layer.y * scale, layer.canvas.width * scale, layer.canvas.height * scale)
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make a preview.'))), 'image/png'),
  )
}
