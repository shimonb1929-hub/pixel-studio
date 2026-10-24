import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CURVE_CHANNELS, curveTable, isStraightCurve, type CurveChannel, type CurvePoint, type ToneCurves } from '../editor/adjust.ts'
import { live, msg, t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'

const STRAIGHT: CurvePoint[] = [
  [0, 0],
  [1, 1],
]

const CHANNEL_NAMES: Record<CurveChannel, string> = live({ all: msg('All'), red: msg('Red'), green: msg('Green'), blue: msg('Blue') })
const CHANNEL_HELP: Record<CurveChannel, string> = live({
  all: msg('Changes the light of every color together.'),
  red: msg('Changes only the red light: up adds red, down adds its opposite, cyan.'),
  green: msg('Changes only the green light: up adds green, down adds its opposite, pink.'),
  blue: msg('Changes only the blue light: up adds blue, down adds its opposite, yellow.'),
})
const CHANNEL_COLORS: Record<CurveChannel, string> = { all: 'var(--color-ink)', red: '#e5484d', green: '#30a46c', blue: '#3b5bfd' }

// The box is drawn 0 to 1 both ways; this much space around it lets points sit on its edges.
const PAD = 0.04
// Dragging a point this far out of the box takes it away.
const REMOVE_DISTANCE = 0.12

function pathFor(points: CurvePoint[]): string {
  const table = curveTable(points)
  let d = ''
  for (let i = 0; i <= 64; i++) {
    const x = i / 64
    const y = table[Math.round(x * 255)]
    d += `${i ? 'L' : 'M'}${x.toFixed(4)} ${(1 - y).toFixed(4)}`
  }
  return d
}

// A faint picture of how many pixels have each tone, from darkest to brightest.
function histogramPath(counts: Uint32Array): string {
  let most = 0
  for (const c of counts) most = Math.max(most, c)
  if (!most) return ''
  let d = 'M0 1'
  for (let i = 0; i < 256; i++) d += `L${(i / 255).toFixed(4)} ${(1 - Math.sqrt(counts[i] / most) * 0.9).toFixed(4)}`
  return `${d}L1 1Z`
}

interface CurveEditorProps {
  curves: ToneCurves | undefined
  // How many pixels of the photo have each tone, 0 to 255.
  histogram: Uint32Array | null
  onChange: (curves: ToneCurves) => void
}

// The light curve: a line from the darkest tones (left) to the brightest (right). Dragging it up
// makes those tones lighter, down makes them darker.
export function CurveEditor({ curves, histogram, onChange }: CurveEditorProps) {
  const [channel, setChannel] = useState<CurveChannel>('all')
  const [dragging, setDragging] = useState<number | null>(null)
  const box = useRef<SVGSVGElement>(null)
  const points = curves?.[channel] ?? STRAIGHT

  const setPoints = (next: CurvePoint[]) => onChange({ ...curves, [channel]: next })

  // Where the pointer is, 0 to 1 from the bottom-left of the box.
  function at(event: PointerEvent): CurvePoint {
    const rect = box.current!.getBoundingClientRect()
    const size = 1 + 2 * PAD
    return [((event.clientX - rect.left) / rect.width) * size - PAD, 1 - (((event.clientY - rect.top) / rect.height) * size - PAD)]
  }

  // A point can't pass its neighbors, so the line always goes from dark to bright.
  function place(index: number, [x, y]: CurvePoint, list: CurvePoint[]): CurvePoint {
    const lo = index === 0 ? 0 : list[index - 1][0] + 0.01
    const hi = index === list.length - 1 ? 1 : list[index + 1][0] - 0.01
    const round = (v: number) => Math.round(v * 1000) / 1000
    return [round(Math.min(hi, Math.max(lo, x))), round(Math.min(1, Math.max(0, y)))]
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    const [x, y] = at(event)
    if (x < 0 || x > 1) return
    // Pressing near a point picks it up; anywhere else adds a new one there.
    let index = points.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 0.06)
    let list = points
    if (index < 0) {
      index = points.findIndex(([px]) => px > x)
      if (index <= 0) return
      list = [...points.slice(0, index), [x, y] as CurvePoint, ...points.slice(index)]
      list[index] = place(index, [x, y], list)
      setPoints(list)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(index)
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (dragging === null) return
    const [x, y] = at(event)
    const ends = dragging === 0 || dragging === points.length - 1
    const outside = Math.max(-x, x - 1, -y, y - 1)
    if (!ends && outside > REMOVE_DISTANCE) {
      setPoints(points.filter((_, i) => i !== dragging))
      setDragging(null)
      return
    }
    const next = [...points]
    next[dragging] = place(dragging, [x, y], points)
    setPoints(next)
  }

  function remove(index: number) {
    if (index === 0 || index === points.length - 1) return
    setPoints(points.filter((_, i) => i !== index))
  }

  function onPointKey(event: KeyboardEvent, index: number) {
    const step = event.shiftKey ? 0.1 : 0.01
    const move: Record<string, [number, number]> = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }
    if (event.key === 'Delete' || event.key === 'Backspace') remove(index)
    else if (move[event.key]) {
      const next = [...points]
      next[index] = place(index, [points[index][0] + move[event.key][0], points[index][1] + move[event.key][1]], points)
      setPoints(next)
    } else return
    event.preventDefault()
    event.stopPropagation()
  }

  const view = `${-PAD} ${-PAD} ${1 + 2 * PAD} ${1 + 2 * PAD}`
  const changed = !isStraightCurve(curves?.[channel])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t('Which light')} className="flex gap-1">
          {CURVE_CHANNELS.map((c) => (
            <Tooltip key={c} title={CHANNEL_NAMES[c]} description={CHANNEL_HELP[c]} side="bottom">
              <button
                type="button"
                role="radio"
                aria-checked={channel === c}
                onClick={() => setChannel(c)}
                className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors ${
                  channel === c ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                }`}
              >
                {c !== 'all' && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLORS[c] }} />}
                {CHANNEL_NAMES[c]}
              </button>
            </Tooltip>
          ))}
        </div>
        <button
          type="button"
          aria-disabled={!changed || undefined}
          onClick={() => changed && setPoints(STRAIGHT)}
          className="rounded-md px-1.5 py-1 text-[11px] font-medium text-ink-2 hover:bg-subtle hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
        >
          {t('Straighten')}
        </button>
      </div>
      {/* Dark is always on the left, as on the sliders, in every language. */}
      <div dir="ltr" className="rounded-lg border border-line bg-subtle">
        <svg
          ref={box}
          viewBox={view}
          role="group"
          aria-label={t('Light curve')}
          className="block aspect-square w-full touch-none cursor-crosshair select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
        >
          {histogram && <path d={histogramPath(histogram)} fill="var(--color-line)" opacity={0.7} />}
          {[0.25, 0.5, 0.75].map((v) => (
            <g key={v} stroke="var(--color-line)" strokeWidth={0.004}>
              <line x1={v} y1={0} x2={v} y2={1} />
              <line x1={0} y1={v} x2={1} y2={v} />
            </g>
          ))}
          <rect x={0} y={0} width={1} height={1} fill="none" stroke="var(--color-line)" strokeWidth={0.006} />
          <line x1={0} y1={1} x2={1} y2={0} stroke="var(--color-ink-3)" strokeWidth={0.004} strokeDasharray="0.02 0.02" />
          {CURVE_CHANNELS.filter((c) => c !== channel && !isStraightCurve(curves?.[c])).map((c) => (
            <path key={c} d={pathFor(curves![c]!)} fill="none" stroke={CHANNEL_COLORS[c]} strokeWidth={0.008} opacity={0.4} />
          ))}
          <path d={pathFor(points)} fill="none" stroke={CHANNEL_COLORS[channel]} strokeWidth={0.014} strokeLinecap="round" />
          {points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={1 - y}
              r={dragging === i ? 0.032 : 0.026}
              tabIndex={0}
              role="slider"
              aria-label={t('Point {number}', { number: i + 1 })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(y * 100)}
              aria-valuetext={t('Tone {from}% becomes {to}%', { from: Math.round(x * 100), to: Math.round(y * 100) })}
              onKeyDown={(event) => onPointKey(event, i)}
              onDoubleClick={() => remove(i)}
              fill="var(--color-surface)"
              stroke={CHANNEL_COLORS[channel]}
              strokeWidth={0.01}
              className="cursor-grab outline-none focus-visible:stroke-[0.02]"
            />
          ))}
        </svg>
      </div>
      <div dir="ltr" className="flex justify-between text-[10px] text-ink-3">
        <span>{t('Darkest')}</span>
        <span>{t('Brightest')}</span>
      </div>
    </div>
  )
}
