import type { TextAlign, TextDirection } from '../text/layout.ts'
import type { Adjustments } from './adjust.ts'
import type { BlendMode, LayerEffects } from './effects.ts'
import type { Selection } from './selection.ts'
import type { TransformBox } from './transform.ts'

export interface Point {
  x: number
  y: number
}

// What every layer has, whatever is on it.
interface LayerBase {
  id: string
  name: string
  visible: boolean
  opacity: number
  // A locked layer can't be picked or moved on the design by accident. Painting on it still works.
  locked: boolean
  // Adjustments that stay editable: they show on top of the layer without changing what's on it,
  // so they can be changed again or removed at any time.
  adjust: Adjustments | null
  // A shadow, glow or outline around what's on the layer. Like adjustments, they never change what's
  // on it, so they can be changed again or taken off at any time. Missing means none.
  effects?: LayerEffects | null
  // How the layer mixes with what's below it. Missing means normal.
  blend?: BlendMode
}

// A layer of pixels: a photo, a painting, a pasted picture.
export interface PixelLayer extends LayerBase {
  kind: 'raster'
  // The layer's pixels. The canvas can be bigger or smaller than the design and sit anywhere,
  // so moving a layer never cuts anything off.
  canvas: HTMLCanvasElement
  // Where the canvas's top-left corner sits in the design.
  x: number
  y: number
  // Set once the layer has been resized or turned: the canvas is shown stretched and turned to fill
  // this box instead of sitting at x, y. Only the box changes, so the pixels never lose quality.
  // Painting on the layer first settles it back into plain pixels.
  box: TransformBox | null
}

export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line'

export interface ShapeGeometry {
  type: ShapeType
  // How round a rectangle's corners are, 0 (sharp) to 1 (as round as they can be).
  corners: number
  // Sides of a polygon, or points of a star.
  sides: number
  // Lines can end in an arrow head.
  arrow: boolean
}

export type ShapeFill =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  // A photo filling the shape. It always covers the whole shape: `zoom` enlarges it from there, and
  // x, y (-1 to 1) slide it to show another part of it.
  | { kind: 'photo'; canvas: HTMLCanvasElement; zoom: number; x: number; y: number }

export interface ShapeOutline {
  color: string
  // In design pixels.
  width: number
}

// A shape that stays sharp at any size and stays editable.
export interface ShapeLayer extends LayerBase {
  kind: 'shape'
  // Where the shape sits: its middle, size (negative when flipped) and how far it's turned.
  box: TransformBox
  geometry: ShapeGeometry
  fill: ShapeFill
  outline: ShapeOutline | null
}

export interface TextStyle {
  // A font's id from the font library.
  font: string
  // In design pixels.
  size: number
  weight: number
  italic: boolean
  color: string
  // 'auto' lines each paragraph up the way it reads: right for Hebrew and Yiddish, left for English.
  align: TextAlign
  // 'auto' lets each paragraph's first letter decide which way it reads.
  direction: TextDirection
  // Extra space between letters, as a share of the size (0.1 is a tenth of the size).
  letterSpacing: number
  // Distance between lines, as a multiple of the size.
  lineHeight: number
}

// Text that stays editable and sharp at any size.
export interface TextLayer extends LayerBase {
  kind: 'text'
  // Where the text sits. Its size always fits the text; with `wrap`, the width is where lines wrap.
  box: TransformBox
  text: string
  style: TextStyle
  // A paragraph box wraps its lines to its width; otherwise lines only break where Enter was pressed.
  wrap: boolean
}

// One object in the design. Bottom layer first.
export type Layer = PixelLayer | ShapeLayer | TextLayer

export interface EditorDocument {
  id: string
  name: string
  width: number
  height: number
  // The color of the page under everything, or null for a see-through page.
  background: string | null
  // Bottom layer first, top layer last.
  layers: Layer[]
  // The layer that painting and layer actions apply to. Empty when the page itself is picked.
  activeLayerId: string
  // The selected area; painting and editing stay inside it. Null means nothing is selected.
  selection: Selection | null
}

// Where the document sits on screen: a screen point equals
// document point * zoom + pan, all in CSS pixels.
export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export type ToolId = 'move' | 'select' | 'crop' | 'shape' | 'text' | 'brush' | 'eraser' | 'fill' | 'picker' | 'adjust' | 'hand' | 'zoom'
