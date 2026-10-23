import { Link, Unlink } from 'lucide-react'
import { useState } from 'react'
import { validateDocumentSize } from '../editor/document.ts'
import { DEFAULT_PPI, MAX_PPI, decimalInput, formatInUnit, unitToPixels, useUnit, type Unit } from '../editor/units.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, inputClass } from './ui.tsx'
import { UNIT_CHOICES, unitShort } from './unitWords.ts'
import { live, msg, t } from '../i18n/i18n.ts'

interface ResizeDialogProps {
  width: number
  height: number
  // Pixels per inch, for sizes in inches, centimeters or millimeters.
  ppi?: number
  onResize: (width: number, height: number, ppi: number) => void
  onClose: () => void
}

const QUICK_SIZES = [25, 50, 200]

// How each unit is named in the size boxes.
const SIZE_WORDS: Record<Unit, { size: string; width: string; height: string }> = live({
  px: { size: msg('New size in pixels'), width: msg('New width in pixels'), height: msg('New height in pixels') },
  in: { size: msg('New size in inches'), width: msg('New width in inches'), height: msg('New height in inches') },
  cm: { size: msg('New size in centimeters'), width: msg('New width in centimeters'), height: msg('New height in centimeters') },
  mm: { size: msg('New size in millimeters'), width: msg('New width in millimeters'), height: msg('New height in millimeters') },
})

function describeResize(width: number, height: number, newWidth: number, newHeight: number): string {
  if (newWidth === width && newHeight === height) return t('This is the size it is now.')
  if (newWidth > width || newHeight > height) {
    return t('Shapes stay sharp at any size. Photos only have the detail they came with, so made much bigger than that they can look a little soft.')
  }
  return t('Making a design smaller keeps it sharp. Every picture keeps all its pixels, so you can make it big again later without losing anything.')
}

export function ResizeDialog({ width, height, ppi: startPpi = DEFAULT_PPI, onResize, onClose }: ResizeDialogProps) {
  const [unit, setUnit] = useUnit()
  const [ppi, setPpi] = useState(String(startPpi))
  const [newWidth, setNewWidth] = useState(() => formatInUnit(width, unit, startPpi))
  const [newHeight, setNewHeight] = useState(() => formatInUnit(height, unit, startPpi))
  const [keepShape, setKeepShape] = useState(true)

  const print = unit !== 'px'
  const short = unitShort(unit)
  const ppiValue = Number(ppi)
  // A size that hasn't been typed over keeps its exact pixels, not a rounded copy.
  const pixels = (typed: string, original: number) =>
    typed === formatInUnit(original, unit, startPpi) && ppiValue === startPpi ? original : unitToPixels(Number(typed), unit, ppiValue)
  const w = pixels(newWidth, width)
  const h = pixels(newHeight, height)
  const error =
    newWidth === '' || newHeight === ''
      ? t('Type a width and a height.')
      : print && !(ppiValue > 0 && ppiValue <= MAX_PPI)
        ? t('Type how many pixels go in each inch, up to {max}.', { max: MAX_PPI })
        : validateDocumentSize(w, h)
  const shown = (px: number) => formatInUnit(Math.max(1, Math.round(px)), unit, ppiValue)
  const typedNumber = (text: string) => (print ? decimalInput(text) : text.replace(/\D/g, ''))

  function changeWidth(text: string) {
    const typed = typedNumber(text)
    setNewWidth(typed)
    if (keepShape && Number(typed) > 0) setNewHeight(shown((unitToPixels(Number(typed), unit, ppiValue) * height) / width))
  }

  function changeHeight(text: string) {
    const typed = typedNumber(text)
    setNewHeight(typed)
    if (keepShape && Number(typed) > 0) setNewWidth(shown((unitToPixels(Number(typed), unit, ppiValue) * width) / height))
  }

  return (
    <Dialog
      title={t("Resize design")}
      subtitle={
        print
          ? t('Make the whole design, with every layer, bigger or smaller. It is {width} × {height} {unit} now.', {
              width: formatInUnit(width, unit, startPpi),
              height: formatInUnit(height, unit, startPpi),
              unit: short,
            })
          : t('Make the whole design, with every layer, bigger or smaller. It is {width} × {height} pixels now.', { width, height })
      }
      submitLabel={t("Resize")}
      submitDisabled={!!error}
      onSubmit={() => !error && onResize(w, h, print ? ppiValue : startPpi)}
      onClose={onClose}
    >
      <Field label={t("Measure in")} help={t("Type the size in pixels for screens, or in inches, centimeters or millimeters for print.")}>
        <ChoiceGroup
          name={t("Measure in")}
          value={unit}
          options={UNIT_CHOICES}
          onChange={(next) => {
            if (next === unit) return
            // Carry the size across so switching never loses what was typed.
            setNewWidth(formatInUnit(error ? width : w, next, ppiValue > 0 ? ppiValue : startPpi))
            setNewHeight(formatInUnit(error ? height : h, next, ppiValue > 0 ? ppiValue : startPpi))
            setUnit(next)
          }}
        />
      </Field>

      <Field
        label={SIZE_WORDS[unit].size}
        help={t("The new width and height. With Keep shape on, changing one changes the other too, so nothing gets squashed.")}
        note={
          error ? (
            <span className="text-danger">{error}</span>
          ) : print ? (
            `${describeResize(width, height, w, h)} ${t('That is {width} × {height} pixels.', { width: w, height: h })}`
          ) : (
            describeResize(width, height, w, h)
          )
        }
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              aria-label={SIZE_WORDS[unit].width}
              data-autofocus
              className={`${inputClass} pe-14`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={newWidth}
              onChange={(e) => changeWidth(e.target.value)}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('wide')}</span>
          </div>
          <Tooltip title={t("Keep shape")} description={t("Keep the width and height in step, so the design is not squashed or stretched.")}>
            <button
              type="button"
              aria-label={t("Keep shape")}
              aria-pressed={keepShape}
              onClick={() => setKeepShape(!keepShape)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                keepShape ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-subtle hover:text-ink'
              }`}
            >
              {keepShape ? <Link size={16} /> : <Unlink size={16} />}
            </button>
          </Tooltip>
          <div className="relative flex-1">
            <input
              aria-label={SIZE_WORDS[unit].height}
              className={`${inputClass} pe-12`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={newHeight}
              onChange={(e) => changeHeight(e.target.value)}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
        </div>
      </Field>

      {print && (
        <Field
          label={t("Pixels per inch")}
          htmlFor="resize-ppi"
          help={t('How many pixels go in each inch. 300 is sharp on paper; 150 is fine for big posters seen from far away.')}
        >
          <input id="resize-ppi" className={inputClass} inputMode="numeric" value={ppi} onChange={(e) => setPpi(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}

      <Field label={t("Quick sizes")} help={t("Shrink or grow the design by a set amount, keeping its shape.")}>
        <div className="flex gap-2">
          {QUICK_SIZES.map((percent) => (
            <Button
              key={percent}
              className="h-8 flex-1 text-[13px]"
              onClick={() => {
                setKeepShape(true)
                setNewWidth(shown((width * percent) / 100))
                setNewHeight(shown((height * percent) / 100))
              }}
            >
              {percent}%
            </Button>
          ))}
        </div>
      </Field>
    </Dialog>
  )
}
