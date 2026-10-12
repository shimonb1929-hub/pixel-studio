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

  const widthValue = Number(width)
  const heightValue = Number(height)
  const sizeError =
    width === '' || height === '' ? t('Type a width and a height.') : validateDocumentSize(widthValue, heightValue)
  const preset = SIZE_PRESETS.find((p) => p.width === widthValue && p.height === heightValue)

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
          }}
        >
          <option value="custom" disabled>
            {t('My own size')}
          </option>
          {SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.width} × {p.height})
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t("Size in pixels")}
        help={t('Pixels are the tiny colored squares every digital picture is made of. More pixels means more detail and a bigger file. Up to {max} on each side.', { max: MAX_DOCUMENT_SIDE.toLocaleString('en-US') })}
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
              aria-label={t("Width in pixels")}
              className={`${inputClass} pe-14`}
              inputMode="numeric"
              value={width}
              onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
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
              aria-label={t("Height in pixels")}
              className={`${inputClass} pe-12`}
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
        </div>
      </Field>

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
