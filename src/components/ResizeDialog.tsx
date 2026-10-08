import { Link, Unlink } from 'lucide-react'
import { useState } from 'react'
import { validateDocumentSize } from '../editor/document.ts'
import { Dialog, Field } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, inputClass } from './ui.tsx'

interface ResizeDialogProps {
  width: number
  height: number
  onResize: (width: number, height: number) => void
  onClose: () => void
}

const QUICK_SIZES = [25, 50, 200]

function describeResize(width: number, height: number, newWidth: number, newHeight: number): string {
  if (newWidth === width && newHeight === height) return 'This is the size it is now.'
  if (newWidth > width || newHeight > height) {
    return 'Making a design bigger can make it look a little soft, because new pixels have to be filled in between the old ones.'
  }
  return 'Making a design smaller keeps it sharp, but very small details may disappear.'
}

export function ResizeDialog({ width, height, onResize, onClose }: ResizeDialogProps) {
  const [newWidth, setNewWidth] = useState(String(width))
  const [newHeight, setNewHeight] = useState(String(height))
  const [keepShape, setKeepShape] = useState(true)

  const w = Number(newWidth)
  const h = Number(newHeight)
  const error = newWidth === '' || newHeight === '' ? 'Type a width and a height.' : validateDocumentSize(w, h)

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
      title="Resize design"
      subtitle={`Make the whole design, with every layer, bigger or smaller. It is ${width} × ${height} pixels now.`}
      submitLabel="Resize"
      submitDisabled={!!error}
      onSubmit={() => !error && onResize(w, h)}
      onClose={onClose}
    >
      <Field
        label="New size in pixels"
        help="The new width and height. With Keep shape on, changing one changes the other too, so nothing gets squashed."
        note={error ? <span className="text-danger">{error}</span> : describeResize(width, height, w, h)}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input aria-label="New width in pixels" data-autofocus className={`${inputClass} pr-14`} inputMode="numeric" value={newWidth} onChange={(e) => changeWidth(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">wide</span>
          </div>
          <Tooltip title="Keep shape" description="Keep the width and height in step, so the design is not squashed or stretched.">
            <button
              type="button"
              aria-label="Keep shape"
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
            <input aria-label="New height in pixels" className={`${inputClass} pr-12`} inputMode="numeric" value={newHeight} onChange={(e) => changeHeight(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">tall</span>
          </div>
        </div>
      </Field>

      <Field label="Quick sizes" help="Shrink or grow the design by a set amount, keeping its shape.">
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
