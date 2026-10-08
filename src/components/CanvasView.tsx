import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import { renderScene } from '../editor/render.ts'
import type { EditorDocument, Point, ToolId, Viewport } from '../editor/types.ts'
import { nextZoomLevel, panBy, screenToDocument, zoomAtPoint } from '../editor/viewport.ts'

interface CanvasViewProps {
  doc: EditorDocument
  viewport: Viewport
  onViewportChange: Dispatch<SetStateAction<Viewport>>
  onCursorChange: (point: Point | null) => void
  width: number
  height: number
  tool: ToolId
  spaceHeld: boolean
  altHeld: boolean
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

export function CanvasView({
  doc,
  viewport,
  onViewportChange,
  onCursorChange,
  width,
  height,
  tool,
  spaceHeld,
  altHeld,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<PanDrag | null>(null)
  const [dragging, setDragging] = useState(false)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return
    const dpr = window.devicePixelRatio || 1
    const deviceWidth = Math.round(width * dpr)
    const deviceHeight = Math.round(height * dpr)
    if (canvas.width !== deviceWidth) canvas.width = deviceWidth
    if (canvas.height !== deviceHeight) canvas.height = deviceHeight
    const ctx = canvas.getContext('2d')
    if (ctx) renderScene(ctx, { width, height, dpr }, doc, viewport)
  }, [doc, viewport, width, height])

  // React's onWheel is passive, so it can't stop the browser from zooming the whole page.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const step = Math.max(-WHEEL_ZOOM_MAX_STEP, Math.min(WHEEL_ZOOM_MAX_STEP, dy))
        const factor = Math.exp(-step * WHEEL_ZOOM_SPEED)
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        onViewportChange((v) => zoomAtPoint(v, v.zoom * factor, x, y))
      } else if (event.shiftKey && dx === 0) {
        onViewportChange((v) => panBy(v, -dy, 0))
      } else {
        onViewportChange((v) => panBy(v, -dx, -dy))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [onViewportChange])

  function localPoint(event: PointerEvent): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const isPan = event.button === 1 || (event.button === 0 && (tool === 'hand' || spaceHeld))
    if (isPan) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
      setDragging(true)
      return
    }
    if (event.button === 0 && tool === 'zoom') {
      const { x, y } = localPoint(event)
      const direction = event.altKey ? -1 : 1
      onViewportChange((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), x, y))
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.lastX
      const dy = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      onViewportChange((v) => panBy(v, dx, dy))
    }
    const { x, y } = localPoint(event)
    onCursorChange(screenToDocument(viewport, x, y))
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  const cursor = dragging
    ? 'grabbing'
    : tool === 'hand' || spaceHeld
      ? 'grab'
      : tool === 'zoom'
        ? altHeld
          ? 'zoom-out'
          : 'zoom-in'
        : 'default'

  return (
    <canvas
      ref={canvasRef}
      aria-label={`${doc.name}, ${doc.width} by ${doc.height} pixels`}
      className="absolute inset-0 block touch-none"
      style={{ width, height, cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => !dragRef.current && onCursorChange(null)}
      // Stop middle-click from starting the browser's auto-scroll or pasting on Linux.
      onMouseDown={(event) => event.button === 1 && event.preventDefault()}
      onAuxClick={(event) => event.preventDefault()}
    />
  )
}
