import { ArrowLeftRight, Blend, Circle, ImagePlus, MoveRight, Square, X } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { cssGradient, GRADIENT_PRESETS, reverseGradient, sameGradient, stopAt, type Gradient, type GradientType } from '../editor/gradient.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

// A light checkerboard behind see-through colors.
const CHECKER = 'repeating-conic-gradient(#e8eaee 0 25%, #ffffff 0 50%) 0 0 / 10px 10px'

interface GradientEditorProps {
  gradient: Gradient
  // The color stop the Color panel colors.
  stop: number
  onStop: (index: number) => void
  // `mergeKey` joins quick repeated changes (dragging) into one undo step.
  onChange: (gradient: Gradient, label: string, mergeKey?: string) => void
}

const TYPES: { value: GradientType; label: string; icon: typeof MoveRight; description: string }[] = live([
  { value: 'linear', label: msg('Straight'), icon: MoveRight, description: msg('The colors fade from one side to the other (a linear gradient). Choose which way with Direction.') },
  { value: 'radial', label: msg('Round'), icon: Circle, description: msg('The colors fade out from the middle in circles (a radial gradient), like a glow.') },
])

function describeAngle(angle: number): string {
  const names = [t('Left to right'), t('Top left to bottom right'), t('Top to bottom'), t('Top right to bottom left'), t('Right to left'), t('Bottom right to top left'), t('Bottom to top'), t('Bottom left to top right')]
  return `${names[Math.round(((angle % 360) + 360) % 360 / 45) % 8]}.`
}

// Ready-made gradients, a bar to place the colors on, and which way the colors run.
export function GradientEditor({ gradient, stop, onStop, onChange }: GradientEditorProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; index: number; moved: boolean } | null>(null)
  const selected = gradient.stops[Math.min(stop, gradient.stops.length - 1)]

  function positionAt(clientX: number): number {
    const rect = barRef.current!.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 1000) / 1000
  }

  function setStop(index: number, patch: Partial<Gradient['stops'][number]>, label: string, mergeKey?: string) {
    onChange({ ...gradient, stops: gradient.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) }, label, mergeKey)
  }

  // A click on the bar adds a color there, matching what the gradient already shows.
  function addStop(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const at = positionAt(event.clientX)
    onChange({ ...gradient, stops: [...gradient.stops, stopAt(gradient, at)] }, t('Add gradient color'))
    onStop(gradient.stops.length)
  }

  function removeStop() {
    if (gradient.stops.length <= 2) return
    onChange({ ...gradient, stops: gradient.stops.filter((_, i) => i !== stop) }, t('Remove gradient color'))
    onStop(Math.max(0, stop - 1))
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t("Ready-made gradients")} className="flex flex-wrap gap-1.5">
        {GRADIENT_PRESETS.map((preset) => {
          const chosen = sameGradient(preset.gradient, gradient)
          return (
            <Tooltip key={preset.name} title={preset.name} description={t("A ready-made gradient. Change its colors afterwards if you like.")} className="flex">
              <button
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={preset.name}
                onClick={() => {
                  onChange(preset.gradient, t('{name} gradient', { name: preset.name }))
                  onStop(0)
                }}
                className={`h-7 w-7 rounded-full border transition-shadow ${chosen ? 'border-accent ring-2 ring-accent/40' : 'border-[rgb(16_24_40/0.15)] hover:ring-2 hover:ring-line'}`}
                style={{ background: `${cssGradient(preset.gradient)}, ${CHECKER}` }}
              />
            </Tooltip>
          )
        })}
      </div>

      <div>
        <Tooltip
          title={t("Gradient colors")}
          description={t("Each small marker is one color. Click a marker to choose its color in the Color panel, and drag it to move where that color is. Click the bar to add another color.")}
          className="flex flex-col"
        >
          <div
            ref={barRef}
            role="group"
            aria-label={t("Gradient colors")}
            onPointerDown={addStop}
            className="relative h-6 cursor-copy rounded-md border border-[rgb(16_24_40/0.15)]"
            style={{ background: `${cssGradient(gradient, true)}, ${CHECKER}` }}
          >
            {gradient.stops.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('Gradient color {number}', { number: i + 1 })}
                aria-pressed={i === stop}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragRef.current = { pointerId: event.pointerId, index: i, moved: false }
                  onStop(i)
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current
                  if (!drag || drag.pointerId !== event.pointerId) return
                  drag.moved = true
                  setStop(drag.index, { at: positionAt(event.clientX) }, t('Move gradient color'), `gradient-move-${drag.index}`)
                }}
                onPointerUp={() => (dragRef.current = null)}
                onPointerCancel={() => (dragRef.current = null)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.1 : 0.01
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault()
                    const at = Math.max(0, Math.min(1, s.at + (event.key === 'ArrowRight' ? step : -step)))
                    setStop(i, { at: Math.round(at * 1000) / 1000 }, t('Move gradient color'), `gradient-move-${i}`)
                  }
                }}
                className={`absolute top-1/2 h-7 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-[5px] border-2 shadow-sm ${
                  i === stop ? 'border-accent ring-2 ring-accent/30' : 'border-white ring-1 ring-[rgb(16_24_40/0.3)]'
                }`}
                style={{ left: `${s.at * 100}%`, background: s.color }}
              />
            ))}
          </div>
        </Tooltip>
      </div>

      <div className="flex items-end gap-2">
        <Slider
          className="min-w-0 flex-1"
          label={t("See-through")}
          help={t("How see-through the picked color is. All the way right fades it out completely, so what's behind shows.")}
          value={1 - selected.opacity}
          display={`${Math.round((1 - selected.opacity) * 100)}%`}
          onChange={(position) => setStop(stop, { opacity: Math.round((1 - position) * 100) / 100 }, t('Gradient see-through'), `gradient-opacity-${stop}`)}
        />
        {gradient.stops.length > 2 && (
          <Button variant="ghost" className="h-8 shrink-0 px-2 text-[12px]" onClick={removeStop} tip={{ title: t('Remove color'), description: t('Take the picked color out of the gradient.') }}>
            <X size={14} />
            {t('Remove')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label={t("Gradient kind")} className="flex shrink-0 gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
          {TYPES.map((type) => (
            <Tooltip key={type.value} title={type.label} description={type.description}>
              <button
                type="button"
                role="radio"
                aria-checked={gradient.type === type.value}
                aria-label={type.label}
                onClick={() => onChange({ ...gradient, type: type.value }, type.value === 'radial' ? t('Round gradient') : t('Straight gradient'))}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${
                  gradient.type === type.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <type.icon size={14} strokeWidth={1.9} />
                {type.label}
              </button>
            </Tooltip>
          ))}
        </div>
        <Button variant="ghost" className="h-8 px-2 text-[12px]" onClick={() => onChange(reverseGradient(gradient), t('Flip gradient'))} tip={{ title: t('Flip colors'), description: t('Swap the colors around, so the gradient runs the other way.') }}>
          <ArrowLeftRight size={14} />
          {t('Flip')}
        </Button>
      </div>

      {gradient.type === 'linear' && (
        <Slider
          label={t("Direction")}
          help={t("Which way the colors run across the shape. Hold Shift while using the arrow keys to turn in bigger steps.")}
          value={(((gradient.angle % 360) + 360) % 360) / 360}
          display={`${Math.round(((gradient.angle % 360) + 360) % 360)}°`}
          note={describeAngle(gradient.angle)}
          step={1 / 360}
          onChange={(position) => onChange({ ...gradient, angle: Math.round(position * 360) % 360 }, t('Gradient direction'), 'gradient-angle')}
        />
      )}
    </div>
  )
}

interface FillKindSwitchProps {
  label: string
  kind: 'color' | 'gradient' | 'photo'
  // What each choice does, for its hover help.
  colorHelp: string
  gradientHelp: string
  onChange: (kind: 'color' | 'gradient') => void
  // Offers a photo too: picking it asks for one.
  photo?: { help: string; onChoose: () => void }
}

// One plain color or colors fading into each other (or a photo).
export function FillKindSwitch({ label, kind, colorHelp, gradientHelp, onChange, photo }: FillKindSwitchProps) {
  const choices: { kind: 'color' | 'gradient' | 'photo'; label: string; icon: typeof Square; description: string }[] = [
    { kind: 'color', label: t('Color'), icon: Square, description: colorHelp },
    { kind: 'gradient', label: t('Gradient'), icon: Blend, description: gradientHelp },
    ...(photo ? [{ kind: 'photo' as const, label: t('Photo'), icon: ImagePlus, description: photo.help }] : []),
  ]
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
      {choices.map((choice) => (
        <Tooltip key={choice.kind} title={choice.label} description={choice.description}>
          <button
            type="button"
            role="radio"
            aria-checked={kind === choice.kind}
            aria-label={choice.label}
            onClick={() => (choice.kind === 'photo' ? photo?.onChoose() : onChange(choice.kind as 'color' | 'gradient'))}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${
              kind === choice.kind ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <choice.icon size={14} strokeWidth={1.9} />
            {choice.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
