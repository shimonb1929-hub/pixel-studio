import type { BrushPreset } from './brushes.ts'
import { createCanvas, createId, getContext2d } from './document.ts'
import { t } from '../i18n/i18n.ts'

// Your own brush shapes (pro: Define Brush Preset): anything on the design (a star, a leaf you
// drew, a word) becomes the tip of a brush, and painting leaves a trail of it in the brush color.
// They are kept in this browser, so they're there next time too.

export interface BrushShape {
  id: string
  name: string
  // The shape as a picture: only how solid each pixel is counts.
  data: string
}

const KEY = 'pixel-studio-brush-shapes'
// The tip is kept this big; brushes scale it to their size.
export const SHAPE_SIDE = 128
const MOST_SHAPES = 24

let shapes: BrushShape[] = read()
const tips = new Map<string, HTMLCanvasElement>()
const listeners = new Set<() => void>()

function read(): BrushShape[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((s): s is BrushShape => !!s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.data === 'string' && s.data.length < 400_000)
  } catch {
    return []
  }
}

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shapes))
  } catch {
    // Storage full or blocked: the shapes still work until the page closes.
  }
}

function changed(): void {
  for (const listener of listeners) listener()
}

export function subscribeBrushShapes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function brushShapes(): BrushShape[] {
  return shapes
}

// The tip as a canvas, once its picture is read. Null until then (the brush paints round dabs).
export function shapeTip(id: string): HTMLCanvasElement | null {
  const tip = tips.get(id)
  if (tip) return tip
  const shape = shapes.find((s) => s.id === id)
  if (!shape || typeof Image === 'undefined') return null
  const image = new Image()
  image.onload = () => {
    const canvas = createCanvas(SHAPE_SIDE, SHAPE_SIDE)
    getContext2d(canvas).drawImage(image, 0, 0, SHAPE_SIDE, SHAPE_SIDE)
    tips.set(id, canvas)
    changed()
  }
  image.src = shape.data
  return null
}

// Keeps a picture (any size, see-through around the shape) as a new brush shape.
export function addBrushShape(picture: HTMLCanvasElement, name: string): BrushShape {
  const canvas = createCanvas(SHAPE_SIDE, SHAPE_SIDE)
  const ctx = getContext2d(canvas)
  // Fitted in the middle, keeping its shape.
  const scale = Math.min(SHAPE_SIDE / Math.max(1, picture.width), SHAPE_SIDE / Math.max(1, picture.height))
  const w = picture.width * scale
  const h = picture.height * scale
  ctx.drawImage(picture, (SHAPE_SIDE - w) / 2, (SHAPE_SIDE - h) / 2, w, h)
  // Only how solid it is counts: the brush color fills it.
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, SHAPE_SIDE, SHAPE_SIDE)
  const shape: BrushShape = { id: createId('tip'), name, data: canvas.toDataURL('image/png') }
  tips.set(shape.id, canvas)
  shapes = [...shapes, shape].slice(-MOST_SHAPES)
  write()
  changed()
  return shape
}

export function removeBrushShape(id: string): void {
  shapes = shapes.filter((s) => s.id !== id)
  tips.delete(id)
  write()
  changed()
}

// The next free name: My brush 1, My brush 2…
export function nextShapeName(): string {
  let n = 1
  while (shapes.some((s) => s.name === t('My brush {number}', { number: n }))) n++
  return t('My brush {number}', { number: n })
}

// A brush that paints with the shape.
export function shapePreset(shape: BrushShape): BrushPreset {
  return {
    id: `shape:${shape.id}`,
    name: shape.name,
    description: t('Paints a trail of your own shape in the brush color.'),
    kind: 'own',
    settings: { size: 60, softness: 0, opacity: 1, flow: 1, smoothing: 0.2, pressure: true, blend: 'normal', tip: 'stamp', stamp: shape.id },
  }
}
