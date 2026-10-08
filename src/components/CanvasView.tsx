import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { BrushSettings } from '../editor/brushes.ts'
import { coverRect } from '../editor/document.ts'
import { ellipsePolygon, rectFromCorners, rectPolygon, squareFromCorners } from '../editor/geometry.ts'
import { activeLayer } from '../editor/layers.ts'
import { startMove, type MoveSession } from '../editor/move.ts'
import { renderScene, type LayerOverride } from '../editor/render.ts'
import { sampleColor } from '../editor/sample.ts'
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
import type { EditorDocument, Layer, Point, ToolId, Viewport } from '../editor/types.ts'
import { nextZoomLevel, panBy, screenToDocument, zoomAtPoint } from '../editor/viewport.ts'

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
  onStroke: (layerId: string, result: StrokeResult, label: string, grown?: Layer) => void
  onStrokeActiveChange: (active: boolean) => void
  onPickColor: (hex: string) => void
  onMove: (session: MoveSession, dx: number, dy: number) => void
  onSelect: (selection: Selection | null, label: string) => void
  onBlocked: (message: string) => void
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

// Mouse wheels jump ~100px per notch while trackpad pinches send small steps;
// capping the step keeps both feeling about the same.
const WHEEL_ZOOM_SPEED = 0.01
const WHEEL_ZOOM_MAX_STEP = 25
// Below this on-screen radius the brush outline is too small to see, so a crosshair shows instead.
const MIN_OUTLINE_RADIUS = 3
const PICKER_RING_RADIUS = 30
const PICKER_RING_WIDTH = 12
// A press that moves less than this many screen pixels is a click, not a drag.
const CLICK_DISTANCE = 3
const ANTS_DASH = 4
const ANTS_INTERVAL_MS = 90

const SHAPE_LABELS: Record<SelectionShape, string> = { rectangle: 'rectangle', ellipse: 'oval', freehand: 'freehand area' }

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
  const strokeRef = useRef<{ session: StrokeSession; pointerId: number; label: string; grown?: Layer } | null>(null)
  const panRef = useRef<PanDrag | null>(null)
  const pickRef = useRef<number | null>(null)
  const moveRef = useRef<MoveDrag | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const hoverRef = useRef<Point | null>(null)
  const lastEndRef = useRef<{ docId: string; point: InputPoint } | null>(null)
  const antsRef = useRef(0)
  const sceneFrameRef = useRef(0)
  const overlayFrameRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [picking, setPicking] = useState(false)
  const [overSelection, setOverSelection] = useState(false)

  function sceneOverride(): LayerOverride | null {
    const stroke = strokeRef.current?.session
    if (stroke) return { layerId: stroke.layerId, parts: [{ canvas: stroke.preview, x: stroke.x, y: stroke.y }] }
    const move = moveRef.current
    if (move) return { layerId: move.session.layerId, parts: move.session.parts(move.dx, move.dy) }
    return null
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
    const selection = p.doc.selection
    const drag = selectRef.current
    if (selection) {
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
    drawSelection(ctx, p)

    const hover = hoverRef.current
    if (!hover || panRef.current || moveRef.current || p.spaceHeld) return
    if (pickRef.current !== null || p.tool === 'picker' || (p.tool === 'brush' && p.altHeld)) {
      const point = screenToDocument(p.viewport, hover.x, hover.y)
      drawPickerRing(ctx, hover.x, hover.y, sampleColor(p.doc, point.x, point.y), p.color)
    } else if (p.tool === 'brush' || p.tool === 'eraser') {
      const radius = (p.brush.size / 2) * p.viewport.zoom
      if (radius >= MIN_OUTLINE_RADIUS) drawBrushOutline(ctx, hover.x, hover.y, radius)
    }
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

  useLayoutEffect(() => {
    drawScene()
  }, [doc, revision, viewport, width, height])

  useLayoutEffect(() => {
    drawOverlay()
  }, [doc, viewport, width, height, tool, spaceHeld, altHeld, brush, color, picking])

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
  function usableLayer(action: string): Layer | null {
    const layer = activeLayer(doc)
    if (!layer) return null
    if (!layer.visible) {
      props.onBlocked(`"${layer.name}" is hidden. Click its eye in the Layers panel to show it, then ${action} again.`)
      return null
    }
    return layer
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    const layer = usableLayer('paint')
    if (!layer) return
    event.currentTarget.setPointerCapture(event.pointerId)
    // A moved or pasted layer may not cover the whole design yet; paint on an enlarged copy.
    const target = coverRect(layer, { x: 0, y: 0, width: doc.width, height: doc.height })
    const mask = doc.selection ? { canvas: selectionInfo(doc.selection, doc.width, doc.height).mask, x: 0, y: 0 } : null
    const mode = tool === 'eraser' ? 'erase' : 'paint'
    const session = new StrokeSession(target, brush, color, mode, mask)
    const point = { ...documentPoint(event.clientX, event.clientY), pressure: pressureOf(event.nativeEvent) }
    const last = lastEndRef.current
    let label = mode === 'erase' ? 'Erase' : 'Brush stroke'
    if (event.shiftKey && last && last.docId === doc.id) {
      session.begin(last.point)
      session.lineTo(point)
      label = mode === 'erase' ? 'Erase straight line' : 'Straight line'
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
    const result = stroke.session.finish()
    const end = stroke.session.endPoint
    if (end) lastEndRef.current = { docId: propsRef.current.doc.id, point: { ...end, pressure: 1 } }
    drawScene()
    propsRef.current.onStrokeActiveChange(false)
    if (result) propsRef.current.onStroke(stroke.session.layerId, result, stroke.label, stroke.grown)
  }

  function finishPick(clientX: number, clientY: number) {
    pickRef.current = null
    setPicking(false)
    const point = documentPoint(clientX, clientY)
    const hex = sampleColor(propsRef.current.doc, point.x, point.y)
    if (hex) propsRef.current.onPickColor(hex)
  }

  function startMoveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!usableLayer('move it')) return
    const session = startMove(doc)
    if (!session) return
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
    if (mode === 'replace' && doc.selection && isPointSelected(doc.selection, doc.width, doc.height, point)) {
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
      if (current && (drag.dx !== 0 || drag.dy !== 0)) p.onSelect(translateSelection(current, drag.dx, drag.dy), 'Move selection outline')
      requestOverlay()
      return
    }
    // A click without dragging clears the selection, like clicking away in most programs.
    if (!drag.moved) {
      if (drag.mode === 'replace' && current) p.onSelect(null, 'Deselect')
      requestOverlay()
      return
    }
    let next = combineSelection(current, dragPolygon(drag), drag.mode)
    if (next && !selectionInfo(next, p.doc.width, p.doc.height).bounds) next = null
    const label = drag.mode === 'add' ? 'Add to selection' : drag.mode === 'subtract' ? 'Remove from selection' : `Select ${SHAPE_LABELS[drag.shape]}`
    if (next !== current) p.onSelect(next, label)
    requestOverlay()
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    hoverRef.current = localPoint(event.clientX, event.clientY)
    // Ignore a second finger or button while something is already happening.
    if (strokeRef.current || panRef.current || pickRef.current !== null || moveRef.current || selectRef.current) return

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
    } else if (tool === 'move') {
      startMoveDrag(event)
    } else if (tool === 'select') {
      startSelect(event)
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

    const drag = selectRef.current
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.kind === 'outline') {
        drag.dx = Math.round(point.x - drag.start.x)
        drag.dy = Math.round(point.y - drag.start.y)
      } else {
        drag.current = point
        drag.constrain = event.shiftKey
        if (!drag.moved && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) >= CLICK_DISTANCE) drag.moved = true
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
      const inside = doc.selection !== null && !event.shiftKey && !event.altKey && selectionMode === 'replace' && isPointSelected(doc.selection, doc.width, doc.height, point)
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
    requestOverlay()
  }

  const pickMode = picking || tool === 'picker' || (tool === 'brush' && altHeld)
  const painting = tool === 'brush' || tool === 'eraser'
  const outlineVisible = painting && (brush.size / 2) * viewport.zoom >= MIN_OUTLINE_RADIUS
  const cursor = dragging
    ? tool === 'move'
      ? 'move'
      : 'grabbing'
    : tool === 'hand' || spaceHeld
      ? 'grab'
      : tool === 'zoom'
        ? altHeld
          ? 'zoom-out'
          : 'zoom-in'
        : tool === 'move' || (tool === 'select' && overSelection)
          ? 'move'
          : pickMode || tool === 'select'
            ? 'crosshair'
            : outlineVisible
              ? 'none'
              : painting
                ? 'crosshair'
                : 'default'

  return (
    <>
      <canvas ref={sceneRef} aria-hidden className="pointer-events-none absolute inset-0 block" style={{ width, height }} />
      <canvas
        ref={overlayRef}
        aria-label={`${doc.name}, ${doc.width} by ${doc.height} pixels`}
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
        }}
        onPointerLeave={() => {
          if (strokeRef.current || panRef.current || pickRef.current !== null || moveRef.current || selectRef.current) return
          hoverRef.current = null
          props.onCursorChange(null)
          requestOverlay()
        }}
        // Stop middle-click from starting the browser's auto-scroll or pasting on Linux.
        onMouseDown={(event) => event.button === 1 && event.preventDefault()}
        onAuxClick={(event) => event.preventDefault()}
      />
    </>
  )
}
