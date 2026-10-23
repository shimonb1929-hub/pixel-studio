import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { useUnit, type Unit } from '../editor/units.ts'
import { UNIT_CHOICES } from './unitWords.ts'

// A small menu for the unit everything is counted in. The choice is the same everywhere in the app
// and is kept for the next visit.
export function UnitPicker({ side = 'bottom', className = '' }: { side?: 'bottom' | 'top'; className?: string }) {
  const [unit, setUnit] = useUnit()
  return (
    <Tooltip
      side={side}
      title={t('Measure in')}
      description={t('Count sizes and places in pixels for screens, or in inches, centimeters or millimeters for print. Your design does not change.')}
    >
      <select
        aria-label={t('Measure in')}
        value={unit}
        onChange={(e) => setUnit(e.target.value as Unit)}
        className={`cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-xs font-medium text-ink-2 outline-none hover:bg-subtle hover:text-ink focus-visible:bg-subtle ${className}`}
      >
        {UNIT_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </Tooltip>
  )
}
