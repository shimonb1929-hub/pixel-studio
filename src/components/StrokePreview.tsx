import { useLayoutEffect, useRef } from 'react'
import type { BrushSettings } from '../editor/brushes.ts'
import { getContext2d } from '../editor/document.ts'
import { paintSample, type StrokeMode } from '../editor/stroke.ts'

interface StrokePreviewProps {
  settings: BrushSettings
  color: string
  mode: StrokeMode
  width: number
  height: number
  // Big brushes are shrunk to this size so the sample still fits.
  maxSize: number
}

// The squares behind an eraser sample, showing that erased parts become see-through.
const CHECKER = 'repeating-conic-gradient(#e8eaee 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

// A sample stroke painted with the real brush engine, so what you see here is what you get.
export function StrokePreview({ settings, color, mode, width, height, maxSize }: StrokePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = getContext2d(canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (mode === 'erase') {
      ctx.fillStyle = '#b9c0cc'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    paintSample(ctx, { ...settings, size: settings.size * dpr }, color, mode, canvas.width, canvas.height, maxSize * dpr)
  }, [settings, color, mode, width, height, maxSize])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="shrink-0 rounded"
      style={{ width, height, background: mode === 'erase' ? CHECKER : undefined }}
    />
  )
}
