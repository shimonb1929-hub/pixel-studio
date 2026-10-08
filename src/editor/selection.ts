import { polygonBounds, rectPolygon, snapRect, intersectRect, translatePoints, unionRect, type Rect } from './geometry.ts'
import { traceOutline } from './outline.ts'
import type { Point } from './types.ts'

export type SelectionMode = 'replace' | 'add' | 'subtract'
export type SelectionShape = 'rectangle' | 'ellipse' | 'freehand'

// A selection is kept as the list of steps that made it ("add this oval, remove this
// rectangle"), not as pixels. That keeps it tiny in undo history, and the pixel mask can always
// be rebuilt from it.
export type SelectionOp = { kind: 'polygon'; subtract: boolean; points: Point[] } | { kind: 'invert' }

export interface Selection {
  ops: SelectionOp[]
}

// Combines a newly drawn shape with the current selection. Null means nothing is selected.
export function combineSelection(current: Selection | null, points: Point[], mode: SelectionMode): Selection | null {
  if (points.length < 3) return mode === 'replace' ? null : current
  const op: SelectionOp = { kind: 'polygon', subtract: mode === 'subtract', points }
  if (mode === 'replace' || !current) return mode === 'subtract' ? null : { ops: [{ ...op, subtract: false }] }
  return { ops: [...current.ops, op] }
}

export function selectAll(width: number, height: number): Selection {
  return { ops: [{ kind: 'polygon', subtract: false, points: rectPolygon({ x: 0, y: 0, width, height }) }] }
}

export function invertSelection(current: Selection | null, width: number, height: number): Selection | null {
  // Flipping "nothing selected" selects everything, like Photoshop.
  if (!current) return selectAll(width, height)
  return { ops: [...current.ops, { kind: 'invert' }] }
}

export function translateSelection(selection: Selection, dx: number, dy: number): Selection {
  return {
    ops: selection.ops.map((op) => (op.kind === 'polygon' ? { ...op, points: translatePoints(op.points, dx, dy) } : op)),
  }
}

// The area the steps could cover, before pixels are checked. Null if nothing could be selected.
export function roughBounds(selection: Selection, width: number, height: number): Rect | null {
  const design = { x: 0, y: 0, width, height }
  if (selection.ops.some((op) => op.kind === 'invert')) return design
  let bounds: Rect | null = null
  for (const op of selection.ops) {
    if (op.kind !== 'polygon' || op.subtract) continue
    const b = polygonBounds(op.points)
    if (b) bounds = unionRect(bounds, b)
  }
  return bounds && intersectRect(snapRect(bounds), design)
}

export interface SelectionInfo {
  // Design-sized; the alpha says how much of each pixel is selected.
  mask: HTMLCanvasElement
  // The smallest rectangle around the selected pixels, or null if the selection turned out empty.
  bounds: Rect | null
  // Loops to draw the moving dashed outline along.
  outline: Point[][]
}

const cache = new WeakMap<Selection, SelectionInfo & { width: number; height: number }>()

function drawMask(selection: Selection, width: number, height: number): HTMLCanvasElement {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const ctx = mask.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000000'
  for (const op of selection.ops) {
    if (op.kind === 'invert') {
      // XOR with a full square flips every pixel: selected becomes unselected and back.
      ctx.globalCompositeOperation = 'xor'
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.globalCompositeOperation = op.subtract ? 'destination-out' : 'source-over'
      ctx.beginPath()
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  return mask
}

// The mask, exact bounds and outline of a selection, worked out once and remembered.
export function selectionInfo(selection: Selection, width: number, height: number): SelectionInfo {
  const cached = cache.get(selection)
  if (cached && cached.width === width && cached.height === height) return cached

  const mask = drawMask(selection, width, height)
  let info: SelectionInfo
  const [only] = selection.ops
  const rough = roughBounds(selection, width, height)
  if (selection.ops.length === 1 && only.kind === 'polygon' && !only.subtract) {
    // A single shape is outlined by its own smooth edge.
    info = { mask, bounds: rough, outline: [only.points] }
  } else if (!rough) {
    info = { mask, bounds: null, outline: [] }
  } else {
    // Combined shapes are traced from the pixels, so the outline follows the real edge.
    const data = mask.getContext('2d', { willReadFrequently: true })!.getImageData(rough.x, rough.y, rough.width, rough.height).data
    const grid = new Uint8Array(rough.width * rough.height)
    for (let i = 0; i < grid.length; i++) grid[i] = data[i * 4 + 3] >= 128 ? 1 : 0
    const traced = traceOutline(grid, rough.width, rough.height, rough.x, rough.y)
    info = { mask, bounds: traced.bounds, outline: traced.loops }
  }
  cache.set(selection, { ...info, width, height })
  return info
}

// True if a point of the design is selected.
export function isPointSelected(selection: Selection, width: number, height: number, point: Point): boolean {
  const x = Math.floor(point.x)
  const y = Math.floor(point.y)
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const { mask } = selectionInfo(selection, width, height)
  return mask.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, 1, 1).data[3] >= 128
}
