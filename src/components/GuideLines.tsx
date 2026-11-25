import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { changeGuide, type GuideAxis } from '../editor/guides.ts'
import type { Guides, Viewport } from '../editor/types.ts'
import { documentPpi, formatInUnit, useUnit } from '../editor/units.ts'
import { t } from '../i18n/i18n.ts'
import { RULER_SIZE } from './Rulers.tsx'
import { Tooltip } from './Tooltip.tsx'
import { unitShort } from './unitWords.ts'

// Guide lines over the view. Pull one out of a ruler (top ruler: a line across; left ruler: a line
// up and down), drag it to move it, and drag it back onto its ruler or off the view to take it
// away. While one is held, a small label says where it is.

interface GuideLinesProps {
  doc: { width: number; height: number; ppi?: number; guides?: Guides }
  viewport: Viewport
  width: number
  height: number
  // Pulling new ones out needs the rulers showing.
  rulers: boolean
  // Moving the ones already there: with the Arrange tool, so they never get in the way of drawing.
  canMove: boolean
  onChange: (guides: Guides, label: string) => void
}

interface Held {
  axis: GuideAxis
  // Which guide is being moved, or null for a new one.
  index: number | null
  pointerId: number
  // Where it is on screen, across the view (x for an up-and-down line, y for a line across).
  at: number
}

// How wide a guide is to grab, in screen pixels.
const GRAB = 7

export function GuideLines({ doc, viewport, width, height, rulers, canMove, onChange }: GuideLinesProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const [unit] = useUnit()
  const ppi = documentPpi(doc)
  const guides = doc.guides ?? { x: [], y: [] }
  const toScreen = (axis: GuideAxis, value: number) => value * viewport.zoom + (axis === 'x' ? viewport.panX : viewport.panY)
  const toDesign = (axis: GuideAxis, screen: number) => (screen - (axis === 'x' ? viewport.panX : viewport.panY)) / viewport.zoom

  function screenAt(axis: GuideAxis, event: ReactPointerEvent) {
    const box = rootRef.current?.getBoundingClientRect()
    if (!box) return 0
    return axis === 'x' ? event.clientX - box.left : event.clientY - box.top
  }

  function grab(axis: GuideAxis, index: number | null, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setHeld({ axis, index, pointerId: event.pointerId, at: screenAt(axis, event) })
  }

  function move(event: ReactPointerEvent) {
    if (!held || event.pointerId !== held.pointerId) return
    setHeld({ ...held, at: screenAt(held.axis, event) })
  }

  // Back on its ruler, or off the view: it goes away.
  const gone = (axis: GuideAxis, at: number) => at < RULER_SIZE || at > (axis === 'x' ? width : height)

  function drop(event: ReactPointerEvent) {
    if (!held || event.pointerId !== held.pointerId) return
    const at = screenAt(held.axis, event)
    setHeld(null)
    const away = gone(held.axis, at)
    if (held.index === null && away) return
    const value = Math.round(toDesign(held.axis, at))
    if (held.index !== null && !away && value === guides[held.axis][held.index]) return
    const label = away ? t('Remove guide line') : held.index === null ? t('Add guide line') : t('Move guide line')
    onChange(changeGuide(guides, held.axis, held.index, away ? null : value), label)
  }

  const lines: { axis: GuideAxis; index: number; at: number }[] = []
  for (const axis of ['x', 'y'] as const) {
    guides[axis].forEach((value, index) => {
      if (held && held.axis === axis && held.index === index) return
      lines.push({ axis, index, at: toScreen(axis, value) })
    })
  }
  const heldValue = held ? Math.round(toDesign(held.axis, held.at)) : 0
  const heldGone = held ? gone(held.axis, held.at) : false

  const line = (axis: GuideAxis, at: number, faded = false) => (
    <div
      className="pointer-events-none absolute"
      style={
        axis === 'x'
          ? { left: Math.round(at), top: 0, width: 1, height, background: faded ? 'rgba(0, 170, 210, 0.35)' : '#00aad2' }
          : { top: Math.round(at), left: 0, height: 1, width, background: faded ? 'rgba(0, 170, 210, 0.35)' : '#00aad2' }
      }
    />
  )

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" data-guides>
      {lines.map(({ axis, index, at }) => (
        <div key={`${axis}${index}`} data-guide={axis}>
          {line(axis, at)}
          {canMove && (
            <div
              className="pointer-events-auto absolute touch-none"
              style={{
                ...(axis === 'x' ? { left: Math.round(at) - (GRAB >> 1), top: 0, width: GRAB, height } : { top: Math.round(at) - (GRAB >> 1), left: 0, height: GRAB, width }),
                cursor: axis === 'x' ? 'ew-resize' : 'ns-resize',
              }}
              aria-label={t('Guide line')}
              onPointerDown={(event) => grab(axis, index, event)}
              onPointerMove={move}
              onPointerUp={drop}
              onPointerCancel={() => setHeld(null)}
            />
          )}
        </div>
      ))}
      {held && (
        <>
          {line(held.axis, held.at, heldGone)}
          <div
            className="pointer-events-none absolute rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums"
            dir="ltr"
            style={held.axis === 'x' ? { left: Math.round(held.at) + 6, top: RULER_SIZE + 6 } : { top: Math.round(held.at) + 6, left: RULER_SIZE + 6 }}
            data-guide-label
          >
            {heldGone ? t('Let go to remove') : `${formatInUnit(heldValue, unit, ppi)} ${unitShort(unit)}`}
          </div>
        </>
      )}
      {rulers && (
        <>
          <Tooltip title={t('Guide lines')} description={t('Drag from a ruler onto your design to add a line that things line up with.')} className="pointer-events-auto absolute inset-x-0 top-0 block h-5">
            <div
              className="h-full w-full touch-none"
              style={{ cursor: 'ns-resize' }}
              data-ruler-pull="y"
              onPointerDown={(event) => grab('y', null, event)}
              onPointerMove={move}
              onPointerUp={drop}
              onPointerCancel={() => setHeld(null)}
            />
          </Tooltip>
          <Tooltip side="right" title={t('Guide lines')} description={t('Drag from a ruler onto your design to add a line that things line up with.')} className="pointer-events-auto absolute inset-y-0 left-0 block w-5">
            <div
              className="h-full w-full touch-none"
              style={{ cursor: 'ew-resize' }}
              data-ruler-pull="x"
              onPointerDown={(event) => grab('x', null, event)}
              onPointerMove={move}
              onPointerUp={drop}
              onPointerCancel={() => setHeld(null)}
            />
          </Tooltip>
        </>
      )}
    </div>
  )
}
