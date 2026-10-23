import { Check, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { drawLayer } from '../editor/compose.ts'
import { getContext2d, validateDocumentSize } from '../editor/document.ts'
import { paintPage } from '../editor/gradient.ts'
import { layersForSize } from '../editor/otherSizes.ts'
import type { EditorDocument } from '../editor/types.ts'
import { decimalInput, documentPpi, formatInUnit, unitToPixels, useUnit } from '../editor/units.ts'
import { SIZE_PRESETS } from '../presets.ts'
import { Dialog, Field } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, inputClass } from './ui.tsx'
import { unitShort } from './unitWords.ts'
import { t } from '../i18n/i18n.ts'

interface SizeChoice {
  id: string
  name: string
  use: string
  width: number
  height: number
}

const PREVIEW_WIDTH = 120
const PREVIEW_HEIGHT = 84

// The open page as it will look at another size: the user's own work, moved to fit.
function SizePreview({ doc, width, height }: { doc: EditorDocument; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height)
  const shownWidth = Math.max(1, Math.round(width * scale))
  const shownHeight = Math.max(1, Math.round(height * scale))

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(shownWidth * dpr)
    canvas.height = Math.round(shownHeight * dpr)
    const ctx = getContext2d(canvas)
    ctx.imageSmoothingQuality = 'high'
    const s = canvas.width / width
    ctx.setTransform(s, 0, 0, s, 0, 0)
    const page = { ...doc, width, height, layers: layersForSize(doc, width, height, false) }
    paintPage(ctx, page, width, height, undefined, '#ffffff')
    for (const layer of page.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      ctx.globalAlpha = layer.opacity
      drawLayer(ctx, page, layer)
    }
  }, [doc, width, height, shownWidth, shownHeight])

  return <canvas ref={ref} aria-hidden className="block rounded-[3px] ring-1 ring-line" style={{ width: shownWidth, height: shownHeight }} />
}

interface SizesDialogProps {
  doc: EditorDocument
  onMake: (sizes: { width: number; height: number }[]) => void
  onClose: () => void
}

// Make other sizes: the page made again at other sizes, each as a new page, with a preview of each
// before anything is made.
export function SizesDialog({ doc, onMake, onClose }: SizesDialogProps) {
  const [unit] = useUnit()
  const ppi = documentPpi(doc)
  const short = unitShort(unit)
  const print = unit !== 'px'
  const [own, setOwn] = useState<SizeChoice[]>([])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [typedWidth, setTypedWidth] = useState('')
  const [typedHeight, setTypedHeight] = useState('')

  const choices = useMemo(
    () => [...SIZE_PRESETS.filter((p) => p.width !== doc.width || p.height !== doc.height), ...own],
    [doc.width, doc.height, own],
  )
  const chosen = choices.filter((c) => picked.has(c.id))
  const shown = (pixels: number) => formatInUnit(pixels, unit, ppi)
  const typed = (text: string) => (print ? decimalInput(text) : text.replace(/\D/g, ''))
  const ownWidth = Math.round(unitToPixels(Number(typedWidth), unit, ppi))
  const ownHeight = Math.round(unitToPixels(Number(typedHeight), unit, ppi))
  const ownError = typedWidth === '' || typedHeight === '' ? null : validateDocumentSize(ownWidth, ownHeight)

  function toggle(id: string) {
    setPicked((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addOwn() {
    if (typedWidth === '' || typedHeight === '' || ownError) return
    const id = `own-${ownWidth}x${ownHeight}`
    if (!choices.some((c) => c.id === id)) {
      setOwn((list) => [...list, { id, name: t('Your own size'), use: '', width: ownWidth, height: ownHeight }])
    }
    setPicked((now) => new Set(now).add(id))
    setTypedWidth('')
    setTypedHeight('')
  }

  return (
    <Dialog
      title={t('Make other sizes')}
      subtitle={t('Pick the sizes you need, like a phone story or a banner. Each one becomes a new page, with everything moved to fit it. This page stays as it is.')}
      submitLabel={chosen.length > 1 ? t('Make {count} sizes', { count: chosen.length }) : t('Make this size')}
      submitDisabled={chosen.length === 0}
      onSubmit={() => onMake(chosen.map(({ width, height }) => ({ width, height })))}
      onClose={onClose}
    >
      <Field
        label={t('Sizes')}
        help={t('Click a size to pick it, and again to unpick it. Each picture shows your page at that size. Pro programs call this alternate layouts or magic resize.')}
      >
        <ul className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
          {choices.map((choice) => {
            const on = picked.has(choice.id)
            return (
              <li key={choice.id}>
                <Tooltip title={choice.name} description={choice.use || t('A size you typed in.')}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${choice.name}, ${shown(choice.width)} × ${shown(choice.height)} ${short}`}
                    onClick={() => toggle(choice.id)}
                    className={`relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors ${
                      on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle'
                    }`}
                  >
                    {on && (
                      <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                        <Check size={13} />
                      </span>
                    )}
                    <span className="flex h-[84px] items-center justify-center">
                      <SizePreview doc={doc} width={choice.width} height={choice.height} />
                    </span>
                    <span className="text-[12px] font-medium leading-tight text-ink">{choice.name}</span>
                    <span dir="ltr" className="text-[11px] tabular-nums text-ink-3">
                      {shown(choice.width)} × {shown(choice.height)} {short}
                    </span>
                  </button>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      </Field>

      <Field
        label={t('Your own size')}
        help={t('Type any width and height, then press Add. It is measured the same way as the rest of the app.')}
        note={ownError ? <span className="text-danger">{ownError}</span> : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              aria-label={t('Width of your own size')}
              className={`${inputClass} pe-14`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={typedWidth}
              onChange={(e) => setTypedWidth(typed(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOwn()
                }
              }}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('wide')}</span>
          </div>
          <span className="text-ink-3">×</span>
          <div className="relative flex-1">
            <input
              aria-label={t('Height of your own size')}
              className={`${inputClass} pe-12`}
              inputMode={print ? 'decimal' : 'numeric'}
              value={typedHeight}
              onChange={(e) => setTypedHeight(typed(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOwn()
                }
              }}
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{t('tall')}</span>
          </div>
          <Button className="h-9 shrink-0 gap-1 px-3 text-[13px]" disabled={typedWidth === '' || typedHeight === '' || !!ownError} onClick={addOwn}>
            <Plus size={15} />
            {t('Add')}
          </Button>
        </div>
      </Field>
    </Dialog>
  )
}
