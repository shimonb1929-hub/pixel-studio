import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import { arrangeBox, frameOf, previewInBox, previewInFrame } from '../editor/arrange.ts'
import type { BrushSettings } from '../editor/brushes.ts'
import { coverRect } from '../editor/document.ts'
import { ellipsePolygon, polygonBounds, rectFromCorners, rectPolygon, squareFromCorners, type Rect } from '../editor/geometry.ts'
import { activeLayer, pickedWith } from '../editor/layers.ts'
import { drawShape, hitsLayer, layerAt, photoPlacement, settleLayer } from '../editor/objects.ts'
import { onGapFilled } from '../editor/gapFill.ts'
import { startMove, type MoveSession } from '../editor/move.ts'
import { renderScene, type LayerOverride } from '../editor/render.ts'
import { sampleColor } from '../editor/sample.ts'
import { layoutFrames } from '../editor/pageLayout.ts'
import { documentPpi, formatInUnit, getUnit } from '../editor/units.ts'
import { linedUp, snapLines, snapMove, type SnapResult } from '../editor/snap.ts'
import {
  combineSelection,
  isPointSelected,
  selectionInfo,
  translateSelection,
  type Selection,
  type SelectionMode,
  type SelectionShape,
} from '../editor/selection.ts'
import { StrokeSession, type InputPoint, type StrokeResult } from '../editor/stroke.ts'
import {
  boxCorners,
  boxPoint,
  describeChange,
  dragHandle,
  HANDLE_SIGNS,
  hitHandle,
  isIdentity,
  normalizeAngle,
  rotationKnob,
  type EdgeHandles,
  type Handle,
  type TransformBox,
} from '../editor/transform.ts'
import type { EditorDocument, Layer, PixelLayer, Point, ShapeLayer, ToolId, Viewport } from '../editor/types.ts'
import { nextZoomLevel, panBy, screenToDocument, zoomAtPoint } from '../editor/viewport.ts'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'
import { hasRtlLetters } from '../text/layout.ts'
import { textIndexAt } from '../text/textLayer.ts'
import { TextEditBox, type TextEditing } from './TextEditBox.tsx'
import { unitShort } from './unitWords.ts'
import type { PenControls } from '../hooks/usePen.ts'
import { live, msg, t } from '../i18n/i18n.ts'

// A box with handles being edited on the canvas: around the selected part of a layer, or the crop frame.
export interface BoxEditing {
  kind: 'transform' | 'crop'
  value: TransformBox
  // Corners keep the shape; Shift does the opposite.
  keepProportions: boolean
  // Whether the edge handles show (a fixed-shape crop only has corners).
  edges: boolean
  onChange: (box: TransformBox) => void
  // Called with the final box when a handle is let go.
  onRelease?: (box: TransformBox) => void
}

// Arranging whole objects with the Arrange tool.
export interface ArrangeControls {
  keepProportions: boolean
  // Several things picked together (two or more), or null.
  picked: string[] | null
  // Picks one thing (just it, even inside a group), or the page with ''.
  onPick: (layerId: string) => void
  // Picks several things (none picks the page).
  onPickMany: (ids: string[]) => void
  // Shift+click: adds a thing (with its group) to what's picked, or takes it away.
  onToggle: (layerId: string) => void
  onPlace: (layerId: string, box: TransformBox, label: string) => void
  // Several things moved, resized or turned together, from one frame around them to another.
  onPlaceMany: (ids: string[], from: TransformBox, to: TransformBox, label: string) => void
}

// The Text tool: a click starts text where the first line begins, a drag makes a paragraph box,
// and clicking existing text puts the cursor there.
export interface TextTool {
  onNew: (point: Point, area: { x: number; y: number; width: number; height: number } | null) => void
  onEdit: (layerId: string, caret: number) => void
  // Typing in the cell of a table under a design point.
  onEditTable: (layerId: string, point: Point) => void
}

// Drawing new shapes with the Shapes tool: `draft` dresses a box in the current shape settings.
export interface ShapeDrawing {
  draft: (box: TransformBox) => ShapeLayer
  onDraw: (box: TransformBox) => void
  // A click on a shape or text that's already there picks it instead of dropping a new shape.
  onPick: (layerId: string) => void
}

export interface CanvasViewProps {
  doc: EditorDocument
  revision: number
  viewport: Viewport
  onViewportChange: Dispatch<SetStateAction<Viewport>>
  onCursorChange: (point: Point | null) => void
  width: number
  height: number
  tool: ToolId
  spaceHeld: boolean
  altHeld: boolean
  // Settings of the current painting tool (brush or eraser).
  brush: BrushSettings
  color: string
  selectionShape: SelectionShape
  selectionMode: SelectionMode
  onStroke: (layerId: string, result: StrokeResult, label: string, grown?: PixelLayer) => void
  // With Fix spots: the area brushed over on a picture, to be filled in from around it.
  onHeal: (layerId: string, marks: { canvas: HTMLCanvasElement; x: number; y: number }) => void
  // Makes a new drawing for a brush stroke when what's picked can't be painted on.
  onNewDrawing: () => PixelLayer | null
  // A stroke that ended without painting anything.
  onStrokeCancelled: () => void
  onStrokeActiveChange: (active: boolean) => void
  onPickColor: (hex: string) => void
  onMove: (session: MoveSession, dx: number, dy: number) => void
  // When on, moving the selected part of a picture fills the gap it leaves from what's around it.
  fillGap: boolean
  onSelect: (selection: Selection | null, label: string) => void
  // With the magic selection: a click on a thing, or a box dragged around it, for AI to find.
  onMagicSelect: (target: { point: Point } | { box: Rect }, mode: SelectionMode) => void
  // Copy paint: where it copies from.
  clone: CloneControls | null
  // With "Same color": a click picks everything of a similar color.
  onColorSelect: (point: Point, mode: SelectionMode) => void
  // A selection being tried out (a softer or bigger edge), shown in place of the real one with the
  // parts left out dimmed, so you see how soft the edge is before keeping it.
  selectionPreview: Selection | null
  onBlocked: (message: string) => void
  // Shown in place of a layer while it's being resized or rotated.
  override: LayerOverride | null
  box: BoxEditing | null
  onFill: (point: Point) => void
  // With the Adjust tool, pressing and holding on the design shows how it was before.
  onCompareChange: (comparing: boolean) => void
  arrange: ArrangeControls | null
  shapes: ShapeDrawing | null
  // The Pen: drawing paths point by point, and changing the points of a picked pen shape.
  pen: PenControls | null
  // While "Move photo" is on, dragging on the selected shape slides the photo inside it.
  photoMove: { onMove: (layerId: string, x: number, y: number) => void } | null
  textTool: TextTool | null
  // Text being typed right now.
  textEditing: TextEditing | null
  // Double-clicking text with Arrange starts typing in it.
  onEditText: (layerId: string, caret: number) => void
  onEditTable: (layerId: string, point: Point) => void
  // Double-clicking a pen shape with Arrange shows its points, to reshape it.
  onEditShape: (layerId: string) => void
}

export interface CloneControls {
  // The picture and the spot on it that's copied, or null until one is clicked.
  source: { layerId: string; point: Point } | null
  // How far the copied spot is from where you paint, kept from stroke to stroke while `aligned`.
  offset: Point | null
  aligned: boolean
  onSource: (layerId: string, point: Point) => void
  onOffset: (offset: Point) => void
}

interface PanDrag {
  pointerId: number
  lastX: number
  lastY: number
}

interface MoveDrag {
  session: MoveSession
  pointerId: number
  start: Point
  dx: number
  dy: number
}

type SelectDrag =
  | {
      kind: 'shape'
      pointerId: number
      mode: SelectionMode
      shape: SelectionShape
      start: Point
      current: Point
      constrain: boolean
      points: Point[]
      startClient: Point
      moved: boolean
    }
  | { kind: 'outline'; pointerId: number; start: Point; dx: number; dy: number }

interface BoxDrag {
  pointerId: number
  handle: Handle
  start: Point
  startBox: TransformBox
  startClient: Point
  moved: boolean
  // The box as last dragged.
  box: TransformBox
}

// Dragging a whole object with the Arrange tool, or pressing where only a locked layer is.
// What a moved object can line up with: its own outline when the drag started, and everything else.
interface SnapTargets {
  moving: Rect
  others: Rect[]
  // Pictures move by whole pixels, so they stay sharp.
  whole: boolean
}

// What a handle drag changes: one thing's box, or the frame around several things.
interface BoxDragState {
  pointerId: number
  handle: Handle
  start: Point
  startBox: TransformBox
  box: TransformBox
  startClient: Point
  moved: boolean
  snap: SnapTargets | null
  lined: SnapResult | null
}

// Dragging what's picked with the Arrange tool, or a box on empty paper that picks what it touches.
type ArrangeDrag =
  | ({ kind: 'object'; layer: Layer } & BoxDragState)
  // `clicked` is the thing pressed on, which a click without dragging picks on its own.
  | ({ kind: 'frame'; ids: string[]; layers: Layer[]; clicked: Layer | null } & BoxDragState)
  // With Shift (`adding`), the box adds what it touches to what's already picked.
  | { kind: 'marquee'; pointerId: number; start: Point; current: Point; startClient: Point; moved: boolean; locked: Layer | null; adding: boolean }

// Sliding a photo inside its shape.
interface PhotoDrag {
  pointerId: number
  layer: ShapeLayer
  start: Point
  x: number
  y: number
  moved: boolean
}

interface TextDrag {
  pointerId: number
  start: Point
  current: Point
  startClient: Point
  moved: boolean
}

interface ShapeDrag {
  pointerId: number
  start: Point
  current: Point
  constrain: boolean
  moved: boolean
  startClient: Point
  // What the shape being drawn lines up with, and the things it can line up with.
  others: Rect[]
  lined: SnapResult | null
}

const HANDLE_CURSORS: Record<Handle, string> = {
  move: 'move',
  rotate: 'grab',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

// Mouse wheels jump ~100px per notch while trackpad pinches send small steps;
// capping the step keeps both feeling about the same.
const WHEEL_ZOOM_SPEED = 0.01
const WHEEL_ZOOM_MAX_STEP = 25
// Below this on-screen radius the brush outline is too small to see, so a crosshair shows instead.
const MIN_OUTLINE_RADIUS = 3
// What Fix spots paints while marking what to fill in.
const HEAL_MARK_COLOR = '#ff2d55'
const PICKER_RING_RADIUS = 30
const PICKER_RING_WIDTH = 12
// A press that moves less than this many screen pixels is a click, not a drag. Fingers and pens
// wobble more than a mouse, so a tap never moves anything by accident.
const CLICK_DISTANCE = 4

function clickSlop(event: { pointerType: string }): number {
  return event.pointerType === 'touch' ? 10 : event.pointerType === 'pen' ? 6 : CLICK_DISTANCE
}

function penInput(event: PointerEvent<HTMLCanvasElement>) {
  return { shiftKey: event.shiftKey, altKey: event.altKey, slop: clickSlop(event) }
}

// How close (in screen pixels) an edge or middle has to come to another to click into line.
const SNAP_DISTANCE = 6
const GUIDE_COLOR = '#e8457a'
// Margins and columns: a soft violet, quieter than the lines that show what lined up.
const LAYOUT_COLOR = 'rgba(124, 92, 230, 0.55)'
const ANTS_DASH = 4
const ANTS_INTERVAL_MS = 90

const SHAPE_LABELS: Record<SelectionShape, string> = live({ rectangle: msg('Select rectangle'), ellipse: msg('Select oval'), freehand: msg('Select freehand area'), magic: msg('Select thing'), color: msg('Select same color') })

function pressureOf(event: globalThis.PointerEvent): number {
  // Only pens report real pressure; a mouse or finger always paints at full size.
  return event.pointerType === 'pen' ? (event.pressure > 0 ? event.pressure : 0.5) : 1
}

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const w = Math.max(1, Math.round(width * dpr))
  const h = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
}

// Top half shows the color under the pointer, bottom half the color you have now.
function drawPickerRing(ctx: CanvasRenderingContext2D, x: number, y: number, sampled: string | null, current: string) {
  ctx.lineWidth = PICKER_RING_WIDTH
  ctx.strokeStyle = sampled ?? 'rgba(255, 255, 255, 0.7)'
  ctx.beginPath()
  ctx.arc(x, y, PICKER_RING_RADIUS, Math.PI, 0)
  ctx.stroke()
  ctx.strokeStyle = current
  ctx.beginPath()
  ctx.arc(x, y, PICKER_RING_RADIUS, 0, Math.PI)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(16, 24, 40, 0.35)'
  for (const r of [PICKER_RING_RADIUS - PICKER_RING_WIDTH / 2, PICKER_RING_RADIUS + PICKER_RING_WIDTH / 2]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// A resized or turned picture as plain pixels, the way Copy paint will copy it. Kept per layer, since
// the preview is drawn again with every move of the pointer.
const settledPictures = new WeakMap<PixelLayer, PixelLayer>()
function settledForPreview(layer: PixelLayer): PixelLayer {
  if (!layer.box) return layer
  let settled = settledPictures.get(layer)
  if (!settled) settledPictures.set(layer, (settled = settleLayer(layer)))
  return settled
}

// The spot Copy paint copies from: a small cross in a ring, light and dark so it shows on any photo.
function drawCopyCross(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const arm = 9
  for (const [width, color] of [
    [3.5, 'rgba(255, 255, 255, 0.9)'],
    [1.5, 'rgba(16, 24, 40, 0.9)'],
  ] as const) {
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(x - arm, y)
    ctx.lineTo(x + arm, y)
    ctx.moveTo(x, y - arm)
    ctx.lineTo(x, y + arm)
    ctx.moveTo(x + 5, y)
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawBrushOutline(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1.25
  ctx.strokeStyle = 'rgba(16, 24, 40, 0.85)'
  ctx.stroke()
  // A tiny dot marks the exact center of big brushes.
  if (radius > 12) {
    ctx.fillStyle = 'rgba(16, 24, 40, 0.85)'
    ctx.beginPath()
    ctx.arc(x, y, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Traces loops of design points as one path in screen space.
function tracePath(ctx: CanvasRenderingContext2D, loops: Point[][], viewport: Viewport, dx = 0, dy = 0) {
  ctx.beginPath()
  for (const loop of loops) {
    loop.forEach((p, i) => {
      const x = (p.x + dx) * viewport.zoom + viewport.panX
      const y = (p.y + dy) * viewport.zoom + viewport.panY
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
}

// The classic "marching ants": a black dashed line over a white one, so it shows on any color.
// A thin outline around what the pointer is over, showing what a click would pick.
function drawHoverOutline(ctx: CanvasRenderingContext2D, box: TransformBox, viewport: Viewport) {
  const corners = boxCorners(box).map((p) => toScreen(p, viewport))
  ctx.beginPath()
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(51, 102, 255, 0.55)'
  ctx.stroke()
}

// The box a shape drag makes. Lines go from where you pressed to the pointer; other shapes fill
// the rectangle between them. Shift makes squares and circles, or keeps lines at 45° steps.
function shapeDragBox(drag: ShapeDrag, line: boolean, thickness: number): TransformBox {
  const { start, current } = drag
  if (line) {
    let angle = Math.atan2(current.y - start.y, current.x - start.x)
    if (drag.constrain) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    const length = Math.max(1, Math.hypot(current.x - start.x, current.y - start.y))
    return { cx: start.x + (Math.cos(angle) * length) / 2, cy: start.y + (Math.sin(angle) * length) / 2, width: length, height: Math.max(1, thickness), rotation: angle }
  }
  const rect = drag.constrain ? squareFromCorners(start, current) : rectFromCorners(start, current)
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, width: Math.max(1, rect.width), height: Math.max(1, rect.height), rotation: 0 }
}

function drawAnts(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.setLineDash([ANTS_DASH, ANTS_DASH])
  ctx.lineDashOffset = -offset
  ctx.strokeStyle = '#1b2130'
  ctx.stroke()
  ctx.setLineDash([])
}

function toScreen(p: Point, viewport: Viewport): Point {
  return { x: p.x * viewport.zoom + viewport.panX, y: p.y * viewport.zoom + viewport.panY }
}

// The Arrange handles or the crop frame.
function drawBox(ctx: CanvasRenderingContext2D, box: Pick<BoxEditing, 'kind' | 'value'> & { edges: EdgeHandles }, viewport: Viewport, width: number, height: number) {
  const corners = boxCorners(box.value).map((p) => toScreen(p, viewport))
  const outline = () => {
    ctx.beginPath()
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
  }

  if (box.kind === 'crop') {
    // Darken what will be cut away.
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    ctx.fillStyle = 'rgba(16, 24, 40, 0.5)'
    ctx.fill('evenodd')
    // Lines at the thirds help line things up nicely.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 1
    for (const t of [1 / 3, 2 / 3]) {
      const a = toScreen(boxPoint(box.value, t * 2 - 1, -1), viewport)
      const b = toScreen(boxPoint(box.value, t * 2 - 1, 1), viewport)
      const c = toScreen(boxPoint(box.value, -1, t * 2 - 1), viewport)
      const d = toScreen(boxPoint(box.value, 1, t * 2 - 1), viewport)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
    }
    outline()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
  } else {
    outline()
    ctx.strokeStyle = '#3366ff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // The stem and round knob for turning.
    const top = toScreen(boxPoint(box.value, 0, -1), viewport)
    const knob = toScreen(rotationKnob(box.value, viewport.zoom), viewport)
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(knob.x, knob.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()
  }

  for (const [sx, sy] of Object.values(HANDLE_SIGNS)) {
    if (!box.edges && (sx === 0 || sy === 0)) continue
    if (box.edges === 'sides' && sx === 0) continue
    const p = toScreen(boxPoint(box.value, sx, sy), viewport)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#3366ff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(p.x - 4.5, p.y - 4.5, 9, 9)
    ctx.fill()
    ctx.stroke()
  }
}

// Text only has handles on its left and right sides: its height always fits its lines.
function edgesOf(layer: Layer | undefined): EdgeHandles {
  // A box text runs on through is sized freely; other text fits its words, so only its width changes.
  // A table's rows fit their words too: its sides make columns wider, its corners make it all bigger.
  return (layer?.kind === 'text' && !layer.flow) || layer?.kind === 'table' ? 'sides' : true
}

// Boxes text runs on through: a faint dashed outline, so even an empty one can be seen and found,
// and its number in the story at its top corner.
function drawFlowBoxes(ctx: CanvasRenderingContext2D, doc: EditorDocument, viewport: Viewport) {
  const boxes = doc.layers.filter((l) => l.kind === 'text' && l.flow && l.visible)
  if (!boxes.length) return
  ctx.save()
  ctx.lineWidth = 1
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const layer of boxes) {
    if (layer.kind !== 'text' || !layer.flow) continue
    const corners = boxCorners(layer.box).map((point) => toScreen(point, viewport))
    ctx.strokeStyle = LAYOUT_COLOR
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    corners.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)))
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    const corner = layer.style.direction === 'rtl' || (layer.style.direction === 'auto' && hasRtlLetters(layer.flow.full)) ? corners[1] : corners[0]
    // Just outside the corner, clear of the handle there.
    const center = toScreen({ x: layer.box.cx, y: layer.box.cy }, viewport)
    const away = Math.hypot(corner.x - center.x, corner.y - center.y) || 1
    const top = { x: corner.x + ((corner.x - center.x) / away) * 14, y: corner.y + ((corner.y - center.y) / away) * 14 }
    ctx.fillStyle = LAYOUT_COLOR
    ctx.beginPath()
    ctx.arc(top.x, top.y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(layer.flow.index + 1), top.x, top.y + 0.5)
  }
  ctx.restore()
}

// Margins and columns: faint dashed lines, under everything else on the overlay.
function drawLayoutLines(ctx: CanvasRenderingContext2D, doc: EditorDocument, viewport: Viewport) {
  const frames = layoutFrames(doc)
  if (!frames) return
  ctx.save()
  ctx.strokeStyle = LAYOUT_COLOR
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  for (const rect of [frames.inside, ...frames.columns]) {
    const a = toScreen({ x: rect.x, y: rect.y }, viewport)
    const b = toScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, viewport)
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x) - Math.round(a.x), Math.round(b.y) - Math.round(a.y))
  }
  ctx.restore()
}

// The lines that show what a moved object lined up with, and the even gaps it made.
function drawGuides(ctx: CanvasRenderingContext2D, lined: SnapResult, viewport: Viewport, ppi: number) {
  ctx.save()
  ctx.strokeStyle = GUIDE_COLOR
  ctx.fillStyle = GUIDE_COLOR
  ctx.lineWidth = 1
  for (const guide of lined.guides) {
    const a = toScreen(guide.axis === 'x' ? { x: guide.at, y: guide.from } : { x: guide.from, y: guide.at }, viewport)
    const b = toScreen(guide.axis === 'x' ? { x: guide.at, y: guide.to } : { x: guide.to, y: guide.at }, viewport)
    ctx.beginPath()
    ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5)
    ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5)
    ctx.stroke()
  }
  ctx.font = '600 10px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const spacing of lined.spacing) {
    for (const gap of spacing.gaps) {
      const at = (n: number) => toScreen(spacing.axis === 'x' ? { x: n, y: spacing.across } : { x: spacing.across, y: n }, viewport)
      const a = at(gap.start)
      const b = at(gap.end)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      // Little end marks, across the gap.
      const [tx, ty] = spacing.axis === 'x' ? [0, 4] : [4, 0]
      ctx.moveTo(a.x - tx, a.y - ty)
      ctx.lineTo(a.x + tx, a.y + ty)
      ctx.moveTo(b.x - tx, b.y - ty)
      ctx.lineTo(b.x + tx, b.y + ty)
      ctx.stroke()
      // The size of the gap, in a small label, counted in the unit sizes show in.
      const unit = getUnit()
      const label = `${formatInUnit(gap.end - gap.start, unit, ppi)}${unit === 'px' ? '' : ` ${unitShort(unit)}`}`
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const w = ctx.measureText(label).width + 8
      ctx.beginPath()
      ctx.roundRect(mx - w / 2, my - 7, w, 14, 4)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, mx, my + 0.5)
      ctx.fillStyle = GUIDE_COLOR
    }
  }
  ctx.restore()
}

// The rectangle a Text tool drag makes, in design coordinates.
function textDragRect(drag: TextDrag) {
  return rectFromCorners(drag.start, drag.current)
}

// A dashed outline around a box, for text being typed and the paragraph box being dragged out.
function drawDashedBox(ctx: CanvasRenderingContext2D, box: TransformBox, viewport: Viewport) {
  const corners = boxCorners(box).map((p) => toScreen(p, viewport))
  ctx.beginPath()
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = '#3366ff'
  ctx.stroke()
  ctx.setLineDash([])
}

// The design dimmed everywhere a selection leaves out, fading along a soft edge. Kept per selection,
// since the dashed outline is drawn again many times a second.
const dimmed = new WeakMap<Selection, HTMLCanvasElement>()
function dimmedOutside(selection: Selection, width: number, height: number): HTMLCanvasElement {
  const known = dimmed.get(selection)
  if (known && known.width === width && known.height === height) return known
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(24, 28, 38, 0.5)'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(selectionInfo(selection, width, height).mask, 0, 0)
  dimmed.set(selection, canvas)
  return canvas
}

// Rectangles, ovals and freehand areas are drawn by dragging, so dragging inside the selection
// moves it; the magic and same-color selections are made by clicking things instead.
function drawsShape(shape: SelectionShape): boolean {
  return shape !== 'magic' && shape !== 'color'
}

// The shape being drawn with the Select tool, as a polygon in design coordinates.
function dragPolygon(drag: Extract<SelectDrag, { kind: 'shape' }>): Point[] {
  if (drag.shape === 'freehand') return drag.points
  const corner = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) })
  const box = drag.constrain ? squareFromCorners(corner(drag.start), corner(drag.current)) : rectFromCorners(corner(drag.start), corner(drag.current))
  if (box.width === 0 || box.height === 0) return []
  return drag.shape === 'ellipse' ? ellipsePolygon(box) : rectPolygon(box)
}

export function CanvasView(props: CanvasViewProps) {
  const { doc, revision, viewport, width, height, tool, spaceHeld, altHeld, brush, color, selectionMode } = props
  const sceneRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  const strokeRef = useRef<{ session: StrokeSession; pointerId: number; label: string; grown?: PixelLayer; heal?: string; copyOffset?: Point } | null>(null)
  const panRef = useRef<PanDrag | null>(null)
  const pickRef = useRef<number | null>(null)
  const moveRef = useRef<MoveDrag | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const boxRef = useRef<BoxDrag | null>(null)
  // The pointer pressed on the design to compare with how it was, while adjusting.
  const compareRef = useRef<number | null>(null)
  const arrangeRef = useRef<ArrangeDrag | null>(null)
  const shapeRef = useRef<ShapeDrag | null>(null)
  const photoRef = useRef<PhotoDrag | null>(null)
  const textRef = useRef<TextDrag | null>(null)
  const penRef = useRef<number | null>(null)
  const [penCursor, setPenCursor] = useState('crosshair')
  // The object a click would pick right now, outlined while the pointer is over it.
  const hoverLayerRef = useRef<Layer | null>(null)
  const hoverRef = useRef<Point | null>(null)
  const lastEndRef = useRef<{ docId: string; point: InputPoint } | null>(null)
  const antsRef = useRef(0)
  const sceneFrameRef = useRef(0)
  const overlayFrameRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [picking, setPicking] = useState(false)
  const [overSelection, setOverSelection] = useState(false)
  const [boxHover, setBoxHover] = useState<Handle | null>(null)
  const [overObject, setOverObject] = useState(false)

  // Something is happening with the pointer, so a second press is ignored.
  const busy = () =>
    !!(
      strokeRef.current ||
      panRef.current ||
      pickRef.current !== null ||
      moveRef.current ||
      selectRef.current ||
      boxRef.current ||
      compareRef.current !== null ||
      arrangeRef.current ||
      shapeRef.current ||
      photoRef.current ||
      textRef.current ||
      penRef.current !== null
    )

  // The box the Arrange handles show around the selected object, if it can be arranged.
  function activeBox(p: CanvasViewProps): TransformBox | null {
    const drag = arrangeRef.current
    if (drag?.kind === 'object' || drag?.kind === 'frame') return drag.box
    const many = pickedLayers(p)
    if (many) return frameOf(many)
    const layer = activeLayer(p.doc)
    if (!p.arrange || !layer || !layer.visible || layer.locked || p.textEditing?.layer.id === layer.id) return null
    return arrangeBox(layer)
  }

  // The things picked together, when there are several.
  function pickedLayers(p: CanvasViewProps): Layer[] | null {
    const ids = p.arrange?.picked
    if (!ids || ids.length < 2) return null
    const layers = p.doc.layers.filter((l) => ids.includes(l.id) && l.visible)
    return layers.length > 0 ? layers : null
  }

  // Which side handles the picked thing has: none for several things (they grow evenly).
  function activeEdges(p: CanvasViewProps): EdgeHandles {
    return pickedLayers(p) ? false : edgesOf(activeLayer(p.doc))
  }

  function sceneOverride(): LayerOverride | null {
    const stroke = strokeRef.current?.session
    if (stroke) return { layerId: stroke.layerId, parts: [{ canvas: stroke.preview, x: stroke.x, y: stroke.y }] }
    const move = moveRef.current
    if (move) return move.session.preview(move.dx, move.dy)
    const arrange = arrangeRef.current
    if (arrange?.kind === 'object' && arrange.moved) return { layerId: arrange.layer.id, layer: previewInBox(arrange.layer, arrange.box) }
    if (arrange?.kind === 'frame' && arrange.moved) {
      return { layers: new Map(arrange.layers.map((layer) => [layer.id, previewInFrame(layer, arrange.startBox, arrange.box)])) }
    }
    const pen = propsRef.current.pen?.override()
    if (pen) return pen
    const photo = photoRef.current
    if (photo?.moved && photo.layer.fill.kind === 'photo') {
      return { layerId: photo.layer.id, layer: { ...photo.layer, fill: { ...photo.layer.fill, x: photo.x, y: photo.y } } }
    }
    return propsRef.current.override
  }

  function drawScene() {
    sceneFrameRef.current = 0
    const canvas = sceneRef.current
    const p = propsRef.current
    if (!canvas || p.width <= 0 || p.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    sizeCanvas(canvas, p.width, p.height, dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) renderScene(ctx, { width: p.width, height: p.height, dpr }, p.doc, p.viewport, sceneOverride())
  }

  function drawSelection(ctx: CanvasRenderingContext2D, p: CanvasViewProps) {
    const selection = p.selectionPreview ?? p.doc.selection
    const drag = selectRef.current
    if (p.selectionPreview) {
      const dpr = window.devicePixelRatio || 1
      ctx.save()
      ctx.setTransform(dpr * p.viewport.zoom, 0, 0, dpr * p.viewport.zoom, dpr * p.viewport.panX, dpr * p.viewport.panY)
      ctx.drawImage(dimmedOutside(p.selectionPreview, p.doc.width, p.doc.height), 0, 0)
      ctx.restore()
    }
    // While its handles are dragged, the box shows the selected part; the outline catches up after.
    if (selection && !(p.box?.kind === 'transform' && boxRef.current?.moved)) {
      let dx = 0
      let dy = 0
      if (moveRef.current?.session.movesSelection) {
        dx = moveRef.current.dx
        dy = moveRef.current.dy
      } else if (drag?.kind === 'outline') {
        dx = drag.dx
        dy = drag.dy
      }
      const { outline } = selectionInfo(selection, p.doc.width, p.doc.height)
      if (outline.length > 0) {
        tracePath(ctx, outline, p.viewport, dx, dy)
        drawAnts(ctx, antsRef.current)
      }
    }
    // The shape being drawn right now, in the "you can click this" blue.
    if (drag?.kind === 'shape' && drag.moved) {
      const polygon = dragPolygon(drag)
      if (polygon.length > 1) {
        tracePath(ctx, [polygon], p.viewport)
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = '#3366ff'
        ctx.stroke()
        ctx.setLineDash([])
        if (drag.mode === 'subtract') {
          ctx.fillStyle = 'rgba(196, 50, 10, 0.12)'
          ctx.fill()
        } else {
          ctx.fillStyle = 'rgba(51, 102, 255, 0.08)'
          ctx.fill()
        }
      }
    }
  }

  function drawOverlay() {
    overlayFrameRef.current = 0
    const canvas = overlayRef.current
    const p = propsRef.current
    if (!canvas || p.width <= 0 || p.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    sizeCanvas(canvas, p.width, p.height, dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawLayoutLines(ctx, p.doc, p.viewport)
    drawFlowBoxes(ctx, p.doc, p.viewport)
    drawSelection(ctx, p)
    if (p.box) drawBox(ctx, p.box, p.viewport, p.width, p.height)
    if (p.arrange && !p.doc.selection) {
      const hovered = hoverLayerRef.current
      const many = pickedLayers(p)
      if (hovered && hovered.id !== p.doc.activeLayerId && !many?.includes(hovered) && !arrangeRef.current) {
        // Something kept together shows its whole group.
        const box = frameOf(p.doc.layers.filter((l) => pickedWith(p.doc, hovered.id).includes(l.id)))
        if (box) drawHoverOutline(ctx, box, p.viewport)
      }
      // Each of several picked things gets a thin outline, inside one frame with handles.
      if (many && !arrangeRef.current) {
        for (const layer of many) {
          const box = arrangeBox(layer)
          if (box) drawHoverOutline(ctx, box, p.viewport)
        }
      }
      const box = activeBox(p)
      if (box) drawBox(ctx, { kind: 'transform', value: box, edges: activeEdges(p) }, p.viewport, p.width, p.height)
    }
    const arranging = arrangeRef.current
    if ((arranging?.kind === 'object' || arranging?.kind === 'frame') && arranging.moved && arranging.lined) drawGuides(ctx, arranging.lined, p.viewport, documentPpi(p.doc))
    if (arranging?.kind === 'marquee' && arranging.moved) {
      const rect = rectFromCorners(arranging.start, arranging.current)
      const a = toScreen({ x: rect.x, y: rect.y }, p.viewport)
      ctx.fillStyle = 'rgba(51, 102, 255, 0.08)'
      ctx.fillRect(a.x, a.y, rect.width * p.viewport.zoom, rect.height * p.viewport.zoom)
      drawDashedBox(ctx, { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }, p.viewport)
    }
    if (p.textEditing) drawDashedBox(ctx, p.textEditing.layer.box, p.viewport)
    const textDrag = textRef.current
    if (textDrag?.moved) {
      const rect = textDragRect(textDrag)
      drawDashedBox(ctx, { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }, p.viewport)
    }
    const shape = shapeRef.current
    if (p.shapes && shape?.moved) {
      const draft = p.shapes.draft({ cx: 0, cy: 0, width: 1, height: 1, rotation: 0 })
      const box = shapeDragBox(shape, draft.geometry.type === 'line', draft.outline?.width ?? 1)
      ctx.save()
      ctx.setTransform(dpr * p.viewport.zoom, 0, 0, dpr * p.viewport.zoom, dpr * p.viewport.panX, dpr * p.viewport.panY)
      drawShape(ctx, p.shapes.draft(box))
      ctx.restore()
      if (shape.lined && draft.geometry.type !== 'line') drawGuides(ctx, shape.lined, p.viewport, documentPpi(p.doc))
    }

    if (p.pen && p.tool === 'pen') p.pen.draw(ctx, p.viewport)

    const hover = hoverRef.current
    if (!hover || panRef.current || moveRef.current || p.spaceHeld) return
    if (pickRef.current !== null || p.tool === 'picker' || (p.tool === 'brush' && p.altHeld)) {
      const point = screenToDocument(p.viewport, hover.x, hover.y)
      drawPickerRing(ctx, hover.x, hover.y, sampleColor(p.doc, point.x, point.y), p.color)
    } else if (p.tool === 'brush' || p.tool === 'eraser' || p.tool === 'heal') {
      const radius = (p.brush.size / 2) * p.viewport.zoom
      if (radius >= MIN_OUTLINE_RADIUS) drawBrushOutline(ctx, hover.x, hover.y, radius)
    } else if (p.tool === 'clone' && p.clone) {
      drawCopyGuide(ctx, p, p.clone, hover)
    }
  }

  // Copy paint shows the copy inside the brush before you paint, and a cross on the spot it copies from.
  function drawCopyGuide(ctx: CanvasRenderingContext2D, p: CanvasViewProps, clone: CloneControls, hover: Point) {
    const source = clone.source
    const layer = source && p.doc.layers.find((l) => l.id === source.layerId)
    // With nothing to copy from yet (or {alt} held), a click picks the spot: the cursor is a cross.
    if (!source || layer?.kind !== 'raster' || p.altHeld) return
    const at = screenToDocument(p.viewport, hover.x, hover.y)
    const stroke = strokeRef.current
    const offset = stroke?.copyOffset ?? (clone.aligned ? clone.offset : null) ?? { x: source.point.x - at.x, y: source.point.y - at.y }
    const radius = Math.max(MIN_OUTLINE_RADIUS, (p.brush.size / 2) * p.viewport.zoom)
    if (!stroke && layer.visible) {
      const picture = settledForPreview(layer)
      const dpr = window.devicePixelRatio || 1
      ctx.save()
      ctx.beginPath()
      ctx.arc(hover.x, hover.y, radius, 0, Math.PI * 2)
      ctx.clip()
      ctx.globalAlpha = 0.7
      ctx.setTransform(dpr * p.viewport.zoom, 0, 0, dpr * p.viewport.zoom, dpr * p.viewport.panX, dpr * p.viewport.panY)
      ctx.drawImage(picture.canvas, picture.x - Math.round(offset.x), picture.y - Math.round(offset.y))
      ctx.restore()
    }
    drawBrushOutline(ctx, hover.x, hover.y, radius)
    const from = { x: hover.x + offset.x * p.viewport.zoom, y: hover.y + offset.y * p.viewport.zoom }
    drawCopyCross(ctx, from.x, from.y)
  }

  function requestScene() {
    if (!sceneFrameRef.current) sceneFrameRef.current = requestAnimationFrame(drawScene)
  }

  function requestOverlay() {
    if (!overlayFrameRef.current) overlayFrameRef.current = requestAnimationFrame(drawOverlay)
  }

  // Handlers and animation frames read the latest props through this ref.
  useLayoutEffect(() => {
    propsRef.current = props
  })

  // Text is drawn again once its font arrives.
  const fontsVersion = useFontsVersion()
  useLayoutEffect(() => {
    drawScene()
  }, [doc, revision, viewport, width, height, props.override, fontsVersion])

  useLayoutEffect(() => {
    drawOverlay()
  }, [doc, viewport, width, height, tool, spaceHeld, altHeld, brush, color, picking, props.box, props.textEditing, props.pen?.version, props.selectionPreview, props.clone?.source, props.clone?.offset])

  // A gap being filled while a part is dragged shows as soon as it's ready.
  useEffect(() => onGapFilled(() => moveRef.current && requestScene()), [])

  // The dashed outline keeps moving while something is selected, so it's easy to spot.
  useEffect(() => {
    if (!doc.selection) return
    const timer = window.setInterval(() => {
      antsRef.current = (antsRef.current + 1) % (ANTS_DASH * 2)
      requestOverlay()
    }, ANTS_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [doc.selection])

  useEffect(
    () => () => {
      cancelAnimationFrame(sceneFrameRef.current)
      cancelAnimationFrame(overlayFrameRef.current)
    },
    [],
  )

  // React's onWheel is passive, so it can't stop the browser from zooming the whole page.
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      const change = propsRef.current.onViewportChange
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const step = Math.max(-WHEEL_ZOOM_MAX_STEP, Math.min(WHEEL_ZOOM_MAX_STEP, dy))
        const factor = Math.exp(-step * WHEEL_ZOOM_SPEED)
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        change((v) => zoomAtPoint(v, v.zoom * factor, x, y))
      } else if (event.shiftKey && dx === 0) {
        change((v) => panBy(v, -dy, 0))
      } else {
        change((v) => panBy(v, -dx, -dy))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  function localPoint(clientX: number, clientY: number): Point {
    const rect = overlayRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function documentPoint(clientX: number, clientY: number): Point {
    const local = localPoint(clientX, clientY)
    return screenToDocument(propsRef.current.viewport, local.x, local.y)
  }

  // Painting and moving need a layer you can see; otherwise nothing would seem to happen.
  function usableLayer(): Layer | null {
    const layer = activeLayer(doc)
    if (!layer) return null
    if (!layer.visible) {
      props.onBlocked(t('“{name}” is hidden. Click its eye in the Layers panel to show it, then move it again.', { name: layer.name }))
      return null
    }
    return layer
  }

  // Starts sliding the photo inside the selected shape, if the press is on it.
  function startPhotoMove(event: PointerEvent<HTMLCanvasElement>): boolean {
    const layer = activeLayer(doc)
    const point = documentPoint(event.clientX, event.clientY)
    if (layer?.kind !== 'shape' || layer.fill.kind !== 'photo' || !hitsLayer(layer, point)) return false
    event.currentTarget.setPointerCapture(event.pointerId)
    photoRef.current = { pointerId: event.pointerId, layer, start: point, x: layer.fill.x, y: layer.fill.y, moved: false }
    setDragging(true)
    return true
  }

  function finishPhotoMove() {
    const drag = photoRef.current
    photoRef.current = null
    setDragging(false)
    if (drag?.moved) propsRef.current.photoMove?.onMove(drag.layer.id, drag.x, drag.y)
    drawScene()
  }

  // Pressing with the Arrange tool: on a handle of the selected object, on any object (which picks
  // it), or on nothing.
  function startArrange(event: PointerEvent<HTMLCanvasElement>, arrange: ArrangeControls) {
    if (props.photoMove && startPhotoMove(event)) return
    const point = documentPoint(event.clientX, event.clientY)
    const startClient = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    // The handles of what's picked: one thing, or the frame around several.
    const many = pickedLayers(props)
    const active = activeLayer(doc)
    const box = activeBox(props)
    const found = box ? hitHandle(box, point, viewport.zoom, { rotate: true, edges: activeEdges(props) }) : null
    // Shift+click adds or takes away; Shift on a handle still resizes or turns in neat steps.
    const handle = event.shiftKey && found === 'move' ? null : found
    const hit = layerAt(doc, point, 3 / viewport.zoom)
    // Inside the frame around several things, a press on something else picks that instead; a
    // press on one of them or on the paper between them moves them all.
    const elsewhere = handle === 'move' && many && hit && !many.includes(hit)
    if (handle && many && !elsewhere) return startFrameDrag(event, many, handle, point, startClient, handle === 'move' ? hit : null)
    if (handle && active && !many) return startObjectDrag(event, active, handle, point, startClient)
    // Shift+click adds to what's picked, or takes away.
    if (hit && event.shiftKey) {
      arrange.onToggle(hit.id)
      return
    }
    if (hit) {
      // Something kept together is picked and moved as a whole.
      const ids = pickedWith(doc, hit.id)
      if (ids.length > 1) {
        arrange.onPickMany(ids)
        return startFrameDrag(event, doc.layers.filter((l) => ids.includes(l.id)), 'move', point, startClient)
      }
      if (hit.id !== doc.activeLayerId || many) arrange.onPick(hit.id)
      return startObjectDrag(event, hit, 'move', point, startClient)
    }
    // Empty paper (or something locked): dragging a box picks what it touches; a click picks the
    // page, or the locked thing so it can be unlocked.
    const locked = [...doc.layers].reverse().find((l) => l.visible && l.locked && hitsLayer(l, point)) ?? null
    arrangeRef.current = { kind: 'marquee', pointerId: event.pointerId, start: point, current: point, startClient, moved: false, locked, adding: event.shiftKey }
  }

  // The page, and the margins and columns on it, that things line up with.
  function snapPage(): Rect[] {
    const frames = layoutFrames(doc)
    return [{ x: 0, y: 0, width: doc.width, height: doc.height }, ...(frames ? [frames.inside, ...frames.columns] : [])]
  }

  // Where to put the pointer so a pulled handle lands on a line of the page or another thing, or
  // null when nothing is close. A corner that keeps the shape lines up whichever side is closer.
  function snapResize(startBox: TransformBox, box: TransformBox, handle: Handle, keepProportions: boolean, others: Rect[]): Point | null {
    if (handle === 'move' || handle === 'rotate') return null
    const [hx, hy] = HANDLE_SIGNS[handle]
    const corner = boxPoint(box, hx, hy)
    const { dx, dy } = snapLines(hx ? corner.x : null, hy ? corner.y : null, others, snapPage(), SNAP_DISTANCE / viewport.zoom)
    if (dx === null && dy === null) return null
    if (keepProportions && hx && hy) {
      const fixed = boxPoint(startBox, -hx, -hy)
      const useX = dy === null || (dx !== null && Math.abs(dx) <= Math.abs(dy))
      const scale = useX ? (corner.x + dx! - fixed.x) / (hx * startBox.width) : (corner.y + dy! - fixed.y) / (hy * startBox.height)
      return { x: fixed.x + hx * startBox.width * scale, y: fixed.y + hy * startBox.height * scale }
    }
    return { x: corner.x + (dx ?? 0), y: corner.y + (dy ?? 0) }
  }

  // A point moved onto the lines of the page or another thing when it's close to one.
  function snapPoint(point: Point, others: Rect[]): Point {
    const { dx, dy } = snapLines(point.x, point.y, others, snapPage(), SNAP_DISTANCE / viewport.zoom)
    return { x: point.x + (dx ?? 0), y: point.y + (dy ?? 0) }
  }

  // What a moved thing can line up with: the page and every other thing you can see.
  function snapTargets(moving: TransformBox, exclude: string[], whole: boolean): SnapTargets {
    const others = doc.layers
      .filter((l) => !exclude.includes(l.id) && l.visible && l.opacity > 0)
      .map((l) => arrangeBox(l))
      .filter((b): b is TransformBox => b !== null)
      .map((b) => polygonBounds(boxCorners(b))!)
    return { moving: polygonBounds(boxCorners(moving))!, others, whole }
  }

  function startFrameDrag(event: PointerEvent<HTMLCanvasElement>, layers: Layer[], handle: Handle, point: Point, startClient: Point, clicked: Layer | null = null) {
    const frame = frameOf(layers)
    if (!frame) return
    const ids = layers.map((l) => l.id)
    const snap = handle !== 'rotate' ? snapTargets(frame, ids, layers.some((l) => l.kind === 'raster')) : null
    arrangeRef.current = { kind: 'frame', pointerId: event.pointerId, ids, layers, clicked, handle, start: point, startBox: frame, box: frame, startClient, moved: false, snap, lined: null }
    requestOverlay()
  }

  function startObjectDrag(event: PointerEvent<HTMLCanvasElement>, layer: Layer, handle: Handle, point: Point, startClient: Point) {
    const startBox = arrangeBox(layer)
    if (!startBox) return
    const snap = handle !== 'rotate' ? snapTargets(startBox, [layer.id], layer.kind === 'raster') : null
    arrangeRef.current = { kind: 'object', pointerId: event.pointerId, layer, handle, start: point, startBox, box: startBox, startClient, moved: false, snap, lined: null }
    requestOverlay()
  }

  function finishArrange() {
    const drag = arrangeRef.current
    arrangeRef.current = null
    const p = propsRef.current
    if (drag?.kind === 'object' && drag.moved && !isIdentity(drag.box, drag.startBox)) {
      p.arrange?.onPlace(drag.layer.id, drag.box, describeChange(drag.box, drag.startBox))
    }
    if (drag?.kind === 'frame' && drag.moved && !isIdentity(drag.box, drag.startBox)) {
      p.arrange?.onPlaceMany(drag.ids, drag.startBox, drag.box, describeChange(drag.box, drag.startBox))
    }
    // A click (without dragging) on one of several picked things picks just it, or what it's
    // kept together with.
    if (drag?.kind === 'frame' && !drag.moved && drag.clicked && p.arrange) {
      const own = pickedWith(p.doc, drag.clicked.id)
      if (own.length < drag.ids.length) p.arrange.onPickMany(own)
    }
    if (drag?.kind === 'marquee' && p.arrange) {
      if (drag.moved) {
        // Everything you can see and move that the box touches, with whole groups.
        const area = rectFromCorners(drag.start, drag.current)
        const touched = p.doc.layers.filter((l) => {
          if (!l.visible || l.locked || l.opacity <= 0) return false
          const box = arrangeBox(l)
          const bounds = box && polygonBounds(boxCorners(box))
          return !!bounds && bounds.x < area.x + area.width && area.x < bounds.x + bounds.width && bounds.y < area.y + area.height && area.y < bounds.y + bounds.height
        })
        const ids = [...new Set(touched.flatMap((l) => pickedWith(p.doc, l.id)))]
        const already = drag.adding ? (p.arrange.picked ?? (activeLayer(p.doc) ? pickedWith(p.doc, p.doc.activeLayerId) : [])) : []
        if (ids.length === 0 && already.length === 0 && drag.locked) {
          // Dragging something locked keeps it picked, and says why it stays put.
          if (drag.locked.id !== p.doc.activeLayerId) p.arrange.onPick(drag.locked.id)
          p.onBlocked(t("“{name}” is locked, so it can't be moved by accident. Click its lock in the Layers panel to unlock it.", { name: drag.locked.name }))
        } else {
          p.arrange.onPickMany([...new Set([...already, ...ids])])
        }
      } else {
        const picked = drag.locked?.id ?? ''
        if (picked !== p.doc.activeLayerId || p.arrange.picked) p.arrange.onPick(picked)
      }
    }
    setDragging(false)
    drawScene()
    requestOverlay()
  }

  function finishShape() {
    const drag = shapeRef.current
    shapeRef.current = null
    const shapes = propsRef.current.shapes
    if (!drag || !shapes) return
    const draft = shapes.draft({ cx: 0, cy: 0, width: 1, height: 1, rotation: 0 })
    const line = draft.geometry.type === 'line'
    const p = propsRef.current
    let box: TransformBox
    if (drag.moved) {
      box = shapeDragBox(drag, line, draft.outline?.width ?? 1)
    } else {
      const hit = layerAt(p.doc, drag.start, 3 / p.viewport.zoom)
      if (hit && hit.kind !== 'raster') {
        shapes.onPick(hit.id)
        requestOverlay()
        return
      }
      // A click drops a shape of a handy size, centered where you clicked.
      const size = Math.max(8, Math.round(Math.min(p.doc.width, p.doc.height) * 0.25))
      box = { cx: drag.start.x, cy: drag.start.y, width: line ? size * 1.4 : size, height: line ? Math.max(1, draft.outline?.width ?? 1) : size, rotation: 0 }
    }
    shapes.onDraw(box)
    requestOverlay()
  }

  function finishText() {
    const drag = textRef.current
    textRef.current = null
    const p = propsRef.current
    if (!drag || !p.textTool) return
    requestOverlay()
    if (drag.moved) {
      const rect = textDragRect(drag)
      // A box too narrow to hold a letter is taken as a click.
      if (rect.width * p.viewport.zoom >= 12) {
        p.textTool.onNew(drag.start, rect)
        return
      }
    }
    // Clicking text puts the cursor there; clicking anywhere else starts new text.
    const hit = layerAt(p.doc, drag.start, 2 / p.viewport.zoom)
    if (hit?.kind === 'text') p.textTool.onEdit(hit.id, textIndexAt(hit, drag.start))
    else if (hit?.kind === 'table') p.textTool.onEditTable(hit.id, drag.start)
    else p.textTool.onNew(drag.start, null)
  }

  // Fix spots marks what to fill in on the topmost picture under the pointer, locked or not.
  function startHealStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = documentPoint(event.clientX, event.clientY)
    const layer = [...doc.layers].reverse().find((l): l is PixelLayer => l.kind === 'raster' && l.visible && l.opacity > 0 && hitsLayer(l, point))
    if (!layer) {
      props.onBlocked(t('Fix spots works on photos and drawings. Brush over a spot on a picture.'))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = settleLayer(layer)
    const marker = { size: brush.size, softness: 0, opacity: 0.45, flow: 1, smoothing: 0.2, pressure: false, blend: 'normal' as const, tip: 'round' as const }
    const session = new StrokeSession(target, marker, HEAL_MARK_COLOR, 'paint')
    session.begin({ ...point, pressure: 1 })
    strokeRef.current = { session, pointerId: event.pointerId, label: t('Fix spots'), heal: layer.id }
    props.onStrokeActiveChange(true)
    session.flush()
    requestScene()
  }

  // Copy paint: a click (or {alt} + click) picks the spot to copy on the topmost picture there; then
  // painting copies from that picture onto itself.
  function startCopyStroke(event: PointerEvent<HTMLCanvasElement>, clone: CloneControls) {
    const point = documentPoint(event.clientX, event.clientY)
    const source = clone.source
    if (event.altKey || !source) {
      const picture = [...doc.layers].reverse().find((l): l is PixelLayer => l.kind === 'raster' && l.visible && l.opacity > 0 && hitsLayer(l, point))
      if (picture) clone.onSource(picture.id, { x: Math.round(point.x), y: Math.round(point.y) })
      else props.onBlocked(t('Copy paint works on photos and drawings. Click the part of a picture you want to copy.'))
      requestOverlay()
      return
    }
    const layer = doc.layers.find((l) => l.id === source.layerId)
    if (layer?.kind !== 'raster') return
    if (!layer.visible) {
      props.onBlocked(t('“{name}” is hidden. Click its eye in the Layers panel to show it, then paint again.', { name: layer.name }))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const offset = clone.aligned && clone.offset ? clone.offset : { x: source.point.x - Math.round(point.x), y: source.point.y - Math.round(point.y) }
    if (clone.aligned && !clone.offset) clone.onOffset(offset)
    const target = settleLayer(layer)
    const mask = doc.selection ? { canvas: selectionInfo(doc.selection, doc.width, doc.height).mask, x: 0, y: 0 } : null
    const copy = { canvas: target.canvas, dx: Math.round(offset.x), dy: Math.round(offset.y) }
    const session = new StrokeSession(target, brush, '#000000', 'paint', mask, copy)
    session.begin({ ...point, pressure: pressureOf(event.nativeEvent) })
    strokeRef.current = { session, pointerId: event.pointerId, label: t('Copy paint'), grown: target === layer ? undefined : target, copyOffset: offset }
    props.onStrokeActiveChange(true)
    session.flush()
    requestScene()
    requestOverlay()
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    const erasing = tool === 'eraser'
    const picked = activeLayer(doc)
    let layer: PixelLayer | null = picked?.kind === 'raster' && !picked.locked ? picked : null
    if (layer && !layer.visible) {
      props.onBlocked(
        erasing
          ? t('“{name}” is hidden. Click its eye in the Layers panel to show it, then erase again.', { name: layer.name })
          : t('“{name}” is hidden. Click its eye in the Layers panel to show it, then paint again.', { name: layer.name }),
      )
      return
    }
    if (!layer && erasing) {
      props.onBlocked(
        picked?.kind === 'raster'
          ? t("“{name}” is locked, so it can't be rubbed out by accident. Click its lock in the Layers panel to unlock it.", { name: picked.name })
          : t('The eraser rubs out drawings and photos. Pick one in the Layers panel or with Arrange first.'),
      )
      return
    }
    // The page, shapes, text and locked pictures aren't painted on: the stroke makes a new drawing.
    if (!layer) layer = props.onNewDrawing()
    if (!layer) return
    event.currentTarget.setPointerCapture(event.pointerId)
    // A moved, pasted or resized layer may not cover the whole design yet; paint on a settled,
    // enlarged copy.
    const target = coverRect(settleLayer(layer), { x: 0, y: 0, width: doc.width, height: doc.height })
    const mask = doc.selection ? { canvas: selectionInfo(doc.selection, doc.width, doc.height).mask, x: 0, y: 0 } : null
    const mode = tool === 'eraser' ? 'erase' : 'paint'
    const session = new StrokeSession(target, brush, color, mode, mask)
    const point = { ...documentPoint(event.clientX, event.clientY), pressure: pressureOf(event.nativeEvent) }
    const last = lastEndRef.current
    let label = mode === 'erase' ? t('Erase') : t('Brush stroke')
    if (event.shiftKey && last && last.docId === doc.id) {
      session.begin(last.point)
      session.lineTo(point)
      label = mode === 'erase' ? t('Erase straight line') : t('Straight line')
    } else {
      session.begin(point)
    }
    strokeRef.current = { session, pointerId: event.pointerId, label, grown: target === layer ? undefined : target }
    props.onStrokeActiveChange(true)
    session.flush()
    requestScene()
  }

  function finishStroke() {
    const stroke = strokeRef.current
    if (!stroke) return
    strokeRef.current = null
    if (stroke.heal) {
      const marks = stroke.session.finishMarks()
      drawScene()
      propsRef.current.onStrokeActiveChange(false)
      if (marks) propsRef.current.onHeal(stroke.heal, marks)
      return
    }
    const result = stroke.session.finish()
    const end = stroke.session.endPoint
    if (end) lastEndRef.current = { docId: propsRef.current.doc.id, point: { ...end, pressure: 1 } }
    drawScene()
    propsRef.current.onStrokeActiveChange(false)
    if (result) propsRef.current.onStroke(stroke.session.layerId, result, stroke.label, stroke.grown)
    else propsRef.current.onStrokeCancelled()
  }

  function finishPick(clientX: number, clientY: number) {
    pickRef.current = null
    setPicking(false)
    const point = documentPoint(clientX, clientY)
    const hex = sampleColor(propsRef.current.doc, point.x, point.y)
    if (hex) propsRef.current.onPickColor(hex)
  }

  function startMoveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!usableLayer()) return
    const session = startMove(doc, props.fillGap)
    if (!session) {
      props.onBlocked(t('Only pictures and paint can be moved part by part. To move the whole shape, clear the selection first.'))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    moveRef.current = { session, pointerId: event.pointerId, start: documentPoint(event.clientX, event.clientY), dx: 0, dy: 0 }
    setDragging(true)
    requestScene()
    requestOverlay()
  }

  function finishMove() {
    const move = moveRef.current
    if (!move) return
    if (move.dx !== 0 || move.dy !== 0) propsRef.current.onMove(move.session, move.dx, move.dy)
    moveRef.current = null
    setDragging(false)
    drawScene()
    requestOverlay()
  }

  function startSelect(event: PointerEvent<HTMLCanvasElement>) {
    const point = documentPoint(event.clientX, event.clientY)
    const mode: SelectionMode = event.shiftKey ? 'add' : event.altKey ? 'subtract' : selectionMode
    event.currentTarget.setPointerCapture(event.pointerId)
    // Dragging from inside the current selection moves its outline instead of starting a new one.
    if (mode === 'replace' && drawsShape(props.selectionShape) && doc.selection && isPointSelected(doc.selection, doc.width, doc.height, point)) {
      selectRef.current = { kind: 'outline', pointerId: event.pointerId, start: point, dx: 0, dy: 0 }
      return
    }
    selectRef.current = {
      kind: 'shape',
      pointerId: event.pointerId,
      mode,
      shape: props.selectionShape,
      start: point,
      current: point,
      constrain: false,
      points: [point],
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    }
  }

  function finishSelect() {
    const drag = selectRef.current
    selectRef.current = null
    if (!drag) return
    const p = propsRef.current
    const current = p.doc.selection
    if (drag.kind === 'outline') {
      if (current && (drag.dx !== 0 || drag.dy !== 0)) p.onSelect(translateSelection(current, drag.dx, drag.dy), t('Move selection outline'))
      requestOverlay()
      return
    }
    if (drag.shape === 'color') {
      p.onColorSelect(drag.start, drag.mode)
      requestOverlay()
      return
    }
    if (drag.shape === 'magic') {
      const box = rectFromCorners(drag.start, drag.current)
      p.onMagicSelect(drag.moved && box.width >= 2 && box.height >= 2 ? { box } : { point: drag.start }, drag.mode)
      requestOverlay()
      return
    }
    // A click without dragging clears the selection, like clicking away in most programs.
    if (!drag.moved) {
      if (drag.mode === 'replace' && current) p.onSelect(null, t('Deselect'))
      requestOverlay()
      return
    }
    let next = combineSelection(current, dragPolygon(drag), drag.mode)
    if (next && !selectionInfo(next, p.doc.width, p.doc.height).bounds) next = null
    const label = drag.mode === 'add' ? t('Add to selection') : drag.mode === 'subtract' ? t('Remove from selection') : SHAPE_LABELS[drag.shape]
    if (next !== current) p.onSelect(next, label)
    requestOverlay()
  }

  function startBoxDrag(event: PointerEvent<HTMLCanvasElement>, box: BoxEditing) {
    const point = documentPoint(event.clientX, event.clientY)
    let handle = hitHandle(box.value, point, viewport.zoom, { rotate: box.kind === 'transform', edges: box.edges })
    let startBox = box.value
    if (!handle) {
      if (box.kind === 'transform') return
      // Dragging outside the crop frame draws a new one, keeping its shape if it has a fixed one.
      const ratio = Math.abs(box.value.width / box.value.height)
      startBox = box.keepProportions
        ? { cx: point.x + ratio / 2, cy: point.y + 0.5, width: ratio, height: 1, rotation: 0 }
        : { cx: point.x + 0.5, cy: point.y + 0.5, width: 1, height: 1, rotation: 0 }
      handle = 'se'
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    boxRef.current = { pointerId: event.pointerId, handle, start: point, startBox, startClient: { x: event.clientX, y: event.clientY }, moved: false, box: startBox }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    hoverRef.current = localPoint(event.clientX, event.clientY)
    // Ignore a second finger or button while something is already happening.
    if (busy()) return

    const isPan = event.button === 1 || (event.button === 0 && (tool === 'hand' || spaceHeld))
    if (isPan) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      panRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
      setDragging(true)
      requestOverlay()
      return
    }
    if (event.button !== 0) return
    // A press on the design while typing finishes the text.
    if (props.textEditing) {
      props.textEditing.onDone()
      return
    }

    if (tool === 'zoom') {
      const { x, y } = hoverRef.current
      const direction = event.altKey ? -1 : 1
      props.onViewportChange((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), x, y))
    } else if (tool === 'picker' || (tool === 'brush' && event.altKey)) {
      event.currentTarget.setPointerCapture(event.pointerId)
      pickRef.current = event.pointerId
      setPicking(true)
    } else if (tool === 'brush' || tool === 'eraser') {
      startStroke(event)
    } else if (tool === 'heal') {
      startHealStroke(event)
    } else if (tool === 'clone' && props.clone) {
      startCopyStroke(event, props.clone)
    } else if (tool === 'move' && props.arrange && !doc.selection) {
      startArrange(event, props.arrange)
    } else if (tool === 'move') {
      // With a selection, the handles resize the selected part, and dragging anywhere moves it.
      const point = documentPoint(event.clientX, event.clientY)
      const handle = props.box && hitHandle(props.box.value, point, viewport.zoom, { rotate: true })
      if (props.box && handle && handle !== 'move') startBoxDrag(event, props.box)
      else startMoveDrag(event)
    } else if (tool === 'select') {
      startSelect(event)
    } else if (tool === 'crop' && props.box) {
      startBoxDrag(event, props.box)
    } else if (tool === 'shape' && props.shapes) {
      // Shapes start and end on the lines of the page and other things when close (Alt: freely).
      const others = snapTargets({ cx: 0, cy: 0, width: 0, height: 0, rotation: 0 }, [], false).others
      const point = event.altKey ? documentPoint(event.clientX, event.clientY) : snapPoint(documentPoint(event.clientX, event.clientY), others)
      event.currentTarget.setPointerCapture(event.pointerId)
      shapeRef.current = { pointerId: event.pointerId, start: point, current: point, constrain: event.shiftKey, moved: false, startClient: { x: event.clientX, y: event.clientY }, others, lined: null }
    } else if (tool === 'pen' && props.pen) {
      event.currentTarget.setPointerCapture(event.pointerId)
      penRef.current = event.pointerId
      props.pen.down(documentPoint(event.clientX, event.clientY), penInput(event), viewport.zoom)
      requestOverlay()
    } else if (tool === 'text' && props.textTool) {
      const point = documentPoint(event.clientX, event.clientY)
      event.currentTarget.setPointerCapture(event.pointerId)
      textRef.current = { pointerId: event.pointerId, start: point, current: point, startClient: { x: event.clientX, y: event.clientY }, moved: false }
    } else if (tool === 'fill') {
      props.onFill(documentPoint(event.clientX, event.clientY))
    } else if (tool === 'adjust') {
      event.currentTarget.setPointerCapture(event.pointerId)
      compareRef.current = event.pointerId
      props.onCompareChange(true)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    hoverRef.current = localPoint(event.clientX, event.clientY)
    const point = documentPoint(event.clientX, event.clientY)
    props.onCursorChange(point)

    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.lastX
      const dy = event.clientY - pan.lastY
      pan.lastX = event.clientX
      pan.lastY = event.clientY
      props.onViewportChange((v) => panBy(v, dx, dy))
      return
    }

    const move = moveRef.current
    if (move && move.pointerId === event.pointerId) {
      // Moves snap to whole pixels, so nothing ends up blurry.
      const dx = Math.round(point.x - move.start.x)
      const dy = Math.round(point.y - move.start.y)
      if (dx !== move.dx || dy !== move.dy) {
        move.dx = dx
        move.dy = dy
        requestScene()
        requestOverlay()
      }
      return
    }

    const arrange = arrangeRef.current
    if (arrange && arrange.pointerId === event.pointerId) {
      const far = Math.hypot(event.clientX - arrange.startClient.x, event.clientY - arrange.startClient.y) >= clickSlop(event)
      if (arrange.kind === 'marquee') {
        arrange.current = point
        if (far) arrange.moved = true
        requestOverlay()
        return
      }
      if (!arrange.moved && far) {
        arrange.moved = true
        setDragging(true)
      }
      if (!arrange.moved) return
      if (arrange.handle === 'move') {
        // Moves line up with the page and other things when close (Alt moves freely), and go by
        // whole pixels otherwise, so nothing ends up blurry.
        let dx = Math.round(point.x - arrange.start.x)
        let dy = Math.round(point.y - arrange.start.y)
        arrange.lined = null
        if (arrange.snap && !event.altKey) {
          const lined = snapMove(arrange.snap.moving, point.x - arrange.start.x, point.y - arrange.start.y, arrange.snap.others, snapPage(), SNAP_DISTANCE / viewport.zoom, arrange.snap.whole)
          dx = lined.dx
          dy = lined.dy
          arrange.lined = lined
        }
        arrange.box = { ...arrange.startBox, cx: arrange.startBox.cx + dx, cy: arrange.startBox.cy + dy }
      } else {
        // Several things always grow evenly, so nothing in them gets squashed.
        const keepProportions = arrange.kind === 'frame' || (props.arrange?.keepProportions ?? true) !== event.shiftKey
        const options = { keepProportions, snapAngle: event.shiftKey }
        arrange.box = dragHandle(arrange.startBox, arrange.handle, arrange.start, point, options)
        arrange.lined = null
        // A pulled edge or corner of something straight clicks into line too (Alt pulls freely).
        if (arrange.snap && !event.altKey && arrange.handle !== 'rotate' && Math.abs(normalizeAngle(arrange.startBox.rotation)) < 1e-6) {
          const snapped = snapResize(arrange.startBox, arrange.box, arrange.handle, keepProportions, arrange.snap.others)
          if (snapped) {
            arrange.box = dragHandle(arrange.startBox, arrange.handle, arrange.start, snapped, options)
            arrange.lined = linedUp(polygonBounds(boxCorners(arrange.box))!, arrange.snap.others, snapPage())
          }
        }
      }
      requestScene()
      requestOverlay()
      return
    }

    const photo = photoRef.current
    if (photo && photo.pointerId === event.pointerId && photo.layer.fill.kind === 'photo') {
      // The drag, turned into the shape's own directions, moves the photo the same way.
      const { box } = photo.layer
      const w = Math.abs(box.width)
      const h = Math.abs(box.height)
      const place = photoPlacement(photo.layer.fill, w, h)
      const cos = Math.cos(-box.rotation)
      const sin = Math.sin(-box.rotation)
      const dx = point.x - photo.start.x
      const dy = point.y - photo.start.y
      const lx = (dx * cos - dy * sin) * Math.sign(box.width || 1)
      const ly = (dx * sin + dy * cos) * Math.sign(box.height || 1)
      const clamp = (v: number) => Math.max(-1, Math.min(1, v))
      photo.x = place.width > w ? clamp(photo.layer.fill.x + (2 * lx) / (place.width - w)) : 0
      photo.y = place.height > h ? clamp(photo.layer.fill.y + (2 * ly) / (place.height - h)) : 0
      photo.moved = true
      requestScene()
      return
    }

    const textDrag = textRef.current
    if (textDrag && textDrag.pointerId === event.pointerId) {
      textDrag.current = point
      if (!textDrag.moved && Math.hypot(event.clientX - textDrag.startClient.x, event.clientY - textDrag.startClient.y) >= clickSlop(event)) textDrag.moved = true
      requestOverlay()
      return
    }

    if (tool === 'pen' && props.pen) {
      if (penRef.current === event.pointerId) {
        props.pen.move(point, penInput(event), viewport.zoom)
        requestScene()
      } else if (penRef.current === null) {
        const next = props.pen.hover(point, viewport.zoom)
        if (next !== penCursor) setPenCursor(next)
      }
      requestOverlay()
      return
    }

    const shape = shapeRef.current
    if (shape && shape.pointerId === event.pointerId) {
      shape.current = event.altKey ? point : snapPoint(point, shape.others)
      shape.constrain = event.shiftKey
      if (!shape.moved && Math.hypot(event.clientX - shape.startClient.x, event.clientY - shape.startClient.y) >= clickSlop(event)) shape.moved = true
      shape.lined = null
      if (shape.moved && !event.altKey) {
        const box = shapeDragBox(shape, false, 1)
        if (box.width > 1 && box.height > 1) shape.lined = linedUp(polygonBounds(boxCorners(box))!, shape.others, snapPage())
      }
      requestOverlay()
      return
    }

    // With Arrange, the pointer shows what a press would do, and outlines what it would pick.
    if (tool === 'move' && props.arrange && !doc.selection) {
      const box = activeBox(props)
      const handle = box ? hitHandle(box, point, viewport.zoom, { rotate: true, edges: activeEdges(props) }) : null
      if (handle !== boxHover) setBoxHover(handle)
      const hovered = handle ? null : layerAt(doc, point, 3 / viewport.zoom)
      if (hovered !== hoverLayerRef.current) {
        hoverLayerRef.current = hovered
        requestOverlay()
      }
      if (!!hovered !== overObject) setOverObject(!!hovered)
    }

    const boxDrag = boxRef.current
    if (boxDrag && boxDrag.pointerId === event.pointerId && props.box) {
      if (!boxDrag.moved && Math.hypot(event.clientX - boxDrag.startClient.x, event.clientY - boxDrag.startClient.y) >= clickSlop(event)) boxDrag.moved = true
      if (boxDrag.moved) {
        const keepProportions = props.box.keepProportions !== event.shiftKey
        boxDrag.box = dragHandle(boxDrag.startBox, boxDrag.handle, boxDrag.start, point, { keepProportions, snapAngle: event.shiftKey })
        props.box.onChange(boxDrag.box)
      }
      return
    }

    // Over the box, the pointer shows what dragging will do.
    if (((tool === 'move' && doc.selection) || tool === 'crop') && props.box) {
      const hovered = hitHandle(props.box.value, point, viewport.zoom, { rotate: props.box.kind === 'transform', edges: props.box.edges })
      if (hovered !== boxHover) setBoxHover(hovered)
    }

    const drag = selectRef.current
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.kind === 'outline') {
        drag.dx = Math.round(point.x - drag.start.x)
        drag.dy = Math.round(point.y - drag.start.y)
      } else {
        drag.current = point
        drag.constrain = event.shiftKey
        if (!drag.moved && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) >= clickSlop(event)) drag.moved = true
        if (drag.shape === 'freehand') {
          const last = drag.points[drag.points.length - 1]
          if (Math.hypot(point.x - last.x, point.y - last.y) * propsRef.current.viewport.zoom >= 2) drag.points.push(point)
        }
      }
      requestOverlay()
      return
    }

    const stroke = strokeRef.current
    if (stroke && stroke.pointerId === event.pointerId) {
      // Fast movements arrive as several points per event; using all of them keeps curves round.
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
      for (const e of coalesced.length > 0 ? coalesced : [event.nativeEvent]) {
        stroke.session.moveTo({ ...documentPoint(e.clientX, e.clientY), pressure: pressureOf(e) })
      }
      if (stroke.session.flush()) requestScene()
    }

    // Over the selection, the Select tool shows that dragging will move it.
    if (tool === 'select') {
      const inside = doc.selection !== null && drawsShape(props.selectionShape) && !event.shiftKey && !event.altKey && selectionMode === 'replace' && isPointSelected(doc.selection, doc.width, doc.height, point)
      if (inside !== overSelection) setOverSelection(inside)
    }
    requestOverlay()
  }

  function endPointer(event: PointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null
      setDragging(false)
    }
    if (pickRef.current === event.pointerId) {
      if (cancelled) {
        pickRef.current = null
        setPicking(false)
      } else {
        finishPick(event.clientX, event.clientY)
      }
    }
    if (strokeRef.current?.pointerId === event.pointerId) finishStroke()
    if (moveRef.current?.pointerId === event.pointerId) finishMove()
    if (selectRef.current?.pointerId === event.pointerId) finishSelect()
    if (boxRef.current?.pointerId === event.pointerId) {
      const { moved, box } = boxRef.current
      boxRef.current = null
      if (moved && !cancelled) propsRef.current.box?.onRelease?.(box)
    }
    if (arrangeRef.current?.pointerId === event.pointerId) {
      if (cancelled) arrangeRef.current = null
      finishArrange()
    }
    if (shapeRef.current?.pointerId === event.pointerId) {
      if (cancelled) shapeRef.current = null
      else finishShape()
    }
    if (photoRef.current?.pointerId === event.pointerId) {
      if (cancelled) photoRef.current = null
      finishPhotoMove()
    }
    if (textRef.current?.pointerId === event.pointerId) {
      if (cancelled) textRef.current = null
      else finishText()
    }
    if (penRef.current === event.pointerId) finishPen(cancelled)
    stopComparing(event.pointerId)
    requestOverlay()
  }

  function finishPen(cancelled: boolean) {
    penRef.current = null
    propsRef.current.pen?.up(cancelled)
    requestScene()
    requestOverlay()
  }

  function stopComparing(pointerId: number) {
    if (compareRef.current !== pointerId) return
    compareRef.current = null
    props.onCompareChange(false)
  }

  const pickMode = picking || tool === 'picker' || (tool === 'brush' && altHeld)
  // Copy paint picks the spot to copy with a cross; after that it paints.
  const copyPicking = tool === 'clone' && (!props.clone?.source || altHeld)
  const painting = tool === 'brush' || tool === 'eraser' || tool === 'heal' || (tool === 'clone' && !copyPicking)
  const outlineVisible = painting && (brush.size / 2) * viewport.zoom >= MIN_OUTLINE_RADIUS
  // The pointer's shape tells you what will happen when you press.
  function pickCursor(): string {
    if (dragging) return tool === 'move' && !arrangeRef.current ? 'move' : 'grabbing'
    if (tool === 'hand' || spaceHeld) return 'grab'
    if (tool === 'zoom') return altHeld ? 'zoom-out' : 'zoom-in'
    if (tool === 'move' && props.arrange && !doc.selection) {
      if (boxHover) return boxHover === 'move' ? 'move' : HANDLE_CURSORS[boxHover]
      return overObject ? 'move' : 'default'
    }
    if (((tool === 'move' && doc.selection) || tool === 'crop') && props.box) {
      if (boxHover && boxHover !== 'move') return HANDLE_CURSORS[boxHover]
      return tool === 'crop' ? 'crosshair' : 'move'
    }
    if (tool === 'move' || (tool === 'select' && overSelection)) return 'move'
    if (tool === 'text') return 'text'
    if (tool === 'pen') return penCursor
    if (pickMode || copyPicking || tool === 'select' || tool === 'fill' || tool === 'shape') return 'crosshair'
    if (outlineVisible) return 'none'
    return painting ? 'crosshair' : 'default'
  }
  const cursor = pickCursor()

  return (
    <>
      <canvas ref={sceneRef} aria-hidden className="pointer-events-none absolute inset-0 block" style={{ width, height }} />
      <canvas
        ref={overlayRef}
        aria-label={t('{name}, {width} by {height} pixels', { name: doc.name, width: doc.width, height: doc.height })}
        className="absolute inset-0 block touch-none"
        style={{ width, height, cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endPointer(event, false)}
        onPointerCancel={(event) => endPointer(event, true)}
        onLostPointerCapture={(event) => {
          if (strokeRef.current?.pointerId === event.pointerId) finishStroke()
          if (moveRef.current?.pointerId === event.pointerId) finishMove()
          if (selectRef.current?.pointerId === event.pointerId) finishSelect()
          if (boxRef.current?.pointerId === event.pointerId) boxRef.current = null
          if (arrangeRef.current?.pointerId === event.pointerId) finishArrange()
          if (shapeRef.current?.pointerId === event.pointerId) finishShape()
          if (photoRef.current?.pointerId === event.pointerId) finishPhotoMove()
          if (textRef.current?.pointerId === event.pointerId) textRef.current = null
          if (penRef.current === event.pointerId) finishPen(false)
          stopComparing(event.pointerId)
        }}
        onDoubleClick={(event) => {
          if (tool === 'pen' && props.pen) {
            props.pen.doubleClick(documentPoint(event.clientX, event.clientY), viewport.zoom)
            requestScene()
            requestOverlay()
            return
          }
          // Double-clicking text with Arrange starts typing in it, with the cursor where you clicked.
          if (tool !== 'move' || doc.selection || props.textEditing) return
          const point = documentPoint(event.clientX, event.clientY)
          const hit = layerAt(doc, point, 2 / viewport.zoom)
          if (hit?.kind === 'text') props.onEditText(hit.id, textIndexAt(hit, point))
          else if (hit?.kind === 'table' && (!hit.group || doc.activeLayerId === hit.id)) props.onEditTable(hit.id, point)
          else if (hit?.kind === 'shape' && hit.geometry.type === 'path' && (!hit.group || doc.activeLayerId === hit.id)) props.onEditShape(hit.id)
          // Inside something kept together, a double-click picks just the one part.
          else if (hit?.group) props.arrange?.onPick(hit.id)
        }}
        onPointerLeave={() => {
          if (busy()) return
          hoverRef.current = null
          hoverLayerRef.current = null
          props.onCursorChange(null)
          requestOverlay()
        }}
        // Stop middle-click from starting the browser's auto-scroll or pasting on Linux.
        onMouseDown={(event) => event.button === 1 && event.preventDefault()}
        onAuxClick={(event) => event.preventDefault()}
      />
      {props.textEditing && <TextEditBox key={props.textEditing.layer.id} editing={props.textEditing} viewport={viewport} />}
    </>
  )
}
