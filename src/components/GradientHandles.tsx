import { useRef } from 'react'
import { gradientLine, type Gradient } from '../editor/gradient.ts'
import type { TransformBox } from '../editor/transform.ts'
import type { Viewport } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

interface GradientHandlesProps {
  // What the gradient fills: a shape's box, or the whole page.
  box: TransformBox
  gradient: Gradient
  viewport: Viewport
  onChange: (gradient: Gradient, label: string, mergeKey?: string) => void
}

// The dots sit this far along the way from the middle to the ends of the gradient, so they stay
// inside the shape, away from its corner handles.
const REACH = 0.6
// Straight across, straight down and the diagonals catch the dot when it comes this close.
const SNAP_DEGREES = 6

// The way a gradient runs, shown on the design as a line with a dot at each end: drag a dot to turn
// it. The start dot shows the first color, the end dot the last.
export function GradientHandles({ box, gradient, viewport, onChange }: GradientHandlesProps) {
  const drag = useRef<{ end: boolean; pointer: number } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const sx = box.width < 0 ? -1 : 1
  const sy = box.height < 0 ? -1 : 1
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)

  // From the box's own frame (the way the gradient is drawn) to the screen, and back.
  const toScreen = (x: number, y: number) => {
    const fx = x * sx
    const fy = y * sy
    const dx = box.cx + fx * cos - fy * sin
    const dy = box.cy + fx * sin + fy * cos
    return { x: dx * viewport.zoom + viewport.panX, y: dy * viewport.zoom + viewport.panY }
  }
  const toBox = (screenX: number, screenY: number) => {
    const dx = (screenX - viewport.panX) / viewport.zoom - box.cx
    const dy = (screenY - viewport.panY) / viewport.zoom - box.cy
    return { x: (dx * cos + dy * sin) * sx, y: (-dx * sin + dy * cos) * sy }
  }

  const line = gradientLine(gradient.angle, w, h)
  const start = toScreen(line.x0 * REACH, line.y0 * REACH)
  const end = toScreen(line.x1 * REACH, line.y1 * REACH)
  const first = gradient.stops[0]
  const last = gradient.stops[gradient.stops.length - 1]

  function angleAt(event: React.PointerEvent, isEnd: boolean): number {
    const area = areaRef.current?.getBoundingClientRect()
    const p = toBox(event.clientX - (area?.left ?? 0), event.clientY - (area?.top ?? 0))
    let angle = (Math.atan2(p.y, p.x) * 180) / Math.PI + (isEnd ? 0 : 180)
    angle = ((Math.round(angle) % 360) + 360) % 360
    const nearest = Math.round(angle / 45) * 45
    if (Math.abs(angle - nearest) <= SNAP_DEGREES) angle = nearest % 360
    return angle
  }

  const dot = (isEnd: boolean, at: { x: number; y: number }, color: string) => (
    <div className="pointer-events-auto absolute" style={{ left: at.x, top: at.y }}>
      <Tooltip title={isEnd ? t('Gradient end') : t('Gradient start')} description={t('Drag this dot around to turn the gradient, so the colors fade the way you want.')}>
        <div
          role="slider"
          tabIndex={0}
          aria-label={isEnd ? t('Gradient end') : t('Gradient start')}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={gradient.angle}
          aria-valuetext={`${gradient.angle}°`}
          className="h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(27,29,35,0.55),0_1px_4px_rgba(0,0,0,0.3)] active:cursor-grabbing"
          style={{ background: color }}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { end: isEnd, pointer: event.pointerId }
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return
            const angle = angleAt(event, drag.current.end)
            if (angle !== gradient.angle) onChange({ ...gradient, angle }, t('Gradient direction'), 'gradient-direction')
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 15 : 1
            const turn = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? step : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -step : 0
            if (!turn) return
            event.preventDefault()
            event.stopPropagation()
            onChange({ ...gradient, angle: (((gradient.angle + turn) % 360) + 360) % 360 }, t('Gradient direction'), 'gradient-direction')
          }}
        />
      </Tooltip>
    </div>
  )

  return (
    <div ref={areaRef} className="pointer-events-none absolute inset-0 z-[5]">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="white" strokeWidth={3} strokeLinecap="round" opacity={0.9} />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="rgba(27,29,35,0.6)" strokeWidth={1} strokeDasharray="4 3" />
      </svg>
      {dot(false, start, first.color)}
      {dot(true, end, last.color)}
    </div>
  )
}
