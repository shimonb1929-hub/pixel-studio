import { createCanvas, getContext2d, layerRect } from './document.ts'
import { polygonBounds, snapRect, unionRect } from './geometry.ts'
import { activeLayer, replaceLayer } from './layers.ts'
import { settleLayer } from './objects.ts'
import type { RenderPart } from './render.ts'
import { selectionInfo, type Selection } from './selection.ts'
import { applyAffine, boxCorners, boxFromRect, boxMatrix, multiplyAffine, translateAffine, type TransformBox } from './transform.ts'
import type { EditorDocument, PixelLayer } from './types.ts'

// Browsers can't make canvases much bigger than this on a side.
const MAX_LAYER_SIDE = 16000

// Resizing or turning the selected part of a pixel layer. (Whole layers just get a new box; see
// arrange.ts.)
export interface TransformSession {
  layerId: string
  // The layer (settled into plain pixels) and the selection as they were when the session started.
  layer: PixelLayer
  selection: Selection
  // The layer with the selected part lifted out.
  base: HTMLCanvasElement
  // The picture being transformed, and where it started.
  source: HTMLCanvasElement
  original: TransformBox
}

export function startTransform(doc: EditorDocument): TransformSession | null {
  const active = activeLayer(doc)
  if (!doc.selection || active?.kind !== 'raster') return null
  const layer = settleLayer(active)
  const { mask, bounds } = selectionInfo(doc.selection, doc.width, doc.height)
  if (!bounds) return null
  const source = createCanvas(bounds.width, bounds.height)
  const sctx = getContext2d(source)
  sctx.drawImage(layer.canvas, layer.x - bounds.x, layer.y - bounds.y)
  sctx.globalCompositeOperation = 'destination-in'
  sctx.drawImage(mask, -bounds.x, -bounds.y)
  const base = createCanvas(layer.canvas.width, layer.canvas.height)
  const bctx = getContext2d(base)
  bctx.drawImage(layer.canvas, 0, 0)
  bctx.globalCompositeOperation = 'destination-out'
  bctx.drawImage(mask, -layer.x, -layer.y)
  return { layerId: layer.id, layer, selection: doc.selection, base, source, original: boxFromRect(bounds) }
}

// What to draw for the layer while its handles are being dragged.
export function transformParts(session: TransformSession, box: TransformBox): RenderPart[] {
  return [
    { canvas: session.base, x: session.layer.x, y: session.layer.y },
    { canvas: session.source, x: 0, y: 0, transform: boxMatrix(box, session.source.width, session.source.height) },
  ]
}

// The design with the transform applied, or null if the result would be too big to draw.
export function commitTransform(doc: EditorDocument, session: TransformSession, box: TransformBox): EditorDocument | null {
  const { layer, base, source } = session
  const matrix = boxMatrix(box, source.width, source.height)
  const placed = snapRect(polygonBounds(boxCorners(box))!)
  const target = snapRect(unionRect(layerRect(layer), placed))
  if (target.width > MAX_LAYER_SIDE || target.height > MAX_LAYER_SIDE) return null

  const canvas = createCanvas(target.width, target.height)
  const ctx = getContext2d(canvas)
  ctx.drawImage(base, layer.x - target.x, layer.y - target.y)
  const m = multiplyAffine(translateAffine(-target.x, -target.y), matrix)
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0)

  const next = replaceLayer(doc, { ...layer, canvas, x: target.x, y: target.y })
  // The selection outline follows the picture: from design to source, then through the transform.
  const toNew = multiplyAffine(matrix, translateAffine(-(session.original.cx - Math.abs(session.original.width) / 2), -(session.original.cy - Math.abs(session.original.height) / 2)))
  const selection: Selection = {
    ops: session.selection.ops.map((op) => (op.kind === 'polygon' ? { ...op, points: op.points.map((p) => applyAffine(toNew, p)) } : op)),
  }
  return { ...next, selection }
}
