import { Bandage, Brush, Crop, Eclipse, Eraser, Hand, MousePointer2, PaintBucket, Spline, Pipette, Shapes, SlidersHorizontal, SquareDashed, Type, ZoomIn, type LucideIcon } from 'lucide-react'
import type { ToolId } from './editor/types.ts'
import { t } from './i18n/i18n.ts'
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
  // The dock shows tools in small groups, each with a caption on tall screens: picking and moving
  // things, adding things, painting, fixing photos, and looking around.
  group: 'arrange' | 'add' | 'paint' | 'adjust' | 'view'
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'move',
    get name() {
      return t('Arrange')
    },
    get label() {
      return t('Arrange')
    },
    key: 'V',
    icon: MousePointer2,
    get description() {
      return t('Click anything on your design to pick it. Drag it to move it, pull a corner to resize it, or the round handle to turn it. Drag a box around several things to pick them all. Pictures never lose quality, however often you resize them.')
    },
    get hint() {
      return t('Click something to pick it, or drag a box around several. Drag to move; it lines up by itself (hold {alt} to move freely). Pull a corner to resize, the round handle to turn.', { alt: ALT_LABEL })
    },
    keywords: ['move', 'drag', 'position', 'place', 'resize', 'scale', 'rotate', 'turn', 'flip', 'mirror', 'arrange', 'pick', 'bigger', 'smaller', 'transform', 'nudge', 'stretch', 'select several', 'multiple'],
    group: 'arrange',
  },
  {
    id: 'select',
    get name() {
      return t('Select')
    },
    get label() {
      return t('Select')
    },
    key: 'M',
    icon: SquareDashed,
    get description() {
      return t('Choose part of your design to work on. Painting, erasing, deleting and moving then only affect that part. Draw a rectangle, an oval, or any shape by hand.')
    },
    get hint() {
      return t('Drag to select an area. Hold Shift to add to it, {alt} to take away. Click outside to clear it.', { alt: ALT_LABEL })
    },
    keywords: ['select', 'selection', 'marquee', 'lasso', 'choose area', 'cut out', 'rectangle', 'oval', 'circle', 'magic', 'magic wand', 'quick select', 'select subject', 'object', 'ai'],
    group: 'arrange',
  },
  {
    id: 'crop',
    get name() {
      return t('Crop')
    },
    get label() {
      return t('Crop')
    },
    key: 'C',
    icon: Crop,
    get description() {
      return t('Cut your design down to just the part you want to keep. Nothing is thrown away: you can undo it, or crop again to bring parts back.')
    },
    get hint() {
      return t('Drag the edges or corners to choose what to keep. Press Enter to crop, Esc to start over.')
    },
    keywords: ['crop', 'trim', 'cut down', 'frame', 'canvas size', 'shape'],
    group: 'arrange',
  },
  {
    id: 'shape',
    get name() {
      return t('Shapes')
    },
    get label() {
      return t('Shapes')
    },
    key: 'U',
    icon: Shapes,
    get description() {
      return t('Draw rectangles, ovals, polygons, stars, lines and arrows. They stay sharp at any size, and you can change their colors, outline and corners any time.')
    },
    get hint() {
      return t('Drag to draw a shape, or click empty paper to drop one. Click a shape to pick it. Hold Shift for a perfect square or circle, or a straight line.')
    },
    keywords: ['shape', 'rectangle', 'square', 'circle', 'oval', 'ellipse', 'triangle', 'polygon', 'hexagon', 'star', 'line', 'arrow', 'box', 'frame', 'vector', 'badge', 'button', 'rounded corners', 'round corners', 'photo in a shape', 'round photo', 'photo frame', 'picture frame'],
    group: 'add',
  },
  {
    id: 'pen',
    get name() {
      return t('Curve')
    },
    get label() {
      return t('Curve')
    },
    key: 'P',
    icon: Spline,
    get description() {
      return t('Draw any shape you like, point by point: click for sharp corners, or press and drag for smooth curves. Click the first point to close the shape. Afterwards, drag points and lines to reshape it any time. It stays sharp at any size.')
    },
    get hint() {
      return t('Click to add points, or press and drag for a curve. Click the first point to close the shape, or press Enter to finish a line. Drag a point or a line to reshape; double-click a point to make it sharp or smooth.')
    },
    keywords: ['pen', 'path', 'bezier', 'curve', 'vector', 'draw shape', 'custom shape', 'outline', 'trace', 'anchor', 'points', 'logo', 'icon', 'illustration', 'reshape', 'edit points', 'curved arrow'],
    group: 'add',
  },
  {
    id: 'text',
    get name() {
      return t('Text')
    },
    get label() {
      return t('Text')
    },
    key: 'T',
    icon: Type,
    get description() {
      return t('Write words on your design, in English, Hebrew or Yiddish. Click where the text should start, or drag a box for a paragraph. Hebrew and Yiddish read right to left by themselves.')
    },
    get hint() {
      return t('Click where your text starts, or drag a box for a paragraph. Click text to change it. Esc when you are done.')
    },
    keywords: ['text', 'type', 'write', 'words', 'letters', 'font', 'title', 'heading', 'headline', 'caption', 'quote', 'paragraph', 'hebrew', 'yiddish', 'right to left', 'rtl', 'typography', 'text color', 'font color', 'letter color', 'text size', 'font size'],
    group: 'add',
  },
  {
    id: 'brush',
    get name() {
      return t('Brush')
    },
    get label() {
      return t('Brush')
    },
    key: 'B',
    icon: Brush,
    get description() {
      return t('Paint on the selected layer. Pick a ready-made brush like Pencil or Marker, or adjust size and softness yourself.')
    },
    get hint() {
      return t('Drag to paint. Shift + click draws a straight line. Hold {alt} to pick a color.', { alt: ALT_LABEL })
    },
    keywords: ['paint', 'draw', 'pencil', 'pen', 'marker', 'sketch', 'color in', 'highlighter', 'oil paint', 'splatter', 'drips', 'spray', 'brushes'],
    group: 'paint',
  },
  {
    id: 'eraser',
    get name() {
      return t('Eraser')
    },
    get label() {
      return t('Eraser')
    },
    key: 'E',
    icon: Eraser,
    get description() {
      return t('Rub out paint on the selected layer. Erased parts become see-through, so the layers underneath show again.')
    },
    get hint() {
      return t('Drag to rub out paint on the selected layer. Shift + click erases in a straight line.')
    },
    keywords: ['erase', 'rub out', 'remove', 'delete paint', 'clean up', 'rubber'],
    group: 'paint',
  },
  {
    id: 'fade',
    get name() {
      return t('Fade')
    },
    get label() {
      return t('Fade')
    },
    key: 'F',
    icon: Eclipse,
    get description() {
      return t('Softly hide part of a photo, a shape or some words by brushing over it, so it fades into what is behind. Nothing is lost: switch to Bring back and brush to show it again. Ready-made fades are in the Fade panel.')
    },
    get hint() {
      return t('Brush over the part of the picked thing you want to fade away. Hold {alt} to bring hidden parts back.', { alt: ALT_LABEL })
    },
    keywords: ['fade', 'hide', 'hide part', 'mask', 'layer mask', 'blend', 'blend edges', 'soft edges', 'vignette', 'feather', 'fade out', 'transparent', 'see-through', 'melt', 'merge photos', 'disappear', 'gradient mask'],
    group: 'paint',
  },
  {
    id: 'fill',
    get name() {
      return t('Fill bucket')
    },
    get label() {
      return t('Fill')
    },
    key: 'G',
    icon: PaintBucket,
    get description() {
      return t('Click an area to fill it with your color, like coloring in a coloring book. It fills everything of a similar color around where you click.')
    },
    get hint() {
      return t('Click an area to fill it with your color.')
    },
    keywords: ['fill', 'bucket', 'paint bucket', 'color in', 'flood', 'coloring'],
    group: 'paint',
  },
  {
    id: 'picker',
    get name() {
      return t('Color picker')
    },
    get label() {
      return t('Picker')
    },
    key: 'I',
    icon: Pipette,
    get description() {
      return t('Pick up any color from your design to paint with it. Tip: with the Brush, hold {alt} to pick a color without switching tools.', { alt: ALT_LABEL })
    },
    get hint() {
      return t('Click anywhere on your design to paint with that color.')
    },
    keywords: ['eyedropper', 'pick color', 'sample', 'dropper', 'copy color', 'match color'],
    group: 'paint',
  },
  {
    id: 'adjust',
    get name() {
      return t('Adjust')
    },
    get label() {
      return t('Adjust')
    },
    key: 'A',
    icon: SlidersHorizontal,
    get description() {
      return t('Change the light and colors of the selected layer, or just the selected part: ready-made looks like Black & white, and sliders for brightness, contrast, color, blur and sharpness. Nothing changes for good until you press Apply.')
    },
    get hint() {
      return t('Pick a look or move the sliders on the right. Press and hold on your design to compare. Enter applies, Esc cancels.')
    },
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
    id: 'heal',
    get name() {
      return t('Fix spots')
    },
    get label() {
      return t('Fix')
    },
    key: 'J',
    icon: Bandage,
    get description() {
      return t('Brush over a spot, a scratch or a small thing you want gone, and it is filled in from what is around it, as if it was never there.')
    },
    get hint() {
      return t('Brush over what you want gone. When you let go, it is filled in from what is around it.')
    },
    keywords: ['fix', 'heal', 'healing', 'spot', 'blemish', 'scratch', 'dust', 'remove object', 'clone', 'repair', 'clean up', 'content aware', 'retouch', 'erase thing'],
    group: 'adjust',
  },
  {
    id: 'hand',
    get name() {
      return t('Hand')
    },
    get label() {
      return t('Hand')
    },
    key: 'H',
    icon: Hand,
    get description() {
      return t('Slide your design around to see a different part of it. It never changes your design. Tip: hold Space to use the Hand at any time.')
    },
    get hint() {
      return t('Drag to slide your design around.')
    },
    keywords: ['move around', 'pan', 'scroll', 'slide', 'drag', 'navigate', 'look around'],
    group: 'view',
  },
  {
    id: 'zoom',
    get name() {
      return t('Zoom')
    },
    get label() {
      return t('Zoom')
    },
    key: 'Z',
    icon: ZoomIn,
    get description() {
      return t('Look closer or step back. Click a spot to zoom in on it. Hold {alt} and click to zoom out.', { alt: ALT_LABEL })
    },
    get hint() {
      return t('Click to zoom in. Hold {alt} and click to zoom out.', { alt: ALT_LABEL })
    },
    keywords: ['magnify', 'magnifying glass', 'closer', 'bigger', 'smaller', 'look closer'],
    group: 'view',
  },
]

export function toolInfo(id: ToolId): ToolInfo {
  return TOOLS.find((tool) => tool.id === id)!
}
