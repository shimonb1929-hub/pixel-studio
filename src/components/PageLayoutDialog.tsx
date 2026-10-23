import { useEffect, useState } from 'react'
import { defaultGap, marginFor, marginSize, type MarginSize } from '../editor/pageLayout.ts'
import type { EditorDocument, PageLayout } from '../editor/types.ts'
import { decimalInput, documentPpi, formatInUnit, unitToPixels, useUnit } from '../editor/units.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'
import { unitShort } from './unitWords.ts'
import { live, msg, t } from '../i18n/i18n.ts'

const MARGINS: { value: MarginSize; label: string; description: string }[] = live([
  { value: 'none', label: msg('None'), description: msg('No margin lines. Things can go right up to the edge.') },
  { value: 'small', label: msg('Small'), description: msg('A thin border of free space around the page.') },
  { value: 'medium', label: msg('Medium'), description: msg('A comfortable border, like in most books and flyers.') },
  { value: 'large', label: msg('Large'), description: msg('A wide border, for a calm page with lots of air.') },
])

const COLUMN_COUNTS = ['1', '2', '3', '4', '6'] as const
type ColumnCount = (typeof COLUMN_COUNTS)[number]

interface PageLayoutDialogProps {
  doc: EditorDocument
  // Shows the lines on the design while choosing, before they're kept.
  onPreview: (layout: PageLayout | null) => void
  onApply: (layout: PageLayout) => void
  onClose: () => void
}

export function PageLayoutDialog({ doc, onPreview, onApply, onClose }: PageLayoutDialogProps) {
  const [unit] = useUnit()
  const ppi = documentPpi(doc)
  const start = doc.layout ?? { margin: 0, columns: 1, gap: defaultGap(doc.width, doc.height) }
  const [margin, setMargin] = useState(() => formatInUnit(start.margin, unit, ppi))
  const [columns, setColumns] = useState(start.columns)
  const [gap, setGap] = useState(() => formatInUnit(start.gap, unit, ppi))
  const short = unitShort(unit)

  const toPixels = (typed: string) => (typed === '' ? 0 : unitToPixels(Number(typed), unit, ppi))
  const layout: PageLayout = { margin: toPixels(margin), columns, gap: toPixels(gap) }
  const size = marginSize(layout.margin, doc.width, doc.height)

  useEffect(() => {
    onPreview(layout)
    // The preview follows the numbers; onPreview itself never changes what's shown.
  }, [layout.margin, layout.columns, layout.gap])

  const columnOptions = COLUMN_COUNTS.map((count) => ({
    value: count,
    label: count,
    description: count === '1' ? t('One wide column: no column lines.') : t('{count} columns side by side, for text and pictures that line up.', { count }),
  }))

  return (
    <Dialog
      title={t('Margins and columns')}
      subtitle={t('Faint lines that help you keep things neat. Things click to them as you move them. They are never printed or downloaded.')}
      submitLabel={t('Done')}
      onSubmit={() => onApply(layout)}
      onClose={() => {
        onPreview(null)
        onClose()
      }}
    >
      <Field
        label={t('Space around the edge')}
        help={t('Free space kept around the page, so nothing important sits too close to the edge or gets cut off when printed.')}
        note={size ? MARGINS.find((m) => m.value === size)!.description : t('Your own size.')}
      >
        <div className="space-y-2">
          <ChoiceGroup<MarginSize | ''>
            name={t('Space around the edge')}
            value={size ?? ''}
            options={MARGINS}
            onChange={(value) => value && setMargin(formatInUnit(marginFor(value, doc.width, doc.height), unit, ppi))}
          />
          <div className="relative">
            <input
              aria-label={t('Margin size')}
              className={`${inputClass} pe-12`}
              inputMode="decimal"
              value={margin}
              onChange={(e) => setMargin(decimalInput(e.target.value))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{short}</span>
          </div>
        </div>
      </Field>

      <Field label={t('Columns')} help={t('Splits the space inside the margins into equal columns, like a newspaper or a menu.')}>
        <ChoiceGroup<ColumnCount> name={t('Columns')} value={String(columns) as ColumnCount} options={columnOptions} onChange={(value) => setColumns(Number(value))} />
      </Field>

      {columns > 1 && (
        <Field label={t('Space between columns')} help={t('How much free space sits between two columns.')}>
          <div className="relative">
            <input
              aria-label={t('Space between columns')}
              className={`${inputClass} pe-12`}
              inputMode="decimal"
              value={gap}
              onChange={(e) => setGap(decimalInput(e.target.value))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{short}</span>
          </div>
        </Field>
      )}
    </Dialog>
  )
}
