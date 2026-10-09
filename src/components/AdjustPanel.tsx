import { CircleHelp, RotateCcw } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import {
  ADJUSTMENT_NAMES,
  describeAdjustment,
  isNeutral,
  LOOKS,
  matchingLook,
  NO_ADJUSTMENTS,
  TWO_WAY,
  type AdjustmentKey,
  type Adjustments,
} from '../editor/adjust.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

const HELP: Record<AdjustmentKey, string> = {
  brightness: 'Makes it lighter or darker. Pure black and pure white stay as they are.',
  contrast: 'The difference between the light and dark parts. More makes it punchy; less makes it soft and flat.',
  saturation: 'How strong the colors are. All the way to the left is black and white.',
  warmth: 'To the right is warmer and more golden, like sunshine. To the left is cooler and more blue.',
  blur: 'Makes it soft and out of focus.',
  sharpen: 'Makes edges and small details crisper.',
}

const GROUPS: { title: string; keys: AdjustmentKey[] }[] = [
  { title: 'Light', keys: ['brightness', 'contrast'] },
  { title: 'Color', keys: ['saturation', 'warmth'] },
  { title: 'Detail', keys: ['blur', 'sharpen'] },
]

const PREVIEW_WIDTH = 66
const PREVIEW_HEIGHT = 50

// A look's small picture, fitted into its tile over gray-and-white squares.
function LookPreview({ source }: { source: HTMLCanvasElement | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = PREVIEW_WIDTH * dpr
    canvas.height = PREVIEW_HEIGHT * dpr
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!source) return
    const scale = Math.min(canvas.width / source.width, canvas.height / source.height)
    const w = source.width * scale
    const h = source.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2
    const square = 4 * dpr
    for (let row = 0; row * square < h; row++) {
      for (let col = 0; col * square < w; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#e8eaee' : '#ffffff'
        ctx.fillRect(x + col * square, y + row * square, Math.min(square, w - col * square), Math.min(square, h - row * square))
      }
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, x, y, w, h)
  }, [source])

  return <canvas ref={ref} aria-hidden className="block rounded-md" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }} />
}

function sliderDisplay(key: AdjustmentKey, value: number): string {
  const amount = Math.round(value * 100)
  if (!TWO_WAY[key] || amount === 0) return String(amount)
  return amount > 0 ? `+${amount}` : `−${-amount}`
}

interface AdjustPanelProps {
  settings: Adjustments
  // Small pictures of each look, in the same order as LOOKS.
  thumbnails: HTMLCanvasElement[] | null
  // Why nothing can be adjusted right now, if that's the case.
  blocked: string | null
  onChange: (settings: Adjustments) => void
}

export function AdjustPanel({ settings, thumbnails, blocked, onChange }: AdjustPanelProps) {
  const current = matchingLook(settings)

  return (
    <section aria-label="Adjust" className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <Tooltip
          title="Adjust"
          description="Change the colors and light of the selected layer, or of the selected part. Try a ready-made look, then fine-tune it with the sliders. Nothing changes for good until you press Apply."
        >
          <h2 className="flex cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            Adjust
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <Button
          variant="ghost"
          className="h-7 px-2 text-[12px]"
          disabled={isNeutral(settings)}
          onClick={() => onChange(NO_ADJUSTMENTS)}
          tip={{
            title: 'Reset',
            description: 'Put every slider back to the middle, as it was.',
            note: isNeutral(settings) ? 'Nothing has changed yet.' : undefined,
          }}
        >
          <RotateCcw size={13} />
          Reset
        </Button>
      </div>

      {blocked ? (
        <p className="text-[13px] leading-snug text-ink-2">{blocked}</p>
      ) : (
        <>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Looks</h3>
          <div role="radiogroup" aria-label="Looks" className="grid grid-cols-3 gap-1.5">
            {LOOKS.map((look, i) => (
              <Tooltip key={look.id} title={look.name} description={look.description} className="flex">
                <button
                  type="button"
                  role="radio"
                  aria-checked={current?.id === look.id}
                  aria-label={look.name}
                  onClick={() => onChange(look.settings)}
                  className={`flex w-full flex-col items-center justify-start gap-1 rounded-lg p-1 pb-1.5 transition-colors ${
                    current?.id === look.id ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                  }`}
                >
                  <LookPreview source={thumbnails?.[i]} />
                  <span className="text-center text-[11px] font-medium leading-tight">{look.name}</span>
                </button>
              </Tooltip>
            ))}
          </div>

          {GROUPS.map((group) => (
            <div key={group.title} className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group.title}</h3>
              <div className="flex flex-col gap-2.5">
                {group.keys.map((key) => {
                  const twoWay = TWO_WAY[key]
                  const value = settings[key]
                  return (
                    <Slider
                      key={key}
                      label={ADJUSTMENT_NAMES[key]}
                      help={HELP[key]}
                      value={twoWay ? (value + 1) / 2 : value}
                      origin={twoWay ? 0.5 : 0}
                      // One step is one point on the -100 to +100 scale.
                      step={twoWay ? 0.005 : 0.01}
                      display={sliderDisplay(key, value)}
                      note={describeAdjustment(key, value)}
                      onChange={(position) => {
                        const next = Math.round((twoWay ? position * 2 - 1 : position) * 100) / 100
                        onChange({ ...settings, [key]: next })
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
