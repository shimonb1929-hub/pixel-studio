import { frameOf, layerInFrame } from './arrange.ts'
import { createId, duplicateLayer } from './document.ts'
import { groupMembers, keepTogether } from './layers.ts'
import type { TransformBox } from './transform.ts'
import type { EditorDocument, Layer, LayerGroup } from './types.ts'

// Make copies (pro: Repeat, Step and Repeat): copies of what is picked, in a row, a column, a grid,
// around a circle, or as a mirror image beside it. Everything stays sharp and changeable: the
// copies are ordinary things, kept together with the original so they move as one.

export type RepeatKind = 'row' | 'column' | 'grid' | 'circle' | 'mirror'

export interface RepeatSettings {
  kind: RepeatKind
  // How many in all, the original too (a row, a column or a circle).
  count: number
  // A grid: how many across and how many down.
  across: number
  down: number
  // Space between neighbours, in design pixels (rows, columns, grids and the mirror image).
  gap: number
  // A circle: how far each thing is from its middle, in design pixels.
  radius: number
  // A circle: each copy turns to face the middle, like petals or the spokes of a wheel.
  turn: boolean
}

export const MAX_COPIES = 100

// Good starting settings for things of this size: a small gap, and a circle wide enough that the
// copies don't overlap.
export function startingRepeat(frame: { width: number; height: number }, kind: RepeatKind = 'row'): RepeatSettings {
  const side = Math.max(Math.abs(frame.width), Math.abs(frame.height), 1)
  const count = kind === 'circle' ? 8 : 4
  return { kind, count, across: 3, down: 3, gap: Math.round(side * 0.2), radius: circleRadius(side, count), turn: true }
}

// A circle that fits this many things of this size side by side, with a little air between them.
export function circleRadius(side: number, count: number): number {
  return Math.round(Math.max(side, (count * side * 1.25) / (2 * Math.PI)))
}

// How many things the settings make, the original included.
export function repeatTotal(settings: RepeatSettings): number {
  if (settings.kind === 'mirror') return 2
  if (settings.kind === 'grid') return settings.across * settings.down
  return settings.count
}

// Where each copy goes: the frame around the original moved, turned or flipped. The original's own
// frame is not in the list. `rtl` sends rows and grids to the left, the way Hebrew and Yiddish read.
export function repeatFrames(frame: TransformBox, settings: RepeatSettings, rtl = false): TransformBox[] {
  const w = Math.abs(frame.width)
  const h = Math.abs(frame.height)
  const side = rtl ? -1 : 1
  const total = Math.min(MAX_COPIES, repeatTotal(settings))
  const frames: TransformBox[] = []
  for (let k = 1; k < total; k++) {
    if (settings.kind === 'row') frames.push({ ...frame, cx: frame.cx + side * k * (w + settings.gap) })
    else if (settings.kind === 'column') frames.push({ ...frame, cy: frame.cy + k * (h + settings.gap) })
    else if (settings.kind === 'grid') {
      const across = Math.max(1, settings.across)
      const column = k % across
      const row = Math.floor(k / across)
      frames.push({ ...frame, cx: frame.cx + side * column * (w + settings.gap), cy: frame.cy + row * (h + settings.gap) })
    } else if (settings.kind === 'circle') {
      // The original sits at the top of the circle; the copies go around clockwise.
      const angle = (2 * Math.PI * k) / total
      const middle = { x: frame.cx, y: frame.cy + settings.radius }
      frames.push({
        ...frame,
        cx: middle.x + settings.radius * Math.sin(angle),
        cy: middle.y - settings.radius * Math.cos(angle),
        rotation: settings.turn ? frame.rotation + angle : frame.rotation,
      })
    } else frames.push({ ...frame, cx: frame.cx + side * (w + settings.gap), width: -frame.width })
  }
  return frames
}

// The design with copies of the chosen things made and kept together with them, all picked. The
// same design when nothing is chosen. `name` names what they're kept together as.
export function makeCopies(doc: EditorDocument, ids: string[], settings: RepeatSettings, name: string, rtl = false): EditorDocument {
  const chosen = doc.layers.filter((l) => ids.includes(l.id))
  const frame = frameOf(chosen)
  if (!frame || chosen.length === 0) return doc
  const frames = repeatFrames(frame, settings, rtl)
  if (frames.length === 0) return doc
  // Copies of part of a group, picked inside it, stay in that group; otherwise everything is kept
  // together as one new thing.
  const firstGroup = chosen[0].group?.id
  const inside = firstGroup !== undefined && chosen.every((l) => l.group?.id === firstGroup) && !groupMembers(doc, firstGroup).every((m) => ids.includes(m.id))
  const copies: Layer[] = frames.flatMap((to) =>
    chosen.map((layer) => {
      const made = layerInFrame(duplicateLayer(layer), frame, to)
      // A copy keeps the original's name, so the Layers panel stays easy to read.
      return { ...made, name: layer.name }
    }),
  )
  let top = doc.layers.indexOf(chosen[chosen.length - 1])
  const block = doc.layers[top].group?.id
  while (!inside && block && doc.layers[top + 1]?.group?.id === block) top++
  const layers = [...doc.layers]
  layers.splice(top + 1, 0, ...copies)
  const placed: EditorDocument = { ...doc, layers, activeLayerId: copies[copies.length - 1].id }
  if (inside) return placed
  const group: LayerGroup = { id: createId('group'), name }
  return keepTogether(placed, [...chosen.map((l) => l.id), ...copies.map((l) => l.id)], group)
}
