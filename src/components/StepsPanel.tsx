import { Check, Layers, X } from 'lucide-react'
import { MAX_STEPS } from '../editor/blend.ts'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

export interface StepsPanelState {
  steps: number
  onChange: (steps: number) => void
  apply: () => void
  cancel: () => void
}

// The small card beside the design while the steps between two shapes are shown: how many, and
// Apply or Cancel. It sits off to the side, so the steps stay in view.
export function StepsPanel({ state }: { state: StepsPanelState }) {
  // More of the slider for the first few steps, where each one shows.
  const toPosition = (steps: number) => Math.sqrt((steps - 1) / (MAX_STEPS - 1))
  const fromPosition = (p: number) => 1 + Math.round(p * p * (MAX_STEPS - 1))
  return (
    <section
      aria-label={t('Steps between')}
      // Arrow keys move the slider here instead of nudging what's picked; Enter and Esc still apply or cancel.
      onKeyDown={(event) => event.key !== 'Enter' && event.key !== 'Escape' && event.stopPropagation()}
      className="absolute bottom-20 end-3 z-10 flex w-[320px] max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur"
    >
      <Tooltip title={t('Steps between')} description={t('Shapes in between the two picked ones, slowly turning one into the other: place, size, color and shape.')}>
        <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
          <Layers size={15} className="text-accent" aria-hidden />
          {t('Steps between')}
        </h2>
      </Tooltip>
      <Slider
        label={t('How many steps')}
        help={t('Few steps show each shape; many make a smooth flow from one to the other.')}
        value={toPosition(state.steps)}
        step={1 / 200}
        display={String(state.steps)}
        pro="Specified Steps (blend)"
        onChange={(p) => state.onChange(fromPosition(p))}
      />
      <p role="status" className="text-[13px] leading-snug text-ink-2">
        {t('{count} in between. Nothing changes until you press Apply.', { count: state.steps })}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={state.cancel} tip={{ title: t('Cancel'), description: t('Leave the design as it was, without steps.'), shortcut: 'Esc' }}>
          <X size={14} />
          {t('Cancel')}
        </Button>
        <Button variant="primary" className="h-8 px-3 text-[13px]" onClick={state.apply} tip={{ title: t('Apply'), description: t('Keep the steps. They are kept together with the two shapes.'), shortcut: 'Enter' }}>
          <Check size={14} />
          {t('Apply')}
        </Button>
      </div>
    </section>
  )
}
