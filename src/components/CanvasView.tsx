import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { BrushSettings } from '../editor/brushes.ts'
import { activeLayer } from '../editor/layers.ts'
import { renderScene } from '../editor/render.ts'
import { sampleColor } from '../editor/sample.ts'
import { StrokeSession, type InputPoint, type StrokeResult } from '../editor/stroke.ts'
import type { EditorDocument, Point, ToolId, Viewport } from '../editor/types.ts'
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
  onStroke: (layerId: string, result: StrokeResult, label: string) => void
  onStrokeActiveChange: (active: boolean) => void
  onPickColor: (hex: string) => void
  onBlocked: (message: string) => void
}

interface PanDrag {
  pointerId: number
  lastX: number
  lastY: number
}

// Mouse wheels jump ~100px per notch while trackpad pinches send small steps;
// capping the step keeps both feeling about the same.
const WHEEL_ZOOM_SPEED = 0.01
const WHEEL_ZOOM_MAX_STEP = 25
// Below this on-screen radius the brush outline is too small to see, so a crosshair shows instead.
const MIN_OUTLINE_RADIUS = 3
const PICKER_RING_RADIUS = 30
const PICKER_RING_WIDTH = 12

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

export function CanvasView(props: CanvasViewProps) {
  const { doc, revision, viewport, width, height, tool, spaceHeld, altHeld, brush, color } = props
  const sceneRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  const strokeRef = useRef<{ session: StrokeSession; pointerId: number; label: string } | null>(null)
  const panRef = useRef<PanDrag | null>(null)
  const pickRef = useRef<number | null>(null)
  const hoverRef = useRef<Point | null>(null)
  const lastEndRef = useRef<{ docId: string; point: InputPoint } | null>(null)
  const sceneFrameRef = useRef(0)
  const overlayFrameRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [picking, setPicking] = useState(false)

  function drawScene() {
    sceneFrameRef.current = 0
    const canvas = sceneRef.current
    const p = propsRef.current
    if (!canvas || p.width <= 0 || p.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    sizeCanvas(canvas, p.width, p.height, dpr)
    const ctx = canvas.getContext('2d')
    const stroke = strokeRef.current?.session
    if (ctx) renderScene(ctx, { width: p.width, height: p.height, dpr }, p.doc, p.viewport, stroke && { layerId: stroke.layerId, canvas: stroke.preview })
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
    const hover = hoverRef.current
    if (!hover || panRef.current || p.spaceHeld) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    const layer = activeLayer(doc)
    if (!layer) return
    if (!layer.visible) {
      props.onBlocked(`"${layer.name}" is hidden. Click its eye in the Layers panel to show it, then paint again.`)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const mode = tool === 'eraser' ? 'erase' : 'paint'
    const session = new StrokeSession(layer, brush, color, mode, doc.width, doc.height)
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
    strokeRef.current = { session, pointerId: event.pointerId, label }
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
    if (result) propsRef.current.onStroke(stroke.session.layerId, result, stroke.label)
  }

  function finishPick(clientX: number, clientY: number) {
    pickRef.current = null
    setPicking(false)
    const point = documentPoint(clientX, clientY)
    const hex = sampleColor(propsRef.current.doc, point.x, point.y)
    if (hex) propsRef.current.onPickColor(hex)
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    hoverRef.current = localPoint(event.clientX, event.clientY)
    // Ignore a second finger or button while something is already happening.
    if (strokeRef.current || panRef.current || pickRef.current !== null) return

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
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    hoverRef.current = localPoint(event.clientX, event.clientY)
    props.onCursorChange(documentPoint(event.clientX, event.clientY))

    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.lastX
      const dy = event.clientY - pan.lastY
      pan.lastX = event.clientX
      pan.lastY = event.clientY
      props.onViewportChange((v) => panBy(v, dx, dy))
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
    requestOverlay()
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null
      setDragging(false)
    }
    if (pickRef.current === event.pointerId) finishPick(event.clientX, event.clientY)
    if (strokeRef.current?.pointerId === event.pointerId) finishStroke()
    requestOverlay()
  }

  function handlePointerCancel(event: PointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null
      setDragging(false)
    }
    if (pickRef.current === event.pointerId) {
      pickRef.current = null
      setPicking(false)
    }
    if (strokeRef.current?.pointerId === event.pointerId) finishStroke()
  }

  const pickMode = picking || tool === 'picker' || (tool === 'brush' && altHeld)
  const painting = tool === 'brush' || tool === 'eraser'
  const outlineVisible = painting && (brush.size / 2) * viewport.zoom >= MIN_OUTLINE_RADIUS
  const cursor = dragging
    ? 'grabbing'
    : tool === 'hand' || spaceHeld
      ? 'grab'
      : tool === 'zoom'
        ? altHeld
          ? 'zoom-out'
          : 'zoom-in'
        : pickMode
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
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={(event) => strokeRef.current?.pointerId === event.pointerId && finishStroke()}
        onPointerLeave={() => {
          if (strokeRef.current || panRef.current || pickRef.current !== null) return
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
