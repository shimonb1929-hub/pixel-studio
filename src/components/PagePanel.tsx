import { Blend, CircleHelp, Square } from 'lucide-react'
import type { Gradient } from '../editor/gradient.ts'
import { GradientEditor } from './GradientEditor.tsx'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

interface PagePanelProps {
  // The page's gradient, or null when it has one plain color.
  gradient: Gradient | null
  onFillKind: (kind: 'color' | 'gradient') => void
  onGradient: (gradient: Gradient, label: string, mergeKey?: string) => void
  gradientStop: number
  onGradientStop: (index: number) => void
}

// The page under everything, while it's picked: one color, or colors fading across it.
export function PagePanel(props: PagePanelProps) {
  const { gradient } = props
  const kind = gradient ? 'gradient' : 'color'
  return (
    <section aria-label={t('Page')} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip title={t('Page')} description={t('The page under everything. Give it one color, or colors that fade across it. Choose the colors in the Color panel above.')}>
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            {t('Page')}
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div role="radiogroup" aria-label={t('Page fill')} className="flex w-fit gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
        {(
          [
            { kind: 'color', label: t('Color'), icon: Square, description: t('One plain color for the whole page.') },
            {
              kind: 'gradient',
              label: t('Gradient'),
              icon: Blend,
              description: t('Colors that fade smoothly across the whole page. Drag the round handles on the page to turn it.'),
            },
          ] as const
        ).map((choice) => (
          <Tooltip key={choice.kind} title={choice.label} description={choice.description}>
            <button
              type="button"
              role="radio"
              aria-checked={kind === choice.kind}
              aria-label={choice.label}
              onClick={() => props.onFillKind(choice.kind)}
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

      {gradient && (
        <div className="mt-3">
          <GradientEditor gradient={gradient} stop={Math.min(props.gradientStop, gradient.stops.length - 1)} onStop={props.onGradientStop} onChange={props.onGradient} />
        </div>
      )}
    </section>
  )
}
