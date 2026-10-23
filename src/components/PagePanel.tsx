import { CircleHelp } from 'lucide-react'
import type { Gradient } from '../editor/gradient.ts'
import { FillKindSwitch, GradientEditor } from './GradientEditor.tsx'
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
        <Tooltip title={t('Page')} description={t('The page under everything. Give it one color, or colors that fade across it. Choose the colors in the Color panel below.')}>
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            {t('Page')}
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <FillKindSwitch
        label={t('Page fill')}
        kind={kind}
        colorHelp={t('One plain color for the whole page.')}
        gradientHelp={t('Colors that fade smoothly across the whole page. Drag the round handles on the page to turn it.')}
        onChange={props.onFillKind}
      />

      {gradient && (
        <div className="mt-3">
          <GradientEditor gradient={gradient} stop={Math.min(props.gradientStop, gradient.stops.length - 1)} onStop={props.onGradientStop} onChange={props.onGradient} />
        </div>
      )}
    </section>
  )
}
