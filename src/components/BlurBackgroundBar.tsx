import { Check } from 'lucide-react'
import type { BlurBackgroundControls } from '../ai/useBlurBackground.ts'
import { t } from '../i18n/i18n.ts'
import { Button, Slider } from './ui.tsx'

// While Blur the background is being tried out, the Arrange bar shows its slider, Cancel and Apply.
export function BlurBackgroundBar({ controls }: { controls: BlurBackgroundControls }) {
  const percent = Math.round(controls.amount * 100)
  return (
    <>
      <p className="min-w-48 max-w-72 text-[13px] leading-snug text-ink-2">
        {t('“{name}” stays sharp where the main thing is; everything behind it goes soft.', { name: controls.name })}
      </p>
      <Slider
        className="w-44 shrink-0"
        label={t('How much blur')}
        help={t('How soft the background gets, like a photo from an expensive camera. The main thing always stays sharp. You see it on your design as you move the slider.')}
        value={controls.amount}
        display={`${percent}%`}
        onChange={(position) => controls.onAmount(Math.round(position * 100) / 100)}
      />
      <div className="h-9 w-px shrink-0 bg-line" />
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" onClick={controls.cancel} tip={{ title: t('Cancel'), shortcut: 'Esc', description: t('Put it back the way it was.') }}>
        {t('Cancel')}
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" onClick={controls.apply} tip={{ title: t('Apply'), shortcut: 'Enter', description: t('Keep the blurred background. You can undo it.') }}>
        <Check size={15} />
        {t('Apply')}
      </Button>
    </>
  )
}
