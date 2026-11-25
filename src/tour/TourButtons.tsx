import { Play } from 'lucide-react'
import { Tooltip } from '../components/Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { TOURS } from './tours.ts'

// The guided tours, as small buttons: on the start screen and in Help.
export function TourButtons({ onTour, className = '' }: { onTour: (id: string) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <span className="text-[13px] text-ink-3">{t('New here? Take a guided tour:')}</span>
      {TOURS.map((tour) => (
        <Tooltip key={tour.id} title={tour.title()} description={tour.description()} pro={false}>
          <button
            type="button"
            onClick={() => onTour(tour.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 shadow-sm transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            <Play size={13} className="rtl:rotate-180" />
            {tour.title()}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
