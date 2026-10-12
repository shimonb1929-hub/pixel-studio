import { Link, Unlink } from 'lucide-react'
import { useState } from 'react'
import { validateDocumentSize } from '../editor/document.ts'
import { Dialog, Field } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, inputClass } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

interface ResizeDialogProps {
  width: number
  height: number
  onResize: (width: number, height: number) => void
  onClose: () => void
}

const QUICK_SIZES = [25, 50, 200]

function describeResize(width: number, height: number, newWidth: number, newHeight: number): string {
  if (newWidth === width && newHeight === height) return t('This is the size it is now.')
  if (newWidth > width || newHeight > height) {
    return t('Shapes stay sharp at any size. Photos only have the detail they came with, so made much bigger than that they can look a little soft.')
  }
  return t('Making a design smaller keeps it sharp. Every picture keeps all its pixels, so you can make it big again later without losing anything.')
}

export function ResizeDialog({ width, height, onResize, onClose }: ResizeDialogProps) {
  const [newWidth, setNewWidth] = useState(String(width))
  const [newHeight, setNewHeight] = useState(String(height))
  const [keepShape, setKeepShape] = useState(true)

  const w = Number(newWidth)
  const h = Number(newHeight)
  const error = newWidth === '' || newHeight === '' ? t('Type a width and a height.') : validateDocumentSize(w, h)

  function changeWidth(text: string) {
    const digits = text.replace(/\D/g, '')
    setNewWidth(digits)
    if (keepShape && digits) setNewHeight(String(Math.max(1, Math.round((Number(digits) * height) / width))))
  }

  function changeHeight(text: string) {
    const digits = text.replace(/\D/g, '')
    setNewHeight(digits)
    if (keepShape && digits) setNewWidth(String(Math.max(1, Math.round((Number(digits) * width) / height))))
  }

  return (
    <Dialog
      title={t("Resize design")}
      subtitle={t('Make the whole design, with every layer, bigger or smaller. It is {width} × {height} pixels now.', { width, height })}
      submitLabel={t("Resize")}
      submitDisabled={!!error}
      onSubmit={() => !error && onResize(w, h)}
      onClose={onClose}
    >
      <Field
        label={t("New size in pixels")}
        help={t("The new width and height. With Keep shape on, changing one changes the other too, so nothing gets squashed.")}
        note={error ? <span className="text-danger">{error}</span> : describeResize(width, height, w, h)}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input aria-label={t("New width in pixels")} data-autofocus className={`${inputClass} pe-14`} inputMode="numeric" value={newWidth} onChange={(e) => changeWidth(e.target.value)} />
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
            <input aria-label={t("New height in pixels")} className={`${inputClass} pe-12`} inputMode="numeric" value={newHeight} onChange={(e) => changeHeight(e.target.value)} />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
        </div>
      </Field>

      <Field label={t("Quick sizes")} help={t("Shrink or grow the design by a set amount, keeping its shape.")}>
        <div className="flex gap-2">
          {QUICK_SIZES.map((percent) => (
            <Button
              key={percent}
              className="h-8 flex-1 text-[13px]"
              onClick={() => {
                setKeepShape(true)
                setNewWidth(String(Math.max(1, Math.round((width * percent) / 100))))
                setNewHeight(String(Math.max(1, Math.round((height * percent) / 100))))
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
