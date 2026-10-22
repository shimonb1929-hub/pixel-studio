import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { MAX_DOCUMENT_SIDE, validateDocumentSize, type BackgroundFill } from '../editor/document.ts'
import { SIZE_PRESETS } from '../presets.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { Button, inputClass } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

export interface NewDocumentOptions {
  name: string
  width: number
  height: number
  background: BackgroundFill
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

type SizeUnit = 'pixels' | 'inches'

const UNITS: { value: SizeUnit; label: string; description: string }[] = live([
  { value: 'pixels', label: msg('Pixels'), description: msg('Type the size in pixels. Best for screens, posts and websites.') },
  { value: 'inches', label: msg('Inches'), description: msg('Type the size in inches. Best for things you will print.') },
])

// 300 pixels per inch is sharp on paper; the printed-page presets are made at it.
const DEFAULT_PPI = '300'

// Keeps digits and the first dot, so "8.5" can be typed but "8.5.1" can't.
function decimalInput(value: string): string {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

function toInches(pixels: string, ppi: number): string {
  if (pixels === '' || !(ppi > 0)) return ''
  return String(Math.round((Number(pixels) / ppi) * 100) / 100)
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
  const [width, setWidth] = useState('1920')
  const [height, setHeight] = useState('1080')
  const [background, setBackground] = useState<BackgroundFill>('white')
  const [unit, setUnit] = useState<SizeUnit>('pixels')
  const [widthInches, setWidthInches] = useState('')
  const [heightInches, setHeightInches] = useState('')
  const [ppi, setPpi] = useState(DEFAULT_PPI)

  const inches = unit === 'inches'
  const ppiValue = Number(ppi)
  // Untouched inches keep the exact pixels they came from, not a rounded copy (A4 stays 2480 wide).
  const inchesEdited = widthInches !== toInches(width, ppiValue) || heightInches !== toInches(height, ppiValue)
  const fromInches = inches && inchesEdited
  const widthValue = fromInches ? Math.round(Number(widthInches) * ppiValue) : Number(width)
  const heightValue = fromInches ? Math.round(Number(heightInches) * ppiValue) : Number(height)
  const sizeError =
    (inches ? widthInches === '' || heightInches === '' : width === '' || height === '')
      ? t('Type a width and a height.')
      : inches && !(ppiValue > 0)
        ? t('Type how many pixels go in each inch.')
        : validateDocumentSize(widthValue, heightValue)
  // In inches a preset is found by its rounded inches, so A4 (8.27 × 11.69) still shows as A4.
  const preset = SIZE_PRESETS.find((p) =>
    inches
      ? toInches(String(p.width), ppiValue) === widthInches && toInches(String(p.height), ppiValue) === heightInches
      : p.width === widthValue && p.height === heightValue,
  )

  function handleSubmit() {
    if (sizeError) return
    onCreate({ name: name.trim() || defaultName, width: widthValue, height: heightValue, background })
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
            setWidthInches(toInches(String(next.width), ppiValue))
            setHeightInches(toInches(String(next.height), ppiValue))
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

      <Field label={t("Measure in")} help={t("Type the size in pixels for screens, or in inches for print.")} note={UNITS.find((u) => u.value === unit)!.description}>
        <ChoiceGroup
          name={t("Measure in")}
          value={unit}
          options={UNITS}
          onChange={(next) => {
            if (next === unit) return
            // Carry the size across so switching never loses what was typed.
            if (next === 'inches') {
              setWidthInches(toInches(width, ppiValue))
              setHeightInches(toInches(height, ppiValue))
            } else if (!sizeError && inchesEdited) {
              setWidth(String(widthValue))
              setHeight(String(heightValue))
            }
            setUnit(next)
          }}
        />
      </Field>

      <Field
        label={inches ? t("Size in inches") : t("Size in pixels")}
        help={
          inches
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
              aria-label={inches ? t("Width in inches") : t("Width in pixels")}
              className={`${inputClass} pe-14`}
              inputMode={inches ? 'decimal' : 'numeric'}
              value={inches ? widthInches : width}
              onChange={(e) => (inches ? setWidthInches(decimalInput(e.target.value)) : setWidth(e.target.value.replace(/\D/g, '')))}
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
              setWidthInches(heightInches)
              setHeightInches(widthInches)
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
              aria-label={inches ? t("Height in inches") : t("Height in pixels")}
              className={`${inputClass} pe-12`}
              inputMode={inches ? 'decimal' : 'numeric'}
              value={inches ? heightInches : height}
              onChange={(e) => (inches ? setHeightInches(decimalInput(e.target.value)) : setHeight(e.target.value.replace(/\D/g, '')))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
        </div>
      </Field>

      {inches && (
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
