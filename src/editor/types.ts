import type { ListKind, TextAlign, TextDirection } from '../text/layout.ts'
import type { Adjustments } from './adjust.ts'
import type { BlendMode, LayerEffects } from './effects.ts'
import type { Gradient } from './gradient.ts'
import type { ShapePath } from './path.ts'
import type { Selection } from './selection.ts'
import type { TransformBox } from './transform.ts'
import type { TextPath } from '../text/textCurve.ts'

export interface Point {
  x: number
  y: number
}

// Layers kept together act as one thing: picked, moved and resized together. They always sit next
// to each other in the stack.
export interface LayerGroup {
  id: string
  name: string
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
  // Set when it's kept together with other layers.
  group?: LayerGroup
  // A shadow, glow or outline around what's on the layer. Like adjustments, they never change what's
  // on it, so they can be changed again or taken off at any time. Missing means none.
  effects?: LayerEffects | null
  // How the layer mixes with what's below it. Missing means normal.
  blend?: BlendMode
  // Set when it's on every page: each page has a copy with the same `everyPage`, kept the same.
  everyPage?: string
  // Pictures and shapes: set when text in a box nearby flows around it instead of running under
  // it. Missing means text ignores it.
  textWrap?: TextWrap | null
}

// How text flows around a picture or shape (what design programs call text wrap): close around
// its outline, around the box it sits in, or only above and below it, with some space kept free.
export type TextWrapMode = 'shape' | 'box' | 'jump'

export interface TextWrap {
  mode: TextWrapMode
  // Space kept free between it and the text, in design pixels.
  gap: number
}

// Something a text flows around, in the text's own coordinates: from the top-left of its box,
// unturned and unflipped. Worked out again after every change, from the things the text overlaps.
export interface AvoidArea {
  // Its outlines; text keeps out of everything between their leftmost and rightmost points, row by row.
  outlines: Point[][]
  gap: number
  // Which side of it the text runs down, or 'none' when text only goes above and below it.
  side: 'left' | 'right' | 'none'
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

// 'path' is a shape drawn point by point with the Pen.
export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path'

export interface ShapeGeometry {
  type: ShapeType
  // How round a rectangle's corners are, 0 (sharp) to 1 (as round as they can be).
  corners: number
  // Sides of a polygon, or points of a star.
  sides: number
  // Lines (and open pen paths) can end in an arrow head.
  arrow: boolean
  // The points of a pen path, relative to the box: -0.5 to 0.5 across its width and height.
  path?: ShapePath
  // More closed outlines of the same shape, from joining or cutting shapes: holes cut into it, and
  // pieces apart from it. With them, a spot is inside when an odd number of outlines go around it.
  parts?: ShapePath[]
}

export type ShapeFill =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  // Colors fading into each other across the shape.
  | { kind: 'gradient'; gradient: Gradient }
  // A photo filling the shape. It always covers the whole shape: `zoom` enlarges it from there, and
  // x, y (-1 to 1) slide it to show another part of it.
  | { kind: 'photo'; canvas: HTMLCanvasElement; zoom: number; x: number; y: number }

export type OutlineDash = 'solid' | 'dashed' | 'dotted'

export interface ShapeOutline {
  color: string
  // In design pixels.
  width: number
  // A line of dashes or dots instead of a solid one. Missing means solid.
  dash?: OutlineDash
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
  // Colors fading across all the letters instead of one color (words with their own color keep
  // it). Missing means one color.
  gradient?: Gradient | null
  // Each paragraph is a point of a list, with a dot, number or letter before it. Missing: no list.
  list?: ListKind | null
  // Bends the text into an arc: up like a rainbow when above 0, down like a smile below 0, and a
  // full circle at 1 or -1. Missing or 0 means straight.
  bend?: number
}

// How some letters look different from the rest of their text: only what differs is kept.
export type SpanStyle = Partial<Pick<TextStyle, 'font' | 'weight' | 'italic' | 'color'>>

// Letters from `start` up to `end` that look different. Spans never overlap and are in order.
export interface TextSpan {
  start: number
  end: number
  style: SpanStyle
}

// Text that stays editable and sharp at any size.
export interface TextLayer extends LayerBase {
  kind: 'text'
  // Where the text sits. Its size always fits the text; with `wrap`, the width is where lines wrap.
  box: TransformBox
  text: string
  style: TextStyle
  // Words that have their own font, boldness, slant or color (a bold word, a red name).
  spans?: TextSpan[]
  // A paragraph box wraps its lines to its width; otherwise lines only break where Enter was pressed.
  wrap: boolean
  // Set when the text runs on from box to box: what doesn't fit in one box continues in the next.
  flow?: TextFlow
  // A page number: its text is always the number of the page it's on.
  pageNumber?: boolean
  // Pictures and shapes this paragraph box flows around. Missing when there are none.
  avoid?: AvoidArea[]
  // Set when the words run along the edge of a shape instead of in straight lines.
  along?: TextPath
}

export interface TextFlow {
  // Boxes with the same story share one text, shown in order of `index`.
  story: string
  index: number
  // The whole text of the story, and which part of it this box shows (from `start` to `end`).
  full: string
  start: number
  end: number
  // The box's own height; the last box grows to show everything that's left.
  height: number
}

export interface TableLines {
  // Lines around every cell, only between the rows, or none.
  kind: 'all' | 'rows' | 'none'
  color: string
  // In design pixels.
  width: number
}

// A table: rows and columns of cells with words, for menus, price lists and timetables.
export interface TableLayer extends LayerBase {
  kind: 'table'
  // Where it sits. Its size always fits its columns and rows.
  box: TransformBox
  // The words in each cell, row by row; every row has one for each column.
  cells: string[][]
  // How wide each column is, in design pixels, first column first.
  columnWidths: number[]
  // How each column lines its words up ('auto': the way they read).
  align: TextAlign[]
  // How the words in every cell look.
  style: TextStyle
  // Space between a cell's edges and its words, in design pixels.
  padding: number
  // The color under every cell, or null to see the page through.
  background: string | null
  // The top row is a heading row, with bold words on this color. Null: no heading row.
  header: string | null
  // Every other row gets this color, so long lists are easy to read across. Null: none.
  stripes: string | null
  lines: TableLines
  // The first column is on the right, the way Hebrew and Yiddish tables read.
  rtl: boolean
  // While a cell is being typed in, its words are shown in the typing box, not on the table.
  // Never saved.
  hiddenCell?: { row: number; column: number }
}

// One object in the design. Bottom layer first.
export type Layer = PixelLayer | ShapeLayer | TextLayer | TableLayer

// One page of a design with several pages. Pages can each have their own size, like a post, a
// story and a banner of the same design side by side.
export interface DesignPage {
  id: string
  width: number
  height: number
  background: string | null
  pageGradient?: Gradient | null
  // Bottom layer first.
  layers: Layer[]
  activeLayerId: string
}

export interface EditorDocument {
  id: string
  name: string
  width: number
  height: number
  // The color of the page under everything, or null for a see-through page.
  background: string | null
  // Colors fading across the whole page instead of one color. Only used when `background` is set
  // (which keeps the gradient's first color). Missing means a plain color.
  pageGradient?: Gradient | null
  // Bottom layer first, top layer last.
  layers: Layer[]
  // The layer that painting and layer actions apply to. Empty when the page itself is picked.
  activeLayerId: string
  // The selected area; painting and editing stay inside it. Null means nothing is selected.
  selection: Selection | null
  // How many pixels make an inch on paper, for showing sizes in inches, centimeters or millimeters.
  // Missing means 300.
  ppi?: number
  // Every page of a design with several pages, in order. The page being worked on is the one at
  // `pageIndex`: its entry here is out of date, since its content lives in `background`, `layers`
  // and `activeLayerId` above, so everything else keeps working on one page. Missing for a design
  // with one page.
  pages?: DesignPage[]
  pageIndex?: number
  // Margins and columns: faint lines things line up with. Shared by every page; never printed.
  layout?: PageLayout
}

// In design pixels.
export interface PageLayout {
  // Space kept free around the edge of the page.
  margin: number
  columns: number
  // Space between columns.
  gap: number
}

// Where the document sits on screen: a screen point equals
// document point * zoom + pan, all in CSS pixels.
export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export type ToolId = 'move' | 'select' | 'crop' | 'shape' | 'pen' | 'text' | 'brush' | 'eraser' | 'fill' | 'picker' | 'adjust' | 'heal' | 'clone' | 'hand' | 'zoom'
