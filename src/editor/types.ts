import type { Adjustments } from './adjust.ts'
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

// One object in the design. Bottom layer first.
export type Layer = PixelLayer | ShapeLayer

export interface EditorDocument {
  id: string
  name: string
  width: number
  height: number
  // Bottom layer first, top layer last.
  layers: Layer[]
  // The layer that painting and layer actions apply to.
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

export type ToolId = 'move' | 'select' | 'crop' | 'shape' | 'brush' | 'eraser' | 'fill' | 'picker' | 'adjust' | 'hand' | 'zoom'
