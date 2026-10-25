import { Check, RotateCcw, VectorSquare, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getContext2d } from '../editor/document.ts'
import type { CornerDots, CornersPanelState } from '../hooks/useCorners.ts'
import type { Point, Viewport } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import { ChoiceGroup } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'

// The longer side of the Face front result shown in the card.
const RESULT_SIDE = 140

// The Face front result, drawn small on a checkerboard so see-through parts show.
function ResultPreview({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = RESULT_SIDE / Math.max(canvas.width, canvas.height)
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  useEffect(() => {
    const target = ref.current
    if (!target) return
    const ratio = window.devicePixelRatio || 1
    target.width = Math.round(width * ratio)
    target.height = Math.round(height * ratio)
    const ctx = getContext2d(target)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, target.width, target.height)
  }, [canvas, width, height])
  return <canvas ref={ref} aria-label={t('How it will look')} className="rounded-md border border-line bg-[repeating-conic-gradient(#f4f5f7_0_25%,#fff_0_50%)] bg-[length:12px_12px]" style={{ width, height }} />
}

// The small card over the design while the corners are moved: which kind, what to do, and Apply
// or Cancel.
export function CornersPanel({ state }: { state: CornersPanelState }) {
  return (
    <section
      aria-label={t('Move the corners')}
      onKeyDown={(event) => event.key !== 'Enter' && event.key !== 'Escape' && event.stopPropagation()}
      className="absolute inset-x-3 top-3 z-10 mx-auto flex w-[360px] max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur"
    >
      <Tooltip
        title={t('Move the corners')}
        description={t('Drag the four dots to put a photo onto a sign, a screen or a box, or to make something photographed at a slant face front.')}
      >
        <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
          <VectorSquare size={15} className="text-accent" aria-hidden />
          {t('Move the corners')}
        </h2>
      </Tooltip>
      <ChoiceGroup
        name={t('What the dots do')}
        value={state.mode}
        onChange={state.onMode}
        options={[
          { value: 'fit', label: t('Fit to a place'), description: t('Drag the photo’s corners anywhere, and it bends to fit, as if it were really on that sign, screen or wall.') },
          { value: 'front', label: t('Face front'), description: t('Put the dots on the corners of something photographed at a slant, like a page or a sign. It comes out flat and square, facing you.') },
        ]}
      />
      <p role="status" className="text-[13px] leading-snug text-ink-2">
        {state.mode === 'fit'
          ? t('Drag the dots on the corners of “{name}” to where they should go. Nothing changes until you press Apply.', { name: state.name })
          : t('Drag each dot onto a corner of the slanted page, sign or picture in “{name}”. Apply makes that part flat and square.', { name: state.name })}
      </p>
      {state.result && (
        <div className="flex items-center gap-3">
          <ResultPreview canvas={state.result} />
          <span className="text-[12px] leading-snug text-ink-3">{t('How it will look')}</span>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          className="me-auto h-8 px-3 text-[13px]"
          disabled={!state.changed}
          onClick={state.reset}
          tip={{ title: t('Start over'), description: t('Put the dots back where they started.') }}
        >
          <RotateCcw size={14} />
          {t('Start over')}
        </Button>
        <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={state.cancel} tip={{ title: t('Cancel'), description: t('Leave the photo as it was.'), shortcut: 'Esc' }}>
          <X size={14} />
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          className="h-8 px-3 text-[13px]"
          onClick={state.apply}
          tip={{ title: t('Apply'), description: t('Keep the photo like this. You can undo it.'), shortcut: 'Enter' }}
        >
          <Check size={14} />
          {t('Apply')}
        </Button>
      </div>
    </section>
  )
}

const DOT_NAMES = () => [t('Top left corner'), t('Top right corner'), t('Bottom right corner'), t('Bottom left corner')]

// The four dots on the design, joined by a thin line. Drag a dot, or pick it and use the arrow keys.
// They sit above the card, so a dot under it can still be dragged out.
export function CornerHandles({ state, viewport }: { state: CornerDots; viewport: Viewport }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; pointer: number } | null>(null)
  const toScreen = (p: Point) => ({ x: p.x * viewport.zoom + viewport.panX, y: p.y * viewport.zoom + viewport.panY })
  const toDesign = (event: React.PointerEvent) => {
    const area = areaRef.current?.getBoundingClientRect()
    return { x: (event.clientX - (area?.left ?? 0) - viewport.panX) / viewport.zoom, y: (event.clientY - (area?.top ?? 0) - viewport.panY) / viewport.zoom }
  }
  const points = state.dots.map(toScreen)
  const outline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const names = DOT_NAMES()
  // In Fit to a place the dots are the photo's own corners, which start in its own order; their
  // names follow where they are seen instead.
  const name = (i: number) => {
    const p = state.dots[i]
    const middle = state.dots.reduce((sum, q) => ({ x: sum.x + q.x / 4, y: sum.y + q.y / 4 }), { x: 0, y: 0 })
    const top = p.y < middle.y
    const left = p.x < middle.x
    return names[top ? (left ? 0 : 1) : left ? 3 : 2]
  }
  return (
    <div ref={areaRef} className="pointer-events-none absolute inset-0 z-[11]">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <polygon points={outline} fill="none" stroke="white" strokeWidth={3} strokeLinejoin="round" opacity={0.9} />
        <polygon points={outline} fill="none" stroke="rgba(27,29,35,0.65)" strokeWidth={1} strokeDasharray="5 4" />
      </svg>
      {points.map((at, i) => (
        <div key={i} className="pointer-events-auto absolute" style={{ left: at.x, top: at.y }}>
          <Tooltip title={name(i)} description={t('Drag this dot to move this corner. Arrow keys move it a little.')}>
            <div
              role="button"
              tabIndex={0}
              aria-label={name(i)}
              data-corner={i}
              className="h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-accent shadow-[0_0_0_1px_rgba(27,29,35,0.55),0_1px_4px_rgba(0,0,0,0.3)] active:cursor-grabbing"
              onPointerDown={(event) => {
                event.stopPropagation()
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                drag.current = { index: i, pointer: event.pointerId }
              }}
              onPointerMove={(event) => {
                if (drag.current?.pointer !== event.pointerId) return
                state.onMove(drag.current.index, toDesign(event))
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(event) => {
                const step = (event.shiftKey ? 10 : 1) / viewport.zoom
                const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
                const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
                if (!dx && !dy) return
                event.preventDefault()
                event.stopPropagation()
                const p = state.dots[i]
                state.onMove(i, { x: p.x + dx, y: p.y + dy })
              }}
            />
          </Tooltip>
        </div>
      ))}
    </div>
  )
}
