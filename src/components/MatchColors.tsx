import type { MatchPhoto } from '../editor/matchSources.ts'
import { t } from '../i18n/i18n.ts'
import { LookPreview } from './AdjustPanel.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Slider } from './ui.tsx'

// Which photo was matched, and how much (0 to 1).
export interface MatchChoice {
  id: string
  amount: number
}

interface MatchColorsProps {
  photos: MatchPhoto[]
  // The photo matched now, if any.
  choice: MatchChoice | null
  onMatch: (choice: MatchChoice) => void
}

// "Match another photo" (pro: Match Color): pick one of the other photos on the design, and this
// one takes on its light and colors. It only sets the light curves and color strength, so every
// slider stays changeable after.
export function MatchColors({ photos, choice, onMatch }: MatchColorsProps) {
  if (!photos.length) {
    return (
      <p className="text-[12px] leading-snug text-ink-2">
        {t('There is no other photo on this design yet. Add the photo whose light and colors you like, then pick it here.')}
      </p>
    )
  }
  const amount = choice?.amount ?? 1
  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label={t('Match another photo')} className="grid grid-cols-3 gap-1.5">
        {photos.map((photo) => (
          <Tooltip
            key={photo.id}
            title={photo.name}
            description={t('Give the photo you are adjusting the light and colors of “{name}”.', { name: photo.name })}
            className="flex"
          >
            <button
              type="button"
              role="radio"
              aria-checked={choice?.id === photo.id}
              aria-label={photo.name}
              onClick={() => onMatch({ id: photo.id, amount })}
              className={`flex w-full min-w-0 flex-col items-center justify-start gap-1 rounded-lg p-1 pb-1.5 transition-colors ${
                choice?.id === photo.id ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <LookPreview source={photo.picture} />
              <span dir="auto" className="w-full truncate text-center text-[11px] font-medium leading-tight">
                {photo.name}
              </span>
            </button>
          </Tooltip>
        ))}
      </div>
      {choice && (
        <Slider
          label={t('How much')}
          help={t('How strongly this photo takes on the other one’s light and colors. All the way to the left changes nothing.')}
          value={amount}
          step={0.01}
          display={`${Math.round(amount * 100)}%`}
          note={amount < 0.005 ? t('No change.') : amount < 0.5 ? t('A hint of the other photo’s look.') : amount < 0.995 ? t('Close to the other photo’s look.') : t('The full look of the other photo.')}
          onChange={(position) => onMatch({ id: choice.id, amount: Math.round(position * 100) / 100 })}
        />
      )}
    </div>
  )
}
