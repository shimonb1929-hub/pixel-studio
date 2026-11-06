import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { boxPoint, dragHandle, HANDLE_SIGNS, rotationKnob, type Handle, type TransformBox } from '../editor/transform.ts'
import type { Point, TextLayer, Viewport } from '../editor/types.ts'
import { textInBox } from '../text/textLayer.ts'
import { t } from '../i18n/i18n.ts'

// Handles on text while it's being typed, the same as Arrange shows on any object: pull a corner to
// make the letters bigger or smaller, a side to change where lines wrap, the round handle to turn
// it, and the edge of the box to move it. Typing goes on afterwards, with the cursor where it was.

const CURSORS: Record<Handle, string> = {
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

// How far outside the box the edge can be grabbed to move the text, in screen pixels.
const EDGE = 10

interface Drag {
  pointerId: number
  handle: Handle
  start: Point
  startBox: TransformBox
  startLayer: TextLayer
}

export function TypingHandles({ layer, viewport, onPlace }: { layer: TextLayer; viewport: Viewport; onPlace: (layer: TextLayer) => void }) {
  const dragRef = useRef<Drag | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { box } = layer
  const z = viewport.zoom
  const screen = (p: Point) => ({ x: p.x * z + viewport.panX, y: p.y * z + viewport.panY })

  // A pointer's place on the design.
  function designPoint(event: ReactPointerEvent): Point {
    const rect = (rootRef.current?.offsetParent ?? document.body).getBoundingClientRect()
    return { x: (event.clientX - rect.left - viewport.panX) / z, y: (event.clientY - rect.top - viewport.panY) / z }
  }

  function start(event: ReactPointerEvent, handle: Handle) {
    if (event.button !== 0) return
    // The typing keeps the keyboard, so letters go on going in after the drag.
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, handle, start: designPoint(event), startBox: box, startLayer: layer }
  }

  function move(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = designPoint(event)
    let next: TransformBox
    if (drag.handle === 'move') {
      // By whole pixels, so the letters stay crisp.
      next = { ...drag.startBox, cx: drag.startBox.cx + Math.round(point.x - drag.start.x), cy: drag.startBox.cy + Math.round(point.y - drag.start.y) }
    } else {
      next = dragHandle(drag.startBox, drag.handle, drag.start, point, { keepProportions: true, snapAngle: event.shiftKey })
    }
    onPlace(textInBox(drag.startLayer, next))
  }

  function end(event: ReactPointerEvent) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const events = (handle: Handle) => ({
    onPointerDown: (event: ReactPointerEvent) => start(event, handle),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    // Keeps the cursor in the text.
    onMouseDown: (event: ReactMouseEvent) => event.preventDefault(),
  })

  const w = Math.abs(box.width) * z
  const h = Math.abs(box.height) * z
  const middle = screen({ x: box.cx, y: box.cy })
  const degrees = (box.rotation * 180) / Math.PI
  const corners: [Handle, string][] = [
    ['nw', t('Pull a corner to make the text bigger or smaller')],
    ['ne', t('Pull a corner to make the text bigger or smaller')],
    ['se', t('Pull a corner to make the text bigger or smaller')],
    ['sw', t('Pull a corner to make the text bigger or smaller')],
    ['w', t('Pull a side to make the lines longer or shorter')],
    ['e', t('Pull a side to make the lines longer or shorter')],
  ]
  const knob = screen(rotationKnob(box, z))
  const top = screen(boxPoint(box, 0, -1))
  const stem = Math.hypot(knob.x - top.x, knob.y - top.y)

  return (
    <div ref={rootRef} className="pointer-events-none absolute left-0 top-0" data-typing-handles="">
      {/* The edge of the box: grab it to move the text. */}
      <div
        className="absolute"
        style={{ left: middle.x - w / 2, top: middle.y - h / 2, width: w, height: h, transform: `rotate(${degrees}deg)`, transformOrigin: 'center' }}
      >
        {(
          [
            { left: -EDGE, top: -EDGE, width: w + 2 * EDGE, height: EDGE },
            { left: -EDGE, top: h, width: w + 2 * EDGE, height: EDGE },
            { left: -EDGE, top: 0, width: EDGE, height: h },
            { left: w, top: 0, width: EDGE, height: h },
          ] as const
        ).map((band, i) => (
          <div key={i} role="button" aria-label={t('Drag the edge to move the text')} className="pointer-events-auto absolute touch-none" style={{ ...band, cursor: CURSORS.move }} {...events('move')} />
        ))}
        <div className="absolute border-l-[1.5px] border-[#3366ff]" style={{ left: w / 2 - 0.75, top: -stem, height: stem }} />
      </div>
      {corners.map(([handle, label]) => {
        const [sx, sy] = HANDLE_SIGNS[handle as Exclude<Handle, 'move' | 'rotate'>]
        const p = screen(boxPoint(box, sx, sy))
        return (
          <div
            key={handle}
            role="button"
            aria-label={label}
            data-handle={handle}
            className="pointer-events-auto absolute flex h-[18px] w-[18px] touch-none items-center justify-center"
            style={{ left: p.x - 9, top: p.y - 9, cursor: CURSORS[handle], transform: `rotate(${degrees}deg)` }}
            {...events(handle)}
          >
            <span className="h-[9px] w-[9px] rounded-[2px] border-[1.5px] border-[#3366ff] bg-white" />
          </div>
        )
      })}
      <div
        role="button"
        aria-label={t('Drag the round handle to turn the text')}
        data-handle="rotate"
        className="pointer-events-auto absolute flex h-[20px] w-[20px] touch-none items-center justify-center"
        style={{ left: knob.x - 10, top: knob.y - 10, cursor: CURSORS.rotate }}
        {...events('rotate')}
      >
        <span className="h-3 w-3 rounded-full border-[1.5px] border-[#3366ff] bg-white" />
      </div>
    </div>
  )
}
