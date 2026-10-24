import { polygonBounds, rectPolygon, snapRect, intersectRect, translatePoints, unionRect, type Rect } from './geometry.ts'
import { distanceToShape } from './distance.ts'
import { traceOutline } from './outline.ts'
import type { Point } from './types.ts'

export type SelectionMode = 'replace' | 'add' | 'subtract'
export type SelectionShape = 'rectangle' | 'ellipse' | 'freehand' | 'magic' | 'color'

// A selection is kept as the list of steps that made it ("add this oval, remove this
// rectangle"), not as pixels. That keeps it tiny in undo history, and the pixel mask can always
// be rebuilt from it. `grow` moves the edge of everything selected so far outward by `by` pixels
// (inward when negative); `soften` fades it out over about `by` pixels.
export type SelectionOp =
  | { kind: 'polygon'; subtract: boolean; points: Point[] }
  | { kind: 'invert' }
  | { kind: 'grow'; by: number }
  | { kind: 'soften'; by: number }

// The most an edge can be grown, shrunk or softened by, in pixels.
export const MAX_EDGE_CHANGE = 500

// Grows (or shrinks) and then softens the edge of a selection, as new steps on it.
export function refineSelection(selection: Selection, { grow, soften }: { grow: number; soften: number }): Selection {
  const ops = [...selection.ops]
  if (grow !== 0) ops.push({ kind: 'grow', by: grow })
  if (soften > 0) ops.push({ kind: 'soften', by: soften })
  return ops.length === selection.ops.length ? selection : { ops }
}

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
  return boundsAfter(selection.ops, selection.ops.length, width, height)
}

// The rough area of the first `count` steps.
function boundsAfter(ops: SelectionOp[], count: number, width: number, height: number): Rect | null {
  const design = { x: 0, y: 0, width, height }
  let bounds: Rect | null = null
  for (let i = 0; i < count; i++) {
    const op = ops[i]
    if (op.kind === 'invert') bounds = design
    else if (op.kind === 'polygon' && !op.subtract) {
      const b = polygonBounds(op.points)
      if (b) bounds = unionRect(bounds, b)
    }
    else if ((op.kind === 'grow' || op.kind === 'soften') && op.by > 0 && bounds) bounds = expandRect(bounds, Math.ceil(op.by) + 1)
  }
  return bounds && intersectRect(snapRect(bounds), design)
}

function expandRect(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 }
}

// Moves the edge of the mask's selected part outward by `by` pixels, or inward when negative.
// Pixels count as selected when they're at least half selected; the new edge is smooth.
export function growAlpha(alpha: Uint8ClampedArray, width: number, height: number, by: number): void {
  const grow = by > 0
  const from = new Uint8Array(width * height)
  // Growing measures from what's selected; shrinking measures from what isn't.
  for (let i = 0; i < from.length; i++) from[i] = (alpha[i] >= 128) === grow ? 1 : 0
  const distance = distanceToShape(from, width, height)
  const reach = Math.abs(by)
  for (let i = 0; i < from.length; i++) {
    const d = distance[i]
    const kept = grow ? reach + 1 - d : d - reach
    alpha[i] = Math.round(Math.max(0, Math.min(1, kept)) * 255)
  }
}

// Blurs the mask so its edge fades out over about `by` pixels. Beyond the area the nearest edge
// pixel carries on, so softening a selection that reaches the edge of the design doesn't fade there.
export function softenAlpha(alpha: Uint8ClampedArray, width: number, height: number, by: number): void {
  // Three box blurs in a row look just like a smooth (Gaussian) blur.
  const sigma = by / 2
  const radius = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2))
  const values = new Float32Array(alpha.length)
  for (let i = 0; i < values.length; i++) values[i] = alpha[i]
  const line = new Float32Array(Math.max(width, height))
  const size = radius * 2 + 1
  // Blurs `n` values starting at `start`, `step` apart.
  const blurLine = (start: number, step: number, n: number) => {
    for (let i = 0; i < n; i++) line[i] = values[start + i * step]
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += line[Math.max(0, Math.min(n - 1, i))]
    for (let i = 0; i < n; i++) {
      values[start + i * step] = sum / size
      sum += line[Math.min(n - 1, i + radius + 1)] - line[Math.max(0, i - radius)]
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) blurLine(y * width, 1, width)
    for (let x = 0; x < width; x++) blurLine(x, width, height)
  }
  for (let i = 0; i < values.length; i++) alpha[i] = Math.round(values[i])
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
  selection.ops.forEach((op, index) => {
    if (op.kind === 'grow' || op.kind === 'soften') {
      if (op.by === 0) return
      ctx.globalCompositeOperation = 'source-over'
      // Only the area that could change is worked on, which keeps big designs quick.
      const before = boundsAfter(selection.ops, index, width, height)
      const area = before && intersectRect(expandRect(before, Math.ceil(Math.abs(op.by)) + 2), { x: 0, y: 0, width, height })
      if (!area) return
      const image = ctx.getImageData(area.x, area.y, area.width, area.height)
      const alpha = new Uint8ClampedArray(area.width * area.height)
      for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3]
      if (op.kind === 'grow') growAlpha(alpha, area.width, area.height, op.by)
      else softenAlpha(alpha, area.width, area.height, op.by)
      for (let i = 0; i < alpha.length; i++) {
        image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 0
        image.data[i * 4 + 3] = alpha[i]
      }
      ctx.putImageData(image, area.x, area.y)
    } else if (op.kind === 'invert') {
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
  })
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
