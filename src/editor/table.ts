import { fontsVersion, nearestWeight } from '../text/fonts.ts'
import type { TextAlign } from '../text/layout.ts'
import { fitText } from '../text/textLayer.ts'
import { createId } from './document.ts'
import { boxPoint, type TransformBox } from './transform.ts'
import type { Layer, Point, ShapeLayer, TableLayer, TextLayer, TextStyle } from './types.ts'

// Tables, for menus, price lists, timetables and schedules. A table is one object: picked, moved,
// resized and turned like any other. It keeps the words of each cell and how wide each column is;
// the rows are always as tall as their words need. For drawing and downloading, it's made of plain
// parts (colored rows, lines and a text for each cell), so it looks the same everywhere. With
// columns right to left, the first column is on the right, as Hebrew and Yiddish tables are read.

export const MAX_TABLE_ROWS = 200
export const MAX_TABLE_COLUMNS = 30
// The colors a heading row and stripes start with: soft, so the words stay easy to read.
export const TABLE_HEADING = '#eef2ff'
export const TABLE_STRIPES = '#f4f5f7'

// A rectangle in the table's own space: from its top-left corner, unturned and unflipped.
interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface TableShape {
  // Each column's left edge and width, by column (the first column is on the right when columns
  // read right to left).
  columns: { x: number; width: number }[]
  rows: { y: number; height: number }[]
  width: number
  height: number
  // Each cell's words, laid out in its own space (before being placed in the design).
  cells: TextLayer[][]
}

function lineHeightOf(style: TextStyle): number {
  return style.size * style.lineHeight
}

// How the words in a cell look: the heading row is bold.
function cellStyle(table: TableLayer, row: number, column: number): TextStyle {
  const align = table.align[column] ?? 'auto'
  const style = align === 'auto' ? table.style : { ...table.style, align }
  if (row === 0 && table.header !== null) return { ...style, weight: nearestWeight(style.font, Math.max(style.weight, 700)) }
  return style
}

// The words of one cell, laid out to its column's width, in its own space.
function cellText(table: TableLayer, row: number, column: number, width: number): TextLayer {
  const style = cellStyle(table, row, column)
  const text = table.cells[row]?.[column] ?? ''
  return fitText({
    id: `${table.id}:${row}:${column}`,
    kind: 'text',
    name: text,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: 0, cy: 0, width: Math.max(1, width), height: lineHeightOf(style), rotation: 0 },
    text,
    style,
    wrap: true,
  })
}

const shapes = new WeakMap<TableLayer, { version: number; shape: TableShape }>()

// Where every column, row and cell goes. Worked out again only when the table or a font changes.
export function tableShape(table: TableLayer): TableShape {
  const version = fontsVersion()
  const cached = shapes.get(table)
  if (cached && cached.version === version) return cached.shape
  const pad = table.padding
  const width = table.columnWidths.reduce((sum, w) => sum + w, 0)
  let x = table.rtl ? width : 0
  const columns = table.columnWidths.map((w) => {
    if (table.rtl) x -= w
    const column = { x, width: w }
    if (!table.rtl) x += w
    return column
  })
  const cells = table.cells.map((row, r) => row.map((_, c) => cellText(table, r, c, columns[c].width - 2 * pad)))
  let y = 0
  const rows = cells.map((row) => {
    const tallest = Math.max(lineHeightOf(table.style), ...row.map((cell) => Math.abs(cell.box.height)))
    const height = tallest + 2 * pad
    const placed = { y, height }
    y += height
    return placed
  })
  const shape = { columns, rows, width, height: y, cells }
  shapes.set(table, { version, shape })
  return shape
}

// A rectangle of the table as a box in the design, turned and flipped with it.
function placeArea(table: TableLayer, area: Area): TransformBox {
  const { box } = table
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  let x = area.x + area.width / 2 - w / 2
  let y = area.y + area.height / 2 - h / 2
  if (box.width < 0) x = -x
  if (box.height < 0) y = -y
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  return {
    cx: box.cx + x * cos - y * sin,
    cy: box.cy + x * sin + y * cos,
    width: (box.width < 0 ? -1 : 1) * area.width,
    height: (box.height < 0 ? -1 : 1) * area.height,
    rotation: box.rotation,
  }
}

function block(table: TableLayer, id: string, area: Area, color: string): ShapeLayer {
  return {
    id: `${table.id}:${id}`,
    kind: 'shape',
    name: id,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: placeArea(table, area),
    geometry: { type: 'rectangle', corners: 0, sides: 4, arrow: false },
    fill: { kind: 'color', color },
    outline: null,
  }
}

// One cell's words placed in the design: in the middle of its row, inside the space kept around.
export function placedCell(table: TableLayer, row: number, column: number, shape = tableShape(table)): TextLayer {
  const cell = shape.cells[row][column]
  const pad = table.padding
  const col = shape.columns[column]
  const line = shape.rows[row]
  const height = Math.abs(cell.box.height)
  const area = { x: col.x + pad, y: line.y + (line.height - height) / 2, width: Math.max(1, col.width - 2 * pad), height }
  return { ...cell, box: placeArea(table, area) }
}

const allParts = new WeakMap<TableLayer, { version: number; parts: Layer[] }>()

// The table as plain parts, bottom first: its color, the heading row's and every other row's
// colors, the lines, and the words of each cell.
export function tableParts(table: TableLayer): Layer[] {
  const version = fontsVersion()
  const cached = allParts.get(table)
  if (cached && cached.version === version) return cached.parts
  const shape = tableShape(table)
  const { width, height } = shape
  const parts: Layer[] = []
  if (table.background) parts.push(block(table, 'background', { x: 0, y: 0, width, height }, table.background))
  const first = table.header !== null ? 1 : 0
  shape.rows.forEach((row, r) => {
    if (r === 0 && table.header) parts.push(block(table, 'heading', { x: 0, y: row.y, width, height: row.height }, table.header))
    else if (table.stripes && r >= first && (r - first) % 2 === 1) parts.push(block(table, `stripe-${r}`, { x: 0, y: row.y, width, height: row.height }, table.stripes))
  })
  const { lines } = table
  if (lines.kind !== 'none' && lines.width > 0) {
    const lw = lines.width
    shape.rows.forEach((row, r) => {
      if (r === 0) return
      parts.push(block(table, `row-line-${r}`, { x: 0, y: row.y - lw / 2, width, height: lw }, lines.color))
    })
    if (lines.kind === 'all') {
      shape.columns.forEach((column, c) => {
        // The line between this column and the next one, on whichever side that is.
        if (c === shape.columns.length - 1) return
        const edge = table.rtl ? column.x : column.x + column.width
        parts.push(block(table, `column-line-${c}`, { x: edge - lw / 2, y: 0, width: lw, height }, lines.color))
      })
      parts.push(
        block(table, 'top', { x: -lw / 2, y: -lw / 2, width: width + lw, height: lw }, lines.color),
        block(table, 'bottom', { x: -lw / 2, y: height - lw / 2, width: width + lw, height: lw }, lines.color),
        block(table, 'left', { x: -lw / 2, y: -lw / 2, width: lw, height: height + lw }, lines.color),
        block(table, 'right', { x: width - lw / 2, y: -lw / 2, width: lw, height: height + lw }, lines.color),
      )
    }
  }
  shape.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const hidden = table.hiddenCell?.row === r && table.hiddenCell.column === c
      if (cell.text && !hidden) parts.push(placedCell(table, r, c, shape))
    }),
  )
  allParts.set(table, { version, parts })
  return parts
}

// The words of every cell, placed in the design, for downloads that keep text as text.
export function tableTexts(table: TableLayer): TextLayer[] {
  return tableParts(table).filter((part): part is TextLayer => part.kind === 'text')
}

// A box of a new size whose top stays where it was, at the side columns start from.
function keepTop(box: TransformBox, width: number, height: number, side: -1 | 0 | 1): TransformBox {
  const anchor = boxPoint(box, side, -1)
  const next = { ...box, width: Math.sign(box.width || 1) * width, height: Math.sign(box.height || 1) * height }
  const moved = boxPoint(next, side, -1)
  return { ...next, cx: next.cx + anchor.x - moved.x, cy: next.cy + anchor.y - moved.y }
}

// The table with its box fitted to its columns and rows. The same table when it already fits.
export function fitTable(table: TableLayer): TableLayer {
  const shape = tableShape(table)
  const w = Math.abs(table.box.width)
  const h = Math.abs(table.box.height)
  if (Math.abs(w - shape.width) < 1e-6 && Math.abs(h - shape.height) < 1e-6) return table
  const fitted = { ...table, box: keepTop(table.box, shape.width, shape.height, table.rtl ? 1 : -1) }
  shapes.set(fitted, { version: fontsVersion(), shape })
  return fitted
}

// The table placed in a box dragged with its handles: the side handles make the columns wider or
// narrower; the corners make everything bigger or smaller, words too.
export function tableInBox(table: TableLayer, box: TransformBox): TableLayer {
  const oldWidth = Math.abs(table.box.width) || 1
  const oldHeight = Math.abs(table.box.height) || 1
  const sx = Math.abs(box.width) / oldWidth
  const sy = Math.abs(box.height) / oldHeight
  const resized = Math.abs(sy - 1) > 1e-6
  if (!resized && Math.abs(sx - 1) < 1e-6) return { ...table, box }
  const columnWidths = table.columnWidths.map((w) => Math.max(1, w * sx))
  if (resized) {
    const style = { ...table.style, size: Math.max(1, table.style.size * sy) }
    const next = fitTable({ ...table, style, columnWidths, padding: table.padding * sy, lines: { ...table.lines, width: table.lines.width * sy }, box })
    // Centered on the dragged box, so the corner that was pulled meets the pointer.
    return { ...next, box: { ...next.box, cx: box.cx, cy: box.cy } }
  }
  const next = fitTable({ ...table, columnWidths, box: { ...box, height: table.box.height } })
  return { ...next, box: keepTop({ ...box, height: table.box.height }, Math.abs(next.box.width), Math.abs(next.box.height), 0) }
}

// A design point in the table's own space: from its top-left corner, unturned and unflipped.
export function tableLocalPoint(table: TableLayer, point: Point): Point {
  const { box } = table
  const dx = point.x - box.cx
  const dy = point.y - box.cy
  const cos = Math.cos(-box.rotation)
  const sin = Math.sin(-box.rotation)
  const x = (dx * cos - dy * sin) * (box.width < 0 ? -1 : 1)
  const y = (dx * sin + dy * cos) * (box.height < 0 ? -1 : 1)
  return { x: x + Math.abs(box.width) / 2, y: y + Math.abs(box.height) / 2 }
}

// The cell under a design point, or null when it's outside the table.
export function cellAt(table: TableLayer, point: Point): { row: number; column: number } | null {
  const local = tableLocalPoint(table, point)
  const shape = tableShape(table)
  if (local.x < 0 || local.y < 0 || local.x > shape.width || local.y > shape.height) return null
  const row = shape.rows.findIndex((r) => local.y < r.y + r.height)
  const column = shape.columns.findIndex((c) => local.x >= c.x && local.x < c.x + c.width)
  return row < 0 || column < 0 ? null : { row, column }
}

// The words of one cell changed.
export function withCell(table: TableLayer, row: number, column: number, text: string): TableLayer {
  const cells = table.cells.map((cells, r) => (r === row ? cells.map((t, c) => (c === column ? text : t)) : cells))
  return fitTable({ ...table, cells })
}

// A new row before `at` (at the end when `at` is the number of rows).
export function addRow(table: TableLayer, at: number): TableLayer {
  if (table.cells.length >= MAX_TABLE_ROWS) return table
  const empty = table.columnWidths.map(() => '')
  const cells = [...table.cells.slice(0, at), empty, ...table.cells.slice(at)]
  return fitTable({ ...table, cells })
}

export function removeRow(table: TableLayer, at: number): TableLayer {
  if (table.cells.length <= 1) return table
  return fitTable({ ...table, cells: table.cells.filter((_, r) => r !== at) })
}

// A new column before `at`, as wide as the column next to it; the table grows by that much.
export function addColumn(table: TableLayer, at: number): TableLayer {
  if (table.columnWidths.length >= MAX_TABLE_COLUMNS) return table
  const width = table.columnWidths[Math.min(at, table.columnWidths.length - 1)] ?? table.style.size * 6
  const insert = <T,>(list: T[], value: T) => [...list.slice(0, at), value, ...list.slice(at)]
  return fitTable({
    ...table,
    columnWidths: insert(table.columnWidths, width),
    align: insert(table.align, 'auto' as TextAlign),
    cells: table.cells.map((row) => insert(row, '')),
  })
}

export function removeColumn(table: TableLayer, at: number): TableLayer {
  if (table.columnWidths.length <= 1) return table
  const without = <T,>(list: T[]) => list.filter((_, c) => c !== at)
  return fitTable({ ...table, columnWidths: without(table.columnWidths), align: without(table.align), cells: table.cells.map(without) })
}

// A new table with `rows` × `columns` empty cells, `width` wide, its top middle at `top`.
export function newTable(rows: number, columns: number, top: Point, width: number, textStyle: TextStyle, rtl: boolean, name: string): TableLayer {
  // Cells are plain words: no list points or fading colors.
  const style: TextStyle = { ...textStyle, list: null, gradient: null }
  const size = style.size
  const table: TableLayer = {
    id: createId('layer'),
    kind: 'table',
    name,
    visible: true,
    opacity: 1,
    locked: false,
    adjust: null,
    box: { cx: top.x, cy: top.y, width, height: 1, rotation: 0 },
    cells: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
    columnWidths: Array.from({ length: columns }, () => width / columns),
    align: Array.from({ length: columns }, () => 'auto' as TextAlign),
    style,
    padding: Math.round(size * 0.45 * 10) / 10,
    background: null,
    header: TABLE_HEADING,
    stripes: null,
    lines: { kind: 'all', color: '#d0d5dd', width: Math.max(1, Math.round(size / 16)) },
    rtl,
  }
  const fitted = fitTable(table)
  return { ...fitted, box: { ...fitted.box, cx: top.x, cy: top.y + Math.abs(fitted.box.height) / 2 } }
}
