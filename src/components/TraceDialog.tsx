import { useEffect, useMemo, useRef, useState } from 'react'
import { tracePath } from '../editor/path.ts'
import { DEFAULT_TRACE, suggestCutoff, type TraceMode, type TraceOptions, type TraceResult } from '../editor/trace.ts'
import { TRACE_SIDE, tracePicture } from '../editor/traceLayers.ts'
import { runTrace, stopTrace } from '../editor/traceRun.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { Slider } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

// Turn a picture into shapes (pro: Image Trace). The window shows the shapes as the choices change;
// nothing in the design changes until the button is pressed, and Esc leaves everything as it was.

interface TraceDialogProps {
  name: string
  // The picture's own pixels.
  source: HTMLCanvasElement
  onApply: (result: TraceResult) => void
  onClose: () => void
}

const PREVIEW_HEIGHT = 220
// The preview waits this long after the last change, so dragging a slider stays smooth.
const PREVIEW_WAIT = 90
const MIN_COLORS = 2
const MAX_COLORS = 16

// The shapes on the preview canvas, fitted in the middle.
function drawPreview(canvas: HTMLCanvasElement, result: TraceResult) {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const scale = Math.min(width / result.width, height / result.height)
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, (ratio * (width - result.width * scale)) / 2, (ratio * (height - result.height * scale)) / 2)
  for (const color of result.colors) {
    const path = new Path2D()
    for (const outline of color.paths) tracePath(path, outline)
    ctx.fillStyle = color.color
    ctx.fill(path, 'evenodd')
  }
}

export function TraceDialog({ name, source, onApply, onClose }: TraceDialogProps) {
  // A small copy for the preview; the full picture is only traced when the shapes are kept.
  const small = useMemo(() => tracePicture(source, TRACE_SIDE.preview), [source])
  const [options, setOptions] = useState<TraceOptions>(() => ({ ...DEFAULT_TRACE, cutoff: suggestCutoff(small) }))
  // The shapes shown, and the choices they were made with.
  const [shown, setShown] = useState<{ result: TraceResult; options: TraceOptions } | null>(null)
  const preview = shown?.result ?? null
  const working = shown?.options !== options
  const [applying, setApplying] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const change = (patch: Partial<TraceOptions>) => setOptions((now) => ({ ...now, ...patch }))

  useEffect(() => {
    if (applying !== null) return
    let stale = false
    const timer = window.setTimeout(() => {
      void runTrace({ ...small, data: small.data.slice() }, options).then((result) => {
        if (!stale && result) setShown({ result, options })
      })
    }, PREVIEW_WAIT)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [small, options, applying])

  useEffect(() => {
    if (preview && canvasRef.current) drawPreview(canvasRef.current, preview)
  }, [preview])

  // Closing the window stops any tracing still going on.
  useEffect(() => () => stopTrace(), [])

  async function apply() {
    if (applying !== null) return
    setApplying(0)
    const full = tracePicture(source, TRACE_SIDE.most, TRACE_SIDE.least)
    const result = await runTrace(full, options, (share) => setApplying(share))
    if (!result) {
      setApplying(null)
      return
    }
    onApply(result)
  }

  const status =
    applying !== null
      ? t('Making the shapes… {percent}%', { percent: Math.round(applying * 100) })
      : working && !preview
        ? t('Working…')
        : preview && preview.colors.length === 0
          ? t('Nothing to turn into shapes with these choices. Try another setting.')
          : preview?.colors.length === 1
            ? t('1 color')
            : t('{colors} colors', { colors: preview?.colors.length ?? 0 })

  const colorPosition = (options.colors - MIN_COLORS) / (MAX_COLORS - MIN_COLORS)

  return (
    <Dialog
      title={t('Turn into shapes')}
      subtitle={t('“{name}” becomes sharp shapes that stay crisp at any size and can be recolored. The picture stays hidden below, so nothing is lost.', { name })}
      submitLabel={t('Turn into shapes')}
      submitDisabled={applying !== null}
      onSubmit={() => void apply()}
      onClose={onClose}
    >
      <div>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('Preview of the shapes')}
          className="block w-full rounded-lg border border-line"
          style={{ height: PREVIEW_HEIGHT, background: 'repeating-conic-gradient(#e8eaee 0% 25%, #ffffff 0% 50%) 50% / 12px 12px', opacity: working && preview ? 0.6 : 1 }}
        />
        <p role="status" className="mt-2 text-xs text-ink-2">
          {status}
        </p>
      </div>

      <Field label={t('Kind')} help={t('Black & white makes one ink shape, for signatures, stamps and sketches. Colors keeps the main colors, for logos and cartoons.')}>
        <ChoiceGroup<TraceMode>
          name={t('Kind')}
          value={options.mode}
          options={[
            { value: 'ink', label: t('Black & white'), description: t('One ink color, like a signature, a stamp or a pencil sketch.') },
            { value: 'colors', label: t('Colors'), description: t('Keeps the main colors, like a logo, a cartoon or a drawing.') },
          ]}
          onChange={(mode) => change({ mode })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {options.mode === 'colors' ? (
          <Slider
            label={t('Colors')}
            help={t('How many colors to keep. Fewer colors give simpler shapes.')}
            value={colorPosition}
            display={String(options.colors)}
            step={1 / (MAX_COLORS - MIN_COLORS)}
            onChange={(position) => change({ colors: Math.round(MIN_COLORS + position * (MAX_COLORS - MIN_COLORS)) })}
          />
        ) : (
          <Slider
            label={t('Ink amount')}
            help={t('Move right to turn lighter parts into ink too, or left to keep only the darkest lines.')}
            value={options.cutoff}
            display={`${Math.round(options.cutoff * 100)}%`}
            onChange={(cutoff) => change({ cutoff })}
          />
        )}
        <Slider
          label={t('Detail')}
          help={t('Less detail gives smoother, simpler shapes. More detail copies the picture more closely, small dots included.')}
          value={options.detail}
          display={`${Math.round(options.detail * 100)}%`}
          onChange={(detail) => change({ detail })}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={options.dropBackground} onChange={(e) => change({ dropBackground: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="block text-[13px] font-medium text-ink">{t('Leave out the background')}</span>
          <span className="block text-xs leading-relaxed text-ink-2">{t('Leaves out the color around the edge of the picture (often white paper), so only the drawing becomes shapes.')}</span>
        </span>
      </label>
    </Dialog>
  )
}
