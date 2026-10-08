import { createCanvas, getContext2d, layerRect } from './document.ts'
import { snapRect, unionRect } from './geometry.ts'
import { activeLayer, updateLayer } from './layers.ts'
import type { RenderPart } from './render.ts'
import { selectionInfo, translateSelection } from './selection.ts'
import type { EditorDocument } from './types.ts'

// Browsers can't make canvases much bigger than this on a side.
const MAX_LAYER_SIDE = 16000

export interface MoveSession {
  layerId: string
  label: string
  // True when a selected area is moving, so its outline should move along.
  movesSelection: boolean
  // What to draw for the layer while it's dragged by dx, dy.
  parts: (dx: number, dy: number) => RenderPart[]
  // The design after moving by whole pixels dx, dy.
  commit: (doc: EditorDocument, dx: number, dy: number) => EditorDocument
}

// Moving with nothing selected moves the whole layer, which only changes where it sits.
// Moving with a selection lifts the selected pixels off the layer and puts them down elsewhere.
export function startMove(doc: EditorDocument): MoveSession | null {
  const layer = activeLayer(doc)
  if (!layer) return null

  if (!doc.selection) {
    return {
      layerId: layer.id,
      label: 'Move layer',
      movesSelection: false,
      parts: (dx, dy) => [{ canvas: layer.canvas, x: layer.x + dx, y: layer.y + dy }],
      commit: (d, dx, dy) => updateLayer(d, layer.id, { x: layer.x + dx, y: layer.y + dy }),
    }
  }

  const { mask, bounds } = selectionInfo(doc.selection, doc.width, doc.height)
  if (!bounds) return null
  const selection = doc.selection

  const floating = createCanvas(bounds.width, bounds.height)
  const fctx = getContext2d(floating)
  fctx.drawImage(layer.canvas, layer.x - bounds.x, layer.y - bounds.y)
  fctx.globalCompositeOperation = 'destination-in'
  fctx.drawImage(mask, -bounds.x, -bounds.y)

  const base = createCanvas(layer.canvas.width, layer.canvas.height)
  const bctx = getContext2d(base)
  bctx.drawImage(layer.canvas, 0, 0)
  bctx.globalCompositeOperation = 'destination-out'
  bctx.drawImage(mask, -layer.x, -layer.y)

  return {
    layerId: layer.id,
    label: 'Move selected area',
    movesSelection: true,
    parts: (dx, dy) => [
      { canvas: base, x: layer.x, y: layer.y },
      { canvas: floating, x: bounds.x + dx, y: bounds.y + dy },
    ],
    commit: (d, dx, dy) => {
      const moved = { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height }
      const target = snapRect(unionRect(layerRect(layer), moved))
      if (target.width > MAX_LAYER_SIDE || target.height > MAX_LAYER_SIDE) return d
      const canvas = createCanvas(target.width, target.height)
      const ctx = getContext2d(canvas)
      ctx.drawImage(base, layer.x - target.x, layer.y - target.y)
      ctx.drawImage(floating, moved.x - target.x, moved.y - target.y)
      return { ...updateLayer(d, layer.id, { canvas, x: target.x, y: target.y }), selection: translateSelection(selection, dx, dy) }
    },
  }
}
