import { Check, Ruler, X } from 'lucide-react'
import type { StraightenPanelState } from '../hooks/useStraighten.ts'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

// Degrees as people read them: one decimal, with a real minus sign.
function degreesText(degrees: number): string {
  const text = Math.abs(degrees).toFixed(1)
  return degrees < 0 ? `−${text}°` : `${text}°`
}

// The small card over the design while Straighten shows its turn: what was found, a slider to turn
// it a little more or less, and Apply or Cancel.
export function StraightenPanel({ state }: { state: StraightenPanelState }) {
  const { found, degrees, maxDegrees } = state
  const message =
    found === null
      ? t('No clear straight lines (like a horizon or a wall) were found in “{name}”. You can still turn it with the slider.', { name: state.name })
      : found === 0
        ? t('“{name}” is already level. You can still turn it with the slider.', { name: state.name })
        : // The number is kept apart, so its minus and degree signs stay in place in Hebrew and Yiddish.
          t('Turned {degrees} so the lines in “{name}” are level. Nothing changes until you press Apply.', { degrees: `\u2066${degreesText(found)}\u2069`, name: state.name })
  return (
    <section
      aria-label={t('Straighten')}
      // Arrow keys turn the slider here instead of nudging the photo; Enter and Esc still apply or cancel.
      onKeyDown={(event) => event.key !== 'Enter' && event.key !== 'Escape' && event.stopPropagation()}
      className="absolute inset-x-3 top-3 z-10 mx-auto flex w-[340px] max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur"
    >
      <Tooltip
        title={t('Straighten')}
        description={t('Finds the long straight lines in a photo, like the horizon or a wall, and turns the photo so they are level (pro: Auto Straighten). The photo grows just enough that no empty corners show.')}
      >
        <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
          <Ruler size={15} className="text-accent" aria-hidden />
          {t('Straighten')}
        </h2>
      </Tooltip>
      <p role="status" className="text-[13px] leading-snug text-ink-2">
        {message}
      </p>
      <Slider
        label={t('How much')}
        help={t('Turn the photo a little more or less. To the right turns it clockwise, to the left the other way.')}
        value={(degrees + maxDegrees) / (2 * maxDegrees)}
        origin={0.5}
        step={0.1 / (2 * maxDegrees)}
        display={degreesText(degrees)}
        onChange={(position) => state.onDegrees(position * 2 * maxDegrees - maxDegrees)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={state.cancel} tip={{ title: t('Cancel'), description: t('Leave the photo as it was.'), shortcut: 'Esc' }}>
          <X size={14} />
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          className="h-8 px-3 text-[13px]"
          onClick={state.apply}
          tip={{ title: t('Apply'), description: t('Keep the photo turned like this. You can undo it.'), shortcut: 'Enter' }}
        >
          <Check size={14} />
          {t('Apply')}
        </Button>
      </div>
    </section>
  )
}
