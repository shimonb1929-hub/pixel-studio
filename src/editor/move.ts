import { slideLayer } from './arrange.ts'
import { createCanvas, getContext2d, layerRect } from './document.ts'
import { cutGap, gapFor, type GapFill } from './gapFill.ts'
import { snapRect, unionRect } from './geometry.ts'
import { activeLayer, replaceLayer } from './layers.ts'
import { settleLayer } from './objects.ts'
import type { LayerOverride } from './render.ts'
import { selectionInfo, translateSelection } from './selection.ts'
import type { EditorDocument } from './types.ts'
import { t } from '../i18n/i18n.ts'

// Browsers can't make canvases much bigger than this on a side.
const MAX_LAYER_SIDE = 16000

export interface MoveSession {
  layerId: string
  label: string
  // True when a selected area is moving, so its outline should move along.
  movesSelection: boolean
  // The gap the moved part leaves, when it's being filled in.
  gap: GapFill | null
  // What to show for the layer while it's dragged by dx, dy.
  preview: (dx: number, dy: number) => LayerOverride
  // The design after moving by whole pixels dx, dy.
  commit: (doc: EditorDocument, dx: number, dy: number) => EditorDocument
}

// Moving with nothing selected moves the whole layer, which only changes where it sits.
// Moving with a selection lifts the selected pixels off the layer and puts them down elsewhere.
// Shapes have no pixels to lift, so only whole shapes move. With `fillGap`, the place the part came
// from is filled in from what's around it instead of being left see-through.
export function startMove(doc: EditorDocument, fillGap = false): MoveSession | null {
  const active = activeLayer(doc)
  if (!active) return null

  if (!doc.selection) {
    return {
      layerId: active.id,
      label: t('Move layer'),
      movesSelection: false,
      gap: null,
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

  const gap = fillGap ? gapFor(active, layer, selection, doc.width, doc.height) : null
  const base = gap ? cutGap(layer, gap) : createCanvas(layer.canvas.width, layer.canvas.height)
  if (!gap) {
    const bctx = getContext2d(base)
    bctx.drawImage(layer.canvas, 0, 0)
    bctx.globalCompositeOperation = 'destination-out'
    bctx.drawImage(mask, -layer.x, -layer.y)
  }
  // The filled-in gap shows as soon as it's ready.
  const patch = () => (gap?.patch ? [{ canvas: gap.patch, x: gap.area.x, y: gap.area.y }] : [])

  return {
    layerId: layer.id,
    label: gap ? t('Move and fill the gap') : t('Move selected area'),
    movesSelection: true,
    gap,
    preview: (dx, dy) => ({
      layerId: layer.id,
      parts: [{ canvas: base, x: layer.x, y: layer.y }, ...patch(), { canvas: floating, x: bounds.x + dx, y: bounds.y + dy }],
    }),
    commit: (d, dx, dy) => {
      const moved = { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height }
      const target = snapRect(unionRect(layerRect(layer), moved))
      if (target.width > MAX_LAYER_SIDE || target.height > MAX_LAYER_SIDE) return d
      const canvas = createCanvas(target.width, target.height)
      const ctx = getContext2d(canvas)
      ctx.drawImage(base, layer.x - target.x, layer.y - target.y)
      for (const part of patch()) ctx.drawImage(part.canvas, part.x - target.x, part.y - target.y)
      ctx.drawImage(floating, moved.x - target.x, moved.y - target.y)
      return { ...replaceLayer(d, { ...layer, canvas, x: target.x, y: target.y }), selection: translateSelection(selection, dx, dy) }
    },
  }
}
