import { ChevronDown, CircleHelp, Plus, X } from 'lucide-react'
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
import { live, msg, t, tParts } from '../i18n/i18n.ts'

interface EffectsPanelProps {
  title: string
  // Folded away it is one line, so the Layers panel stays in view; it opens with a click.
  open: boolean
  onOpen: (open: boolean) => void
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

const NAMES: Record<EffectKind, string> = live({ shadow: msg('Shadow'), glow: msg('Glow'), outline: msg('Outline') })
const COLOR_NAMES: Record<EffectKind, string> = live({ shadow: msg('Shadow color'), glow: msg('Glow color'), outline: msg('Outline color') })
const ADD: Record<EffectKind, string> = live({ shadow: msg('Add shadow'), glow: msg('Add glow'), outline: msg('Add outline') })
const REMOVE: Record<EffectKind, string> = live({ shadow: msg('Remove shadow'), glow: msg('Remove glow'), outline: msg('Remove outline') })
const HELP: Record<EffectKind, string> = live({
  shadow: msg('A shadow behind it, which makes it stand out from the page.'),
  glow: msg('A soft light all around it.'),
  outline: msg('A line all the way around the outside of it, following its shape, even around letters and cut-out photos.'),
})

// Sliders are finer near zero, where small changes show most.
const toSlider = (value: number, max: number) => Math.sqrt(Math.min(1, value / max))
const fromSlider = (position: number, max: number) => Math.round(position * position * max)

const DIRECTIONS = live([
  msg('The shadow falls to the right.'),
  msg('The shadow falls down and to the right.'),
  msg('The shadow falls down.'),
  msg('The shadow falls down and to the left.'),
  msg('The shadow falls to the left.'),
  msg('The shadow falls up and to the left.'),
  msg('The shadow falls up.'),
  msg('The shadow falls up and to the right.'),
])

function directionName(angle: number): string {
  return DIRECTIONS[Math.round((((angle % 360) + 360) % 360) / 45) % 8]
}

// A few words for the folded header: what's on it now.
function summary(effects: LayerEffects, look: EffectLook | undefined, blend: BlendMode): string {
  const kinds = (Object.keys(NAMES) as EffectKind[]).filter((kind) => effects[kind])
  const words = look ? look.name : kinds.map((kind) => NAMES[kind]).join(', ')
  if (blend === 'normal') return words
  const mix = blendInfo(blend).name
  return kinds.length ? `${words}, ${mix}` : mix
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
          <Tooltip title={COLOR_NAMES[kind]} description={t("While this is picked, the Color panel below colors it.")} className="flex">
            <button
              type="button"
              aria-label={COLOR_NAMES[kind]}
              aria-pressed={coloring}
              onClick={onColor}
              className={`flex h-7 items-center gap-1.5 rounded-lg border px-1.5 text-[11px] font-medium transition-colors ${
                coloring ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <span className="h-4 w-4 rounded border border-[rgb(16_24_40/0.15)]" style={{ background: color }} aria-hidden />
              {t('Color')}
            </button>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          className="h-7 px-2 text-[12px]"
          onClick={onToggle}
          aria-label={on ? REMOVE[kind] : ADD[kind]}
          tip={{ title: on ? REMOVE[kind] : ADD[kind], description: HELP[kind] }}
        >
          {on ? <X size={14} /> : <Plus size={14} />}
          {on ? t('Remove') : t('Add')}
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
      onChange({ ...effects, [kind]: null }, REMOVE[kind])
      return
    }
    const added = kind === 'shadow' ? defaultShadow(unit) : kind === 'glow' ? defaultGlow(unit) : defaultOutline(unit)
    onChange({ ...effects, [kind]: added }, ADD[kind])
  }
  const colorButton = (kind: EffectKind) => () => props.onColorTarget(props.colorTarget === kind ? null : kind)

  return (
    <section aria-label={t("Effects")} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className={`flex items-center justify-between gap-2 ${props.open ? 'mb-3' : ''}`}>
        <Tooltip
          title={t("Effects")}
          description={t("Add a shadow, a glow or an outline, and choose how it mixes with what's below. What's on it never changes, so you can change or remove effects any time.")}
          className="flex min-w-0 flex-1"
        >
          <button
            type="button"
            aria-expanded={props.open}
            onClick={() => props.onOpen(!props.open)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-start text-[13px] font-semibold text-ink"
          >
            <span className="truncate">{tParts('Effects: {name}', { name: <bdi key="name">{props.title}</bdi> })}</span>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
            <span className="ms-auto flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-2">
              {!props.open && summary(effects, current, props.blend)}
              <ChevronDown size={16} className={`text-ink-3 transition-transform ${props.open ? 'rotate-180' : ''}`} aria-hidden />
            </span>
          </button>
        </Tooltip>
      </div>

      {props.open && (
        <>
      <div role="radiogroup" aria-label={t("Ready-made effects")} className="grid grid-cols-3 gap-1.5">
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
              label={t("Strength")}
              help={t("How dark the shadow is.")}
              value={shadow.opacity}
              display={`${Math.round(shadow.opacity * 100)}%`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, opacity: Math.round(p * 100) / 100 } }, t('Shadow strength'), 'shadow-opacity')}
            />
            <Slider
              label={t("Softness")}
              help={t("How soft the shadow's edge is. All the way left is a hard, sharp shadow.")}
              value={toSlider(shadow.blur, big)}
              display={`${shadow.blur} px`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, blur: fromSlider(p, big) } }, t('Shadow softness'), 'shadow-blur')}
            />
            <Slider
              label={t("Distance")}
              help={t("How far the shadow falls from the object. Farther makes it look higher above the page.")}
              value={toSlider(shadow.distance, big)}
              display={`${shadow.distance} px`}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, distance: fromSlider(p, big) } }, t('Shadow distance'), 'shadow-distance')}
            />
            <Slider
              label={t("Direction")}
              help={t("Which way the shadow falls, as if the light comes from the other side.")}
              value={shadow.angle / 360}
              display={`${Math.round(shadow.angle)}°`}
              note={directionName(shadow.angle)}
              step={1 / 360}
              onChange={(p) => onChange({ ...effects, shadow: { ...shadow, angle: Math.round(p * 360) } }, t('Shadow direction'), 'shadow-angle')}
            />
          </div>
        )}

        <EffectHeader kind="glow" on={!!glow} color={glow?.color} coloring={props.colorTarget === 'glow'} onToggle={() => toggle('glow')} onColor={colorButton('glow')} />
        {glow && (
          <div className="flex flex-col gap-2.5">
            <Slider
              label={t("Strength")}
              help={t("How bright the glow is.")}
              value={glow.opacity}
              display={`${Math.round(glow.opacity * 100)}%`}
              onChange={(p) => onChange({ ...effects, glow: { ...glow, opacity: Math.round(p * 100) / 100 } }, t('Glow strength'), 'glow-opacity')}
            />
            <Slider
              label={t("Size")}
              help={t("How far the glow reaches.")}
              value={toSlider(glow.size, big)}
              display={`${glow.size} px`}
              onChange={(p) => onChange({ ...effects, glow: { ...glow, size: fromSlider(p, big) } }, t('Glow size'), 'glow-size')}
            />
          </div>
        )}

        <EffectHeader kind="outline" on={!!outline} color={outline?.color} coloring={props.colorTarget === 'outline'} onToggle={() => toggle('outline')} onColor={colorButton('outline')} />
        {outline && (
          <Slider
            label={t("Width")}
            help={t("How thick the outline is.")}
            value={toSlider(outline.width, 60 * unit)}
            display={`${outline.width} px`}
            onChange={(p) => onChange({ ...effects, outline: { ...outline, width: Math.max(1, fromSlider(p, 60 * unit)) } }, t('Outline width'), 'outline-width')}
          />
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <Tooltip title={t("Mix with what's below")} description={blend.description} note={blend.mode === 'normal' ? undefined : t('Other programs call this {name}.', { name: blend.proName })} noteTone="info" className="flex flex-col gap-1">
          <label htmlFor="blend-mode" className="text-[11px] font-medium text-ink-2">
            {t("Mix with what's below")}
          </label>
          <select id="blend-mode" className={inputClass} value={blend.mode} onChange={(e) => props.onBlend(e.target.value as BlendMode)}>
            {BLEND_MODES.filter((b) => b.common).map((b) => (
              <option key={b.mode} value={b.mode}>
                {b.name}
              </option>
            ))}
            <optgroup label={t("More")}>
              {BLEND_MODES.filter((b) => !b.common).map((b) => (
                <option key={b.mode} value={b.mode}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Tooltip>
      </div>
        </>
      )}
    </section>
  )
}
