import { Brush, Eraser, Hand, Pipette, ZoomIn, type LucideIcon } from 'lucide-react'
import type { ToolId } from './editor/types.ts'
import { ALT_LABEL } from './keys.ts'

export interface ToolInfo {
  id: ToolId
  name: string
  // Short label under the icon in the tool dock.
  label: string
  key: string
  icon: LucideIcon
  // Shown when hovering the tool.
  description: string
  // Shown at the top of the canvas while the tool is in use.
  hint: string
  // Extra words people might type into search to find this tool.
  keywords: string[]
  // Drawing tools sit in the first group of the dock, view tools in the second.
  group: 'draw' | 'view'
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'brush',
    name: 'Brush',
    label: 'Brush',
    key: 'B',
    icon: Brush,
    description:
      'Paint on the selected layer. Pick a ready-made brush like Pencil or Marker, or adjust size and softness yourself.',
    hint: `Drag to paint. Shift + click draws a straight line. Hold ${ALT_LABEL} to pick a color.`,
    keywords: ['paint', 'draw', 'pencil', 'pen', 'marker', 'sketch', 'color in', 'highlighter'],
    group: 'draw',
  },
  {
    id: 'eraser',
    name: 'Eraser',
    label: 'Eraser',
    key: 'E',
    icon: Eraser,
    description:
      'Rub out paint on the selected layer. Erased parts become see-through, so the layers underneath show again.',
    hint: 'Drag to rub out paint on the selected layer. Shift + click erases in a straight line.',
    keywords: ['erase', 'rub out', 'remove', 'delete paint', 'clean up', 'rubber'],
    group: 'draw',
  },
  {
    id: 'picker',
    name: 'Color picker',
    label: 'Picker',
    key: 'I',
    icon: Pipette,
    description: `Pick up any color from your design to paint with it. Tip: with the Brush, hold ${ALT_LABEL} to pick a color without switching tools.`,
    hint: 'Click anywhere on your design to paint with that color.',
    keywords: ['eyedropper', 'pick color', 'sample', 'dropper', 'copy color', 'match color'],
    group: 'draw',
  },
  {
    id: 'hand',
    name: 'Hand',
    label: 'Hand',
    key: 'H',
    icon: Hand,
    description:
      'Slide your design around to see a different part of it. It never changes your design. ' +
      'Tip: hold Space to use the Hand at any time.',
    hint: 'Drag to slide your design around.',
    keywords: ['move around', 'pan', 'scroll', 'slide', 'drag', 'navigate', 'look around'],
    group: 'view',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    label: 'Zoom',
    key: 'Z',
    icon: ZoomIn,
    description: `Look closer or step back. Click a spot to zoom in on it. Hold ${ALT_LABEL} and click to zoom out.`,
    hint: `Click to zoom in. Hold ${ALT_LABEL} and click to zoom out.`,
    keywords: ['magnify', 'magnifying glass', 'closer', 'bigger', 'smaller', 'look closer'],
    group: 'view',
  },
]

export function toolInfo(id: ToolId): ToolInfo {
  return TOOLS.find((tool) => tool.id === id)!
}
