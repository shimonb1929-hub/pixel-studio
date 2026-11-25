import type { Rect } from './geometry.ts'
import type { EditorDocument, Guides } from './types.ts'

// Guide lines: straight lines pulled out of the rulers that things line up with, like the margins
// and the grid. They are part of the design (saved, undone) but never printed or exported.

export const MAX_GUIDES = 200

export type GuideAxis = 'x' | 'y'

export function hasGuides(guides: Guides | undefined): guides is Guides {
  return !!guides && guides.x.length + guides.y.length > 0
}

// The guides as lines to snap to: up-and-down ones have no width, across ones no height.
export function guideLines(guides: Guides | undefined, width: number, height: number): Rect[] {
  if (!guides) return []
  return [...guides.x.map((x) => ({ x, y: 0, width: 0, height })), ...guides.y.map((y) => ({ x: 0, y, width, height: 0 }))]
}

// The guides with one added, moved (from `index`) or taken away (`at` null). Positions are kept to
// whole pixels so things that snap to them stay sharp.
export function changeGuide(guides: Guides | undefined, axis: GuideAxis, index: number | null, at: number | null): Guides {
  const list = [...(guides?.[axis] ?? [])]
  if (index !== null) list.splice(index, 1)
  if (at !== null && list.length < MAX_GUIDES) list.push(Math.round(at))
  return { x: guides?.x ?? [], y: guides?.y ?? [], [axis]: list }
}

export function withGuides(doc: EditorDocument, guides: Guides): EditorDocument {
  if (hasGuides(guides)) return { ...doc, guides }
  const rest = { ...doc }
  delete rest.guides
  return rest
}
