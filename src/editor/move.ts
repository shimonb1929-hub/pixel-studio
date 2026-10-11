import { slideLayer } from './arrange.ts'
import { createCanvas, getContext2d, layerRect } from './document.ts'
import { snapRect, unionRect } from './geometry.ts'
import { activeLayer, replaceLayer } from './layers.ts'
import { settleLayer } from './objects.ts'
import type { LayerOverride } from './render.ts'
import { selectionInfo, translateSelection } from './selection.ts'
import type { EditorDocument } from './types.ts'

// Browsers can't make canvases much bigger than this on a side.
const MAX_LAYER_SIDE = 16000

export interface MoveSession {
  layerId: string
  label: string
  // True when a selected area is moving, so its outline should move along.
  movesSelection: boolean
  // What to show for the layer while it's dragged by dx, dy.
  preview: (dx: number, dy: number) => LayerOverride
  // The design after moving by whole pixels dx, dy.
  commit: (doc: EditorDocument, dx: number, dy: number) => EditorDocument
}

// Moving with nothing selected moves the whole layer, which only changes where it sits.
// Moving with a selection lifts the selected pixels off the layer and puts them down elsewhere.
// Shapes have no pixels to lift, so only whole shapes move.
export function startMove(doc: EditorDocument): MoveSession | null {
  const active = activeLayer(doc)
  if (!active) return null

  if (!doc.selection) {
    return {
      layerId: active.id,
      label: 'Move layer',
      movesSelection: false,
      preview: (dx, dy) => ({ layerId: active.id, layer: slideLayer(active, dx, dy) }),
      commit: (d, dx, dy) => replaceLayer(d, slideLayer(active, dx, dy)),
    }
  }

  if (active.kind !== 'raster') return null
  // A resized or turned picture is settled into plain pixels first.
  const layer = settleLayer(active)

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
    preview: (dx, dy) => ({
      layerId: layer.id,
      parts: [
        { canvas: base, x: layer.x, y: layer.y },
        { canvas: floating, x: bounds.x + dx, y: bounds.y + dy },
      ],
    }),
    commit: (d, dx, dy) => {
      const moved = { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height }
      const target = snapRect(unionRect(layerRect(layer), moved))
      if (target.width > MAX_LAYER_SIDE || target.height > MAX_LAYER_SIDE) return d
      const canvas = createCanvas(target.width, target.height)
      const ctx = getContext2d(canvas)
      ctx.drawImage(base, layer.x - target.x, layer.y - target.y)
      ctx.drawImage(floating, moved.x - target.x, moved.y - target.y)
      return { ...replaceLayer(d, { ...layer, canvas, x: target.x, y: target.y }), selection: translateSelection(selection, dx, dy) }
    },
  }
}
