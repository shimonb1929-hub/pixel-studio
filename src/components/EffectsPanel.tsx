import { CircleHelp, Plus, X } from 'lucide-react'
import {
  BLEND_MODES,
  blendInfo,
  defaultGlow,
  defaultOutline,
  defaultShadow,
  EFFECT_LOOKS,
  matchingEffectLook,
  NO_EFFECTS,
  type BlendMode,
  type EffectKind,
  type EffectLook,
  type LayerEffects,
} from '../editor/effects.ts'
import { LookPreview } from './AdjustPanel.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, inputClass, Slider } from './ui.tsx'

interface EffectsPanelProps {
  title: string
  effects: LayerEffects | null
  blend: BlendMode
  // How big effects are on this design: sizes are multiples of it (see effectUnit).
  unit: number
  // Small pictures of the picked object with each ready-made effect, in the same order as EFFECT_LOOKS.
  thumbnails: HTMLCanvasElement[] | null
  // Which effect's color the Color panel is coloring, if any.
  colorTarget: EffectKind | null
  onColorTarget: (target: EffectKind | null) => void
  onLook: (look: EffectLook) => void
  // `slider` names what's being dragged, so one drag is one step to undo.
  onChange: (effects: LayerEffects, label: string, slider?: string) => void
  onBlend: (mode: BlendMode) => void
}

const NAMES: Record<EffectKind, string> = { shadow: 'Shadow', glow: 'Glow', outline: 'Outline' }
const HELP: Record<EffectKind, string> = {
  shadow: 'A shadow behind it, which makes it stand out from the page.',
  glow: 'A soft light all around it.',
  outline: 'A line all the way around the outside of it, following its shape, even around letters and cut-out photos.',
}

// Sliders are finer near zero, where small changes show most.
const toSlider = (value: number, max: number) => Math.sqrt(Math.min(1, value / max))
const fromSlider = (position: number, max: number) => Math.round(position * position * max)

const DIRECTIONS = ['right', 'down and right', 'down', 'down and left', 'left', 'up and left', 'up', 'up and right']

function directionName(angle: number): string {
  return DIRECTIONS[Math.round((((angle % 360) + 360) % 360) / 45) % 8]
}

function EffectHeader({
  kind,
  on,
  color,
  coloring,
  onToggle,
  onColor,
}: {
  kind: EffectKind
  on: boolean
  color: string | undefined
  coloring: boolean
  onToggle: () => void
  onColor: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Tooltip title={NAMES[kind]} description={HELP[kind]}>
        <h3 className="cursor-help text-[12px] font-semibold text-ink">{NAMES[kind]}</h3>
      </Tooltip>
      <div className="flex items-center gap-1">
        {on && color && (
          <Tooltip title={`${NAMES[kind]} color`} description="While this is picked, the Color panel above colors it." className="flex">
            <button
              type="button"
              aria-label={`${NAMES[kind]} color`}
              aria-pressed={coloring}
              onClick={onColor}
              className={`flex h-7 items-center gap-1.5 rounded-lg border px-1.5 text-[11px] font-medium transition-colors ${
                coloring ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <span className="h-4 w-4 rounded border border-[rgb(16_24_40/0.15)]" style={{ background: color }} aria-hidden />
              Color
            </button>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          className="h-7 px-2 text-[12px]"
          onClick={onToggle}
          aria-label={on ? `Remove ${NAMES[kind].toLowerCase()}` : `Add ${NAMES[kind].toLowerCase()}`}
          tip={{ title: on ? `Remove ${NAMES[kind].toLowerCase()}` : `Add ${NAMES[kind].toLowerCase()}`, description: HELP[kind] }}
        >
          {on ? <X size={14} /> : <Plus size={14} />}
          {on ? 'Remove' : 'Add'}
        </Button>
      </div>
    </div>
  )
}

// Shadow, glow and outline around the picked object, and how it mixes with what's below.
export function EffectsPanel(props: EffectsPanelProps) {
  const { unit, onChange } = props
  const effects = props.effects ?? NO_EFFECTS
  const { shadow, glow, outline } = effects
  const current = matchingEffectLook(effects, unit)
  const big = 200 * unit
  const blend = blendInfo(props.blend)

  const toggle = (kind: EffectKind) => {
    if (effects[kind]) {
      if (props.colorTarget === kind) props.onColorTarget(null)
      onChange({ ...effects, [kind]: null }, `Remove ${NAMES[kind].toLowerCase()}`)
      return
    }
    const added = kind === 'shadow' ? defaultShadow(unit) : kind === 'glow' ? defaultGlow(unit) : defaultOutline(unit)
    onChange({ ...effects, [kind]: added }, `Add ${NAMES[kind].toLowerCase()}`)
  }
  const colorButton = (kind: EffectKind) => () => props.onColorTarget(props.colorTarget === kind ? null : kind)

  return (
    <section aria-label="Effects" className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip
          title="Effects"
          description="Add a shadow, a glow or an outline, and choose how it mixes with what's below. What's on it never changes, so you can change or remove effects any time."
        >
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            <span className="truncate">Effects: {props.title}</span>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div role="radiogroup" aria-label="Ready-made effects" className="grid grid-cols-3 gap-1.5">
        {EFFECT_LOOKS.map((look, i) => (
          <Tooltip key={look.id} title={look.name} description={look.description} className="flex">
            <button
              type="button"
              role="radio"
              aria-checked={current?.id === look.id}
              aria-label={look.name}
              onClick={() => props.onLook(look)}
              className={`flex w-full flex-col items-center justify-start gap-1 rounded-lg p-1 pb-1.5 transition-colors ${
                current?.id === look.id ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <LookPreview source={props.thumbnails?.[i]} />
              <span className="text-center text-[11px] font-medium leading-tight">{look.name}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
        <EffectHeader kind="shadow" on={!!shadow} color={shadow?.color} coloring={props.colorTarget === 'shadow'} onToggle={() => toggle('shadow')} onColor={colorButton('shadow')} />
        {shadow && (
          <div className="flex flex-col gap-2.5">
            <Slider
              label="Strength"
              help="How dark the shadow is."
              value={shadow.opacity}
              display={`${Math.round(shadow.opacity * 100)}%`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, opacity: Math.round(p * 100) / 100 } }, 'Shadow strength', 'shadow-opacity')}
            />
            <Slider
              label="Softness"
              help="How soft the shadow's edge is. All the way left is a hard, sharp shadow."
              value={toSlider(shadow.blur, big)}
              display={`${shadow.blur} px`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, blur: fromSlider(p, big) } }, 'Shadow softness', 'shadow-blur')}
            />
            <Slider
              label="Distance"
              help="How far the shadow falls from the object. Farther makes it look higher above the page."
              value={toSlider(shadow.distance, big)}
              display={`${shadow.distance} px`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, distance: fromSlider(p, big) } }, 'Shadow distance', 'shadow-distance')}
            />
            <Slider
              label="Direction"
              help="Which way the shadow falls, as if the light comes from the other side."
              value={shadow.angle / 360}
              display={`${Math.round(shadow.angle)}°`}
              note={`The shadow falls ${directionName(shadow.angle)}.`}
              step={1 / 360}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, angle: Math.round(p * 360) } }, 'Shadow direction', 'shadow-angle')}
            />
          </div>
        )}

        <EffectHeader kind="glow" on={!!glow} color={glow?.color} coloring={props.colorTarget === 'glow'} onToggle={() => toggle('glow')} onColor={colorButton('glow')} />
        {glow && (
          <div className="flex flex-col gap-2.5">
            <Slider
              label="Strength"
              help="How bright the glow is."
              value={glow.opacity}
              display={`${Math.round(glow.opacity * 100)}%`}
              onChange={(p) => onChange({ ...effects, glow: { ...glow, opacity: Math.round(p * 100) / 100 } }, 'Glow strength', 'glow-opacity')}
            />
            <Slider
              label="Size"
              help="How far the glow reaches."
              value={toSlider(glow.size, big)}
              display={`${glow.size} px`}
              onChange={(p) => onChange({ ...effects, glow: { ...glow, size: fromSlider(p, big) } }, 'Glow size', 'glow-size')}
            />
          </div>
        )}

        <EffectHeader kind="outline" on={!!outline} color={outline?.color} coloring={props.colorTarget === 'outline'} onToggle={() => toggle('outline')} onColor={colorButton('outline')} />
        {outline && (
          <Slider
            label="Width"
            help="How thick the outline is."
            value={toSlider(outline.width, 60 * unit)}
            display={`${outline.width} px`}
            onChange={(p) => onChange({ ...effects, outline: { ...outline, width: Math.max(1, fromSlider(p, 60 * unit)) } }, 'Outline width', 'outline-width')}
          />
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <Tooltip title="Mix with what's below" description={blend.description} note={blend.mode === 'normal' ? undefined : `Other programs call this ${blend.proName}.`} noteTone="info" className="flex flex-col gap-1">
          <label htmlFor="blend-mode" className="text-[11px] font-medium text-ink-2">
            Mix with what's below
          </label>
          <select id="blend-mode" className={inputClass} value={blend.mode} onChange={(e) => props.onBlend(e.target.value as BlendMode)}>
            {BLEND_MODES.filter((b) => b.common).map((b) => (
              <option key={b.mode} value={b.mode}>
                {b.name}
              </option>
            ))}
            <optgroup label="More">
              {BLEND_MODES.filter((b) => !b.common).map((b) => (
                <option key={b.mode} value={b.mode}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Tooltip>
      </div>
    </section>
  )
}
