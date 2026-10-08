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
  canvas: HTMLCanvasElement
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
}

// Where the document sits on screen: a screen point equals
// document point * zoom + pan, all in CSS pixels.
export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export type ToolId = 'brush' | 'eraser' | 'picker' | 'hand' | 'zoom'
