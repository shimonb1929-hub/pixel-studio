import type { Selection } from './selection.ts'

export interface Point {
  x: number
  y: number
}

// A layer is one sheet in the stack. For now every layer holds pixels;
// vector shapes and text will become their own layer kinds later.
export interface Layer {
  id: string
  kind: 'raster'
  name: string
  // The layer's pixels. The canvas can be bigger or smaller than the design and sit anywhere,
  // so moving a layer never cuts anything off.
  canvas: HTMLCanvasElement
  // Where the canvas's top-left corner sits in the design.
  x: number
  y: number
  visible: boolean
  opacity: number
}

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

export type ToolId = 'move' | 'select' | 'transform' | 'crop' | 'brush' | 'eraser' | 'fill' | 'picker' | 'hand' | 'zoom'
