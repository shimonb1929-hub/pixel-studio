import { useLayoutEffect, useRef } from 'react'
import { rulerSpacing } from '../editor/grid.ts'
import type { Point, Viewport } from '../editor/types.ts'
import { documentPpi, pixelsToUnit, unitToPixels, useUnit } from '../editor/units.ts'
import { t } from '../i18n/i18n.ts'

// Rulers along the top and left of the view, measuring the design from its top-left corner in the
// unit chosen for sizes (pixels, inches, centimeters…). A small mark follows the pointer.

export const RULER_SIZE = 20

interface RulersProps {
  doc: { width: number; height: number; ppi?: number }
  viewport: Viewport
  width: number
  height: number
  cursor: Point | null
}

function label(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

export function Rulers({ doc, viewport, width, height, cursor }: RulersProps) {
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const [unit] = useUnit()
  const ppi = documentPpi(doc)

  useLayoutEffect(() => {
    const dpr = window.devicePixelRatio || 1
    const draw = (canvas: HTMLCanvasElement | null, axis: 'x' | 'y') => {
      if (!canvas) return
      const length = axis === 'x' ? width : height
      const [w, h] = axis === 'x' ? [length, RULER_SIZE] : [RULER_SIZE, length]
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Drawn as the top ruler; the left one swaps across and along, so its marks face the design.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (axis === 'y') ctx.transform(0, 1, 1, 0, 0, 0)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
      ctx.fillRect(0, 0, length, RULER_SIZE)
      const pan = axis === 'x' ? viewport.panX : viewport.panY
      const toScreen = (value: number) => unitToPixels(value, unit, ppi) * viewport.zoom + pan
      const { step, minor } = rulerSpacing(pixelsToUnit(1 / viewport.zoom, unit, ppi))
      const first = Math.floor(pixelsToUnit(-pan / viewport.zoom, unit, ppi) / step) * step
      const last = pixelsToUnit((length - pan) / viewport.zoom, unit, ppi)
      // The design's own stretch is a little brighter.
      const pageEnd = (axis === 'x' ? doc.width : doc.height) * viewport.zoom + pan
      ctx.fillStyle = 'rgba(51, 102, 255, 0.07)'
      ctx.fillRect(pan, 0, pageEnd - pan, RULER_SIZE)
      ctx.strokeStyle = '#98a2b3'
      ctx.lineWidth = 1
      ctx.beginPath()
      const numbers: number[] = []
      for (let value = first; value <= last + step; value += step) {
        for (let i = 0; i < minor; i++) {
          const at = Math.round(toScreen(value + (i * step) / minor)) + 0.5
          if (at < 0 || at > length) continue
          const tall = i === 0 ? RULER_SIZE : i * 2 === minor ? 7 : 4
          ctx.moveTo(at, RULER_SIZE)
          ctx.lineTo(at, RULER_SIZE - tall)
        }
        numbers.push(value)
      }
      ctx.stroke()
      ctx.fillStyle = '#d0d5dd'
      ctx.fillRect(0, RULER_SIZE - 1, length, 1)
      // Where the pointer is.
      const point = cursor && (axis === 'x' ? cursor.x : cursor.y)
      if (point !== null && point !== undefined) {
        ctx.fillStyle = '#3366ff'
        ctx.fillRect(Math.round(point * viewport.zoom + pan), 0, 1, RULER_SIZE)
      }
      // The numbers, upright on the top ruler and reading downward on the left one.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#667085'
      ctx.font = '500 9px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'top'
      for (const value of numbers) {
        const at = Math.round(toScreen(value))
        if (at < -40 || at > length) continue
        if (axis === 'x') {
          ctx.fillText(label(value), at + 3, 2)
        } else {
          ctx.save()
          ctx.translate(11, at + 3)
          ctx.rotate(Math.PI / 2)
          ctx.fillText(label(value), 0, 0)
          ctx.restore()
        }
      }
    }
    draw(topRef.current, 'x')
    draw(leftRef.current, 'y')
  }, [doc.width, doc.height, ppi, unit, viewport, width, height, cursor])

  return (
    <div aria-label={t('Rulers')} className="pointer-events-none absolute inset-0 z-[1]" data-rulers>
      <canvas ref={topRef} className="absolute left-0 top-0" style={{ width, height: RULER_SIZE }} />
      <canvas ref={leftRef} className="absolute left-0 top-0" style={{ width: RULER_SIZE, height }} />
      <div className="absolute left-0 top-0 border-b border-e border-line bg-surface" style={{ width: RULER_SIZE, height: RULER_SIZE }} />
    </div>
  )
}
