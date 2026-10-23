import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { MAX_DOCUMENT_SIDE, validateDocumentSize, type BackgroundFill } from '../editor/document.ts'
import { SIZE_PRESETS } from '../presets.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { Button, inputClass } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'
import { DEFAULT_PPI, MAX_PPI, decimalInput, formatInUnit, unitToPixels, useUnit, type Unit } from '../editor/units.ts'
import { UNIT_CHOICES } from './unitWords.ts'

export interface NewDocumentOptions {
  name: string
  width: number
  height: number
  background: BackgroundFill
  // Pixels per inch, for counting the design in inches, centimeters or millimeters.
  ppi: number
}

const BACKGROUNDS: { value: BackgroundFill; label: string; description: string }[] = live([
  { value: 'white', label: msg('White'), description: msg('Starts as a plain white sheet, like paper.') },
  { value: 'black', label: msg('Black'), description: msg('Starts as a solid black sheet.') },
  {
    value: 'transparent',
    label: msg('See-through'),
    description:
      msg('Starts empty and see-through. Gray and white squares show the empty parts. Good for stickers and cut-outs you will place on top of something else.'),
  },
])

// How each unit is named in the size boxes.
const SIZE_WORDS: Record<Unit, { size: string; width: string; height: string }> = live({
  px: { size: msg('Size in pixels'), width: msg('Width in pixels'), height: msg('Height in pixels') },
  in: { size: msg('Size in inches'), width: msg('Width in inches'), height: msg('Height in inches') },
  cm: { size: msg('Size in centimeters'), width: msg('Width in centimeters'), height: msg('Height in centimeters') },
  mm: { size: msg('Size in millimeters'), width: msg('Width in millimeters'), height: msg('Height in millimeters') },
})

function inUnit(pixels: string, unit: Unit, ppi: number): string {
  if (pixels === '' || !(ppi > 0)) return ''
  return formatInUnit(Number(pixels), unit, ppi)
}

// A size that suits the unit: a screen in pixels, a printed page otherwise.
function startingSize(unit: Unit): { width: number; height: number } {
  if (unit === 'px') return { width: 1920, height: 1080 }
  return SIZE_PRESETS.find((p) => p.id === (unit === 'in' ? 'letter' : 'a4'))!
}

interface NewDocumentDialogProps {
  defaultName: string
  onCreate: (options: NewDocumentOptions) => void
  onClose: () => void
}

function describeSize(width: number, height: number): string {
  const vars = { width: width.toLocaleString('en-US'), height: height.toLocaleString('en-US') }
  if (width === height) return t("{width} pixels wide and {height} pixels tall, so it's a square.", vars)
  return width > height ? t("{width} pixels wide and {height} pixels tall, so it's wide.", vars) : t("{width} pixels wide and {height} pixels tall, so it's tall.", vars)
}

export function NewDocumentDialog({ defaultName, onCreate, onClose }: NewDocumentDialogProps) {
  // Follows the suggested name until you type your own.
  const [typedName, setTypedName] = useState<string | null>(null)
  const name = typedName ?? defaultName
  const [unit, setUnit] = useUnit()
  const [start] = useState(() => startingSize(unit))
  const [width, setWidth] = useState(String(start.width))
  const [height, setHeight] = useState(String(start.height))
  const [background, setBackground] = useState<BackgroundFill>('white')
  const [ppi, setPpi] = useState(String(DEFAULT_PPI))
  const [widthTyped, setWidthTyped] = useState(() => inUnit(String(start.width), unit, DEFAULT_PPI))
  const [heightTyped, setHeightTyped] = useState(() => inUnit(String(start.height), unit, DEFAULT_PPI))

  const print = unit !== 'px'
  const words = SIZE_WORDS[unit]
  const ppiValue = Number(ppi)
  // Untouched sizes keep the exact pixels they came from, not a rounded copy (A4 stays 2480 wide).
  const typedEdited = widthTyped !== inUnit(width, unit, ppiValue) || heightTyped !== inUnit(height, unit, ppiValue)
  const fromTyped = print && typedEdited
  const widthValue = fromTyped ? unitToPixels(Number(widthTyped), unit, ppiValue) : Number(width)
  const heightValue = fromTyped ? unitToPixels(Number(heightTyped), unit, ppiValue) : Number(height)
  const sizeError =
    (print ? widthTyped === '' || heightTyped === '' : width === '' || height === '')
      ? t('Type a width and a height.')
      : print && !(ppiValue > 0 && ppiValue <= MAX_PPI)
        ? t('Type how many pixels go in each inch, up to {max}.', { max: MAX_PPI })
        : validateDocumentSize(widthValue, heightValue)
  // In print units a preset is found by its rounded size, so A4 (8.27 × 11.69 in) still shows as A4.
  const preset = SIZE_PRESETS.find((p) =>
    print
      ? inUnit(String(p.width), unit, ppiValue) === widthTyped && inUnit(String(p.height), unit, ppiValue) === heightTyped
      : p.width === widthValue && p.height === heightValue,
  )

  function handleSubmit() {
    if (sizeError) return
    onCreate({ name: name.trim() || defaultName, width: widthValue, height: heightValue, background, ppi: print ? ppiValue : DEFAULT_PPI })
  }

  return (
    <Dialog
      title={t("New design")}
      subtitle={t("Choose a size and a background to start with.")}
      submitLabel={t("Create design")}
      submitDisabled={!!sizeError}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <Field label={t("Name")} htmlFor="new-name" help={t("What your design is called. It becomes the file name when you download it.")}>
        <input id="new-name" data-autofocus className={inputClass} value={name} onChange={(e) => setTypedName(e.target.value)} />
      </Field>

      <Field
        label={t("Ready-made size")}
        htmlFor="new-preset"
        help={t("Common sizes for posts, screens and printed pages. Pick one, or type your own width and height below.")}
        note={preset?.use}
      >
        <select
          id="new-preset"
          className={inputClass}
          value={preset?.id ?? 'custom'}
          onChange={(e) => {
            const next = SIZE_PRESETS.find((p) => p.id === e.target.value)
            if (!next) return
            setWidth(String(next.width))
            setHeight(String(next.height))
            setWidthTyped(inUnit(String(next.width), unit, ppiValue))
            setHeightTyped(inUnit(String(next.height), unit, ppiValue))
          }}
        >
          <option value="custom" disabled>
            {t('My own size')}
          </option>
          {SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({'\u2066'}{p.width} × {p.height}{'\u2069'})
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("Measure in")} help={t("Type the size in pixels for screens, or in inches, centimeters or millimeters for print.")} note={UNIT_CHOICES.find((u) => u.value === unit)!.description}>
        <ChoiceGroup
          name={t("Measure in")}
          value={unit}
          options={UNIT_CHOICES}
          onChange={(next) => {
            if (next === unit) return
            // Carry the size across so switching never loses what was typed.
            const w = sizeError ? width : String(widthValue)
            const h = sizeError ? height : String(heightValue)
            if (fromTyped && !sizeError) {
              setWidth(w)
              setHeight(h)
            }
            setWidthTyped(inUnit(w, next, ppiValue))
            setHeightTyped(inUnit(h, next, ppiValue))
            setUnit(next)
          }}
        />
      </Field>

      <Field
        label={words.size}
        help={
          print
            ? t('How big it will be on paper. It is turned into pixels using the pixels per inch below.')
            : t('Pixels are the tiny colored squares every digital picture is made of. More pixels means more detail and a bigger file. Up to {max} on each side.', { max: MAX_DOCUMENT_SIDE.toLocaleString('en-US') })
        }
        note={
          sizeError ? (
            <span className="text-danger">{sizeError}</span>
          ) : (
            describeSize(widthValue, heightValue)
          )
        }
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              aria-label={words.width}
              className={`${inputClass} pe-14`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={print ? widthTyped : width}
              onChange={(e) => (print ? setWidthTyped(decimalInput(e.target.value)) : setWidth(e.target.value.replace(/\D/g, '')))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('wide')}</span>
          </div>
          <Button
            variant="ghost"
            aria-label={t("Swap width and height")}
            className="h-9 w-9 shrink-0"
            onClick={() => {
              setWidth(height)
              setHeight(width)
              setWidthTyped(heightTyped)
              setHeightTyped(widthTyped)
            }}
            tip={{
              title: t('Swap width and height'),
              description: t('Turns your design on its side: a wide design becomes tall, and a tall one becomes wide.'),
            }}
          >
            <ArrowLeftRight size={16} />
          </Button>
          <div className="relative flex-1">
            <input
              aria-label={words.height}
              className={`${inputClass} pe-12`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={print ? heightTyped : height}
              onChange={(e) => (print ? setHeightTyped(decimalInput(e.target.value)) : setHeight(e.target.value.replace(/\D/g, '')))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
        </div>
      </Field>

      {print && (
        <Field
          label={t("Pixels per inch")}
          htmlFor="new-ppi"
          help={t('How many pixels go in each inch. 300 is sharp on paper; 150 is fine for big posters seen from far away.')}
        >
          <input id="new-ppi" className={inputClass} inputMode="numeric" value={ppi} onChange={(e) => setPpi(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}

      <Field
        label={t("Background")}
        help={t("The color your design starts with. You can paint over it later.")}
        note={BACKGROUNDS.find((b) => b.value === background)!.description}
      >
        <ChoiceGroup name={t("Background")} value={background} options={BACKGROUNDS} onChange={setBackground} />
      </Field>
    </Dialog>
  )
}
