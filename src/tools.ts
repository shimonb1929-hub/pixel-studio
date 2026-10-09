import { Brush, Crop, Eraser, Hand, Move, PaintBucket, Pipette, Scaling, SlidersHorizontal, SquareDashed, ZoomIn, type LucideIcon } from 'lucide-react'
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
  // The dock shows tools in groups: arranging things, drawing, changing colors, and looking around.
  group: 'arrange' | 'draw' | 'adjust' | 'view'
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'move',
    name: 'Move',
    label: 'Move',
    key: 'V',
    icon: Move,
    description:
      'Drag to move the selected layer. If part of it is selected, only that part moves. Arrow keys move it one pixel at a time.',
    hint: 'Drag to move the selected layer, or just the selected part. Arrow keys nudge it.',
    keywords: ['move', 'drag', 'position', 'place', 'shift', 'nudge', 'arrange'],
    group: 'arrange',
  },
  {
    id: 'select',
    name: 'Select',
    label: 'Select',
    key: 'M',
    icon: SquareDashed,
    description: `Choose part of your design to work on. Painting, erasing, deleting and moving then only affect that part. Draw a rectangle, an oval, or any shape by hand.`,
    hint: `Drag to select an area. Hold Shift to add to it, ${ALT_LABEL} to take away. Click outside to clear it.`,
    keywords: ['select', 'selection', 'marquee', 'lasso', 'choose area', 'cut out', 'rectangle', 'oval', 'circle'],
    group: 'arrange',
  },
  {
    id: 'transform',
    name: 'Resize and rotate',
    label: 'Resize',
    key: 'T',
    icon: Scaling,
    description:
      'Make things bigger or smaller, turn them, or flip them. Works on the selected layer, or just the selected part. Nothing changes for good until you press Apply.',
    hint: 'Drag a corner to resize, the round handle to turn. Press Enter to apply, Esc to cancel.',
    keywords: ['resize', 'scale', 'rotate', 'turn', 'flip', 'mirror', 'bigger', 'smaller', 'transform', 'stretch', 'size'],
    group: 'arrange',
  },
  {
    id: 'crop',
    name: 'Crop',
    label: 'Crop',
    key: 'C',
    icon: Crop,
    description:
      'Cut your design down to just the part you want to keep. Nothing is thrown away: you can undo it, or crop again to bring parts back.',
    hint: 'Drag the edges or corners to choose what to keep. Press Enter to crop, Esc to start over.',
    keywords: ['crop', 'trim', 'cut down', 'frame', 'canvas size', 'shape'],
    group: 'arrange',
  },
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
    id: 'fill',
    name: 'Fill bucket',
    label: 'Fill',
    key: 'G',
    icon: PaintBucket,
    description:
      'Click an area to fill it with your color, like coloring in a coloring book. It fills everything of a similar color around where you click.',
    hint: 'Click an area to fill it with your color.',
    keywords: ['fill', 'bucket', 'paint bucket', 'color in', 'flood', 'coloring'],
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
    id: 'adjust',
    name: 'Adjust',
    label: 'Adjust',
    key: 'A',
    icon: SlidersHorizontal,
    description:
      'Change the light and colors of the selected layer, or just the selected part: ready-made looks like Black & white, and sliders for brightness, contrast, color, blur and sharpness. Nothing changes for good until you press Apply.',
    hint: 'Pick a look or move the sliders on the right. Press and hold on your design to compare. Enter applies, Esc cancels.',
    keywords: [
      'adjust',
      'brightness',
      'lighter',
      'darker',
      'contrast',
      'saturation',
      'color strength',
      'colorful',
      'black and white',
      'grayscale',
      'sepia',
      'warm',
      'cool',
      'blur',
      'sharpen',
      'filter',
      'effect',
      'look',
      'fix photo',
      'enhance',
    ],
    group: 'adjust',
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
