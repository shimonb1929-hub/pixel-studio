import { Check, Copy, X } from 'lucide-react'
import { circleRadius, MAX_COPIES, repeatTotal, type RepeatKind, type RepeatSettings } from '../editor/repeat.ts'
import { live, msg, t } from '../i18n/i18n.ts'
import { ChoiceGroup } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

export interface RepeatPanelState {
  settings: RepeatSettings
  // The bigger side of what is copied, in design pixels: sliders reach a few times it.
  side: number
  onChange: (settings: RepeatSettings) => void
  apply: () => void
  cancel: () => void
}

const KINDS: { value: RepeatKind; label: string; description: string }[] = live([
  { value: 'row', label: msg('Row'), description: msg('Copies side by side, like a border of stars or a row of cups.') },
  { value: 'column', label: msg('Column'), description: msg('Copies one under the other, like steps or a list.') },
  { value: 'grid', label: msg('Grid'), description: msg('Rows and columns of copies, like tiles, stickers on a sheet or a pattern.') },
  { value: 'circle', label: msg('Circle'), description: msg('Copies all the way around a circle, like petals of a flower, a wreath or a clock.') },
  { value: 'mirror', label: msg('Mirror'), description: msg('One copy beside it, flipped like in a mirror, for wings, hearts and anything that matches on both sides.') },
])

// Whole numbers from `low` to `high` on a slider.
const count = (value: number, low: number, high: number) => ({ position: (value - low) / (high - low), from: (p: number) => Math.round(low + p * (high - low)) })

// The small card beside the design while copies are shown: what kind, how many, how far apart, and
// Apply or Cancel. It sits off to the side, so the copies on the design stay in view.
export function RepeatPanel({ state }: { state: RepeatPanelState }) {
  const { settings: s, side, onChange } = state
  const set = (patch: Partial<RepeatSettings>) => onChange({ ...s, ...patch })
  const many = count(s.count, 2, 30)
  const across = count(s.across, 1, 10)
  const down = count(s.down, 1, 10)
  const maxGap = side * 2
  const minRadius = side * 0.5
  const maxRadius = side * 8
  const total = Math.min(MAX_COPIES, repeatTotal(s))
  return (
    <section
      aria-label={t('Make copies')}
      // Arrow keys move the sliders here instead of nudging what's picked; Enter and Esc still apply or cancel.
      onKeyDown={(event) => event.key !== 'Enter' && event.key !== 'Escape' && event.stopPropagation()}
      className="absolute bottom-20 end-3 z-10 flex w-[320px] max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur"
    >
      <Tooltip title={t('Make copies')} description={t('Makes copies of what is picked in a row, a grid or around a circle, kept together with it. Everything stays sharp and changeable.')}>
        <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
          <Copy size={15} className="text-accent" aria-hidden />
          {t('Make copies')}
        </h2>
      </Tooltip>
      <ChoiceGroup<RepeatKind>
        name={t('How to place them')}
        value={s.kind}
        options={KINDS}
        onChange={(kind) => {
          // A circle looks like one with more copies: a few spread round it look like a cross.
          const many = Math.max(s.count, 8)
          set(kind === 'circle' && s.kind !== 'circle' ? { kind, count: many, radius: circleRadius(side, many) } : { kind })
        }}
      />
      {(s.kind === 'row' || s.kind === 'column' || s.kind === 'circle') && (
        <Slider
          label={t('How many')}
          help={t('How many there are in all, with the one you picked.')}
          value={many.position}
          step={1 / 28}
          display={String(s.count)}
          pro="Copies, Instances"
          onChange={(p) => set({ count: many.from(p) })}
        />
      )}
      {s.kind === 'grid' && (
        <>
          <Slider label={t('How many across')} help={t('How many side by side in each row.')} value={across.position} step={1 / 9} display={String(s.across)} pro="Columns" onChange={(p) => set({ across: across.from(p) })} />
          <Slider label={t('How many down')} help={t('How many rows, one under the other.')} value={down.position} step={1 / 9} display={String(s.down)} pro="Rows" onChange={(p) => set({ down: down.from(p) })} />
        </>
      )}
      {s.kind !== 'circle' && (
        <Slider
          label={t('Space between')}
          help={t('How much empty space is left between one copy and the next.')}
          value={s.gap / maxGap}
          display={`${Math.round(s.gap)} px`}
          pro="Spacing, Offset"
          onChange={(p) => set({ gap: Math.round(p * maxGap) })}
        />
      )}
      {s.kind === 'circle' && (
        <>
          <Slider
            label={t('How big a circle')}
            help={t('How far the copies are from the middle of the circle.')}
            value={(s.radius - minRadius) / (maxRadius - minRadius)}
            display={`${Math.round(s.radius)} px`}
            pro="Radius"
            onChange={(p) => set({ radius: Math.round(minRadius + p * (maxRadius - minRadius)) })}
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={s.turn} onChange={(e) => set({ turn: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium text-ink">{t('Turn with the circle')}</span>
              <span className="block text-ink-2">{t('Each copy turns to face the middle, like the petals of a flower.')}</span>
            </span>
          </label>
        </>
      )}
      <Tooltip title={t('Change together')} description={t('Change the color, shape or words of one, and all the copies change with it. Each keeps its own place and size.')} className="flex">
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" checked={!!s.linked} onChange={(e) => set({ linked: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium text-ink">{t('Change together')}</span>
            <span className="block text-ink-2">{t('Change one, and they all change.')}</span>
          </span>
        </label>
      </Tooltip>
      <p role="status" className="text-[13px] leading-snug text-ink-2">
        {s.kind === 'mirror' ? t('One copy, flipped. Nothing changes until you press Apply.') : t('{count} in all. Nothing changes until you press Apply.', { count: total })}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={state.cancel} tip={{ title: t('Cancel'), description: t('Leave the design as it was, without copies.'), shortcut: 'Esc' }}>
          <X size={14} />
          {t('Cancel')}
        </Button>
        <Button variant="primary" className="h-8 px-3 text-[13px]" onClick={state.apply} tip={{ title: t('Apply'), description: t('Keep the copies. They are kept together with the original; Take apart lets each one move on its own.'), shortcut: 'Enter' }}>
          <Check size={14} />
          {t('Apply')}
        </Button>
      </div>
    </section>
  )
}
