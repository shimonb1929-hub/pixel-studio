import { Eclipse, Eye, RotateCcw } from 'lucide-react'
import { sizeToSlider, sliderToSize } from '../editor/brushes.ts'
import { FADES, type FadeSide, type HideBrush, type HideMode } from '../editor/hide.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

// The settings bar of the Fade tool: hide or bring back, and the brush.
export function FadeBar({ brush, mode, onBrush, onMode }: { brush: HideBrush; mode: HideMode; onBrush: (brush: HideBrush) => void; onMode: (mode: HideMode) => void }) {
  const choices = [
    { mode: 'hide' as const, label: t('Fade away'), icon: Eclipse, description: t('Brushing hides the part you brush over, softly, so what is behind shows through.') },
    { mode: 'show' as const, label: t('Bring back'), icon: Eye, description: t('Brushing shows faded parts again, just as they were.') },
  ]
  return (
    <>
      <div role="radiogroup" aria-label={t('What brushing does')} className="flex shrink-0 gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
        {choices.map((choice) => (
          <Tooltip key={choice.mode} title={choice.label} description={choice.description}>
            <button
              type="button"
              role="radio"
              aria-checked={mode === choice.mode}
              aria-label={choice.label}
              onClick={() => onMode(choice.mode)}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                mode === choice.mode ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <choice.icon size={15} strokeWidth={1.9} />
              {choice.label}
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="h-9 w-px shrink-0 bg-line" />
      <Slider
        className="w-32 shrink-0"
        label={t('Size')}
        help={t('How wide the brush is.')}
        value={sizeToSlider(brush.size)}
        display={`${brush.size} px`}
        onChange={(position) => onBrush({ ...brush, size: sliderToSize(position) })}
      />
      <Slider
        className="w-32 shrink-0"
        label={t('Softness')}
        help={t('How gently the edge fades. High makes a smooth fade; low makes a sharp edge.')}
        value={brush.softness}
        display={`${Math.round(brush.softness * 100)}%`}
        onChange={(position) => onBrush({ ...brush, softness: Math.round(position * 100) / 100 })}
      />
      <Slider
        className="w-32 shrink-0"
        label={t('Strength')}
        help={t('How much one stroke fades or brings back. Low lets you build it up little by little.')}
        value={brush.strength}
        display={`${Math.round(brush.strength * 100)}%`}
        onChange={(position) => onBrush({ ...brush, strength: Math.max(0.05, Math.round(position * 100) / 100) })}
      />
    </>
  )
}

// How each ready-made fade looks, drawn as a plain gray card that fades out the same way.
const FADE_LOOK: Record<FadeSide, string> = {
  edges: 'radial-gradient(closest-side, #8a93a6 55%, transparent 100%)',
  bottom: 'linear-gradient(to bottom, #8a93a6 50%, transparent 100%)',
  top: 'linear-gradient(to top, #8a93a6 50%, transparent 100%)',
  left: 'linear-gradient(to left, #8a93a6 50%, transparent 100%)',
  right: 'linear-gradient(to right, #8a93a6 50%, transparent 100%)',
}

interface FadePanelProps {
  // The picked thing's name, or null when nothing is picked.
  name: string | null
  faded: boolean
  onFade: (side: FadeSide) => void
  // Shows a fade on the design while it's pointed at (null: as it is).
  onPreview: (side: FadeSide | null) => void
  onShowAll: () => void
}

// Ready-made fades for the picked thing, and bringing all of it back.
export function FadePanel({ name, faded, onFade, onPreview, onShowAll }: FadePanelProps) {
  return (
    <section aria-label={t('Fade')} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="mb-1 flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-ink">
        <bdi className="truncate">{name ?? t('Fade')}</bdi>
      </h2>
      {name === null ? (
        <p className="text-[13px] leading-snug text-ink-2">{t('Pick a photo, a shape or some words first, then brush over the part to fade, or choose a ready-made fade here.')}</p>
      ) : (
        <>
          <p className="mb-3 text-[12px] leading-snug text-ink-2">{t('Brush over a part to fade it, or pick a ready-made fade. Nothing is lost.')}</p>
          <div role="group" aria-label={t('Ready-made fades')} className="grid grid-cols-3 gap-1.5" onPointerLeave={() => onPreview(null)}>
            {FADES.map((fade) => (
              <Tooltip key={fade.side} title={fade.name} description={fade.description}>
                <button
                  type="button"
                  aria-label={fade.name}
                  onClick={() => onFade(fade.side)}
                  onPointerEnter={() => onPreview(fade.side)}
                  onFocus={() => onPreview(fade.side)}
                  onBlur={() => onPreview(null)}
                  className="flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-[11px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                >
                  <span className="h-9 w-full rounded-md border border-line bg-white" aria-hidden>
                    <span className="block h-full w-full rounded-md" style={{ background: FADE_LOOK[fade.side] }} />
                  </span>
                  {fade.name}
                </button>
              </Tooltip>
            ))}
          </div>
          {faded && (
            <Button
              variant="ghost"
              className="mt-3 h-8 w-full px-3 text-[12px]"
              onClick={onShowAll}
              tip={{ title: t('Show all of it again'), description: t('Bring back everything that was faded or hidden, just as it was.') }}
            >
              <RotateCcw size={14} />
              {t('Show all of it again')}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
