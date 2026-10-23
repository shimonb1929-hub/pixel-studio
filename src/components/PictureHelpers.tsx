import { Eye } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { readWords, type OcrProgress } from '../ai/ocr.ts'
import { OCR_ENGINE_BYTES, OCR_LANGUAGE_BYTES, type OcrLanguage } from '../ai/ocrFiles.ts'
import { addWordLayers, defaultOcrLanguages, wordLayers, type FoundLine } from '../ai/ocrLayout.ts'
import { createId } from '../editor/document.ts'
import { replaceLayer } from '../editor/layers.ts'
import type { EditorDocument, PixelLayer } from '../editor/types.ts'
import { documentPpi } from '../editor/units.ts'
import { busiestSpot, printDetail, upscalePart, upscalePlan, UPSCALE_FACTORS, withUpscaledPixels, type UpscaleFactor } from '../editor/upscale.ts'
import { canvasPixels, pixelsCanvas, upscaleCanvas } from '../editor/upscaleRun.ts'
import type { ChangeOptions } from '../hooks/useEditor.ts'
import { language, t } from '../i18n/i18n.ts'
import { DEFAULT_FONT, loadFont } from '../text/fonts.ts'
import { DEFAULT_TEXT_STYLE } from '../text/presets.ts'
import { textMeasure, textName } from '../text/textLayer.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'

// The helpers for a picked photo that open a window of their own: Bigger and sharper, and Words
// from a picture. Each shows what it will do before anything changes, and adds one undo step.

export type PictureHelperKind = 'upscale' | 'words'

interface PictureHelperProps {
  kind: PictureHelperKind
  doc: EditorDocument
  layer: PixelLayer
  change: (label: string, update: (doc: EditorDocument) => EditorDocument, options?: ChangeOptions) => void
  inform: (message: string) => void
  problem: (message: string) => void
  onClose: () => void
}

export function PictureHelper(props: PictureHelperProps) {
  return props.kind === 'upscale' ? <UpscaleDialog {...props} /> : <WordsDialog {...props} />
}

function Progress({ share, label }: { share: number; label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <p className="text-[13px] text-ink">{label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  )
}

function Warning({ children }: { children: string }) {
  return <p className="rounded-lg border border-[#f9dbaf] bg-danger-soft px-3 py-2 text-xs leading-relaxed text-[#93370d]">{children}</p>
}

// ——— Bigger and sharper ———

const PREVIEW_SIZE = 240

// A spot of the photo with lots of detail, found on a small copy so it's quick even for big photos.
function detailedSpot(source: HTMLCanvasElement, size: number): { x: number; y: number } {
  const shrink = Math.min(1, 400 / Math.max(source.width, source.height))
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(source.width * shrink))
  small.height = Math.max(1, Math.round(source.height * shrink))
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, small.width, small.height)
  const spot = busiestSpot(canvasPixels(small), Math.max(4, Math.round(size * shrink)))
  return {
    x: Math.max(0, Math.min(source.width - size, Math.round(spot.x / shrink))),
    y: Math.max(0, Math.min(source.height - size, Math.round(spot.y / shrink))),
  }
}

// The preview: one spot of the photo, one new pixel to one screen dot. Press and hold to see the
// same spot as it is now (enlarged the usual way, as it would print without this).
function UpscalePreview({ source, factor }: { source: HTMLCanvasElement; factor: UpscaleFactor }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [comparing, setComparing] = useState(false)
  const dpr = window.devicePixelRatio || 1
  const size = Math.max(4, Math.min(Math.ceil((PREVIEW_SIZE * dpr) / factor), source.width, source.height))
  const spot = useMemo(() => detailedSpot(source, size), [source, size])
  const after = useMemo(() => {
    const rim = 6
    const x0 = Math.max(0, spot.x - rim)
    const y0 = Math.max(0, spot.y - rim)
    const x1 = Math.min(source.width, spot.x + size + rim)
    const y1 = Math.min(source.height, spot.y + size + rim)
    const piece = source.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0)
    return pixelsCanvas(upscalePart({ data: piece.data, width: piece.width, height: piece.height }, factor, spot.x - x0, spot.y - y0, size))
  }, [source, factor, spot, size])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = size * factor
    canvas.height = size * factor
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (comparing) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, spot.x, spot.y, size, size, 0, 0, size * factor, size * factor)
    } else {
      ctx.drawImage(after, 0, 0)
    }
  }, [after, comparing, factor, size, source, spot])

  const stop = () => setComparing(false)
  return (
    <div className="space-y-2">
      <Tooltip className="flex justify-center" title={t('Hold to compare')} description={t('Press and hold to see this spot as it is now. Let go to see it bigger and sharper.')}>
        <canvas
          ref={ref}
          data-testid="upscale-preview"
          aria-label={comparing ? t('Before') : t('After')}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            setComparing(true)
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          className="block cursor-pointer touch-none select-none rounded-lg border border-line bg-[repeating-conic-gradient(#f4f5f7_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
          style={{ width: (size * factor) / dpr, height: (size * factor) / dpr }}
        />
      </Tooltip>
      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-2">
        <Eye size={14} aria-hidden />
        {comparing ? t('Before: the photo as it is now, enlarged.') : t('After: press and hold the picture to compare.')}
      </p>
    </div>
  )
}

function UpscaleDialog({ doc, layer, change, inform, problem, onClose }: PictureHelperProps) {
  const [factor, setFactor] = useState<UpscaleFactor>(2)
  const [share, setShare] = useState<number | null>(null)
  const stopRef = useRef<AbortController | null>(null)
  const source = layer.canvas
  const plan = upscalePlan(source.width, source.height, factor)
  const shownWidth = layer.box ? Math.abs(layer.box.width) : source.width
  const ppi = documentPpi(doc)
  const now = printDetail(source.width, shownWidth, ppi)
  const after = printDetail(plan.width, shownWidth, ppi)
  const megapixels = (Math.round(plan.megapixels * 10) / 10).toLocaleString()

  useEffect(() => () => stopRef.current?.abort(), [])

  async function apply() {
    if (plan.verdict === 'too-big' || share !== null) return
    const stop = new AbortController()
    stopRef.current = stop
    setShare(0)
    try {
      const canvas = await upscaleCanvas(source, factor, setShare, stop.signal)
      change(
        t('Bigger and sharper'),
        (d) => {
          const now = d.layers.find((l) => l.id === layer.id)
          return now?.kind === 'raster' && now.canvas === source ? replaceLayer(d, withUpscaledPixels(now, canvas)) : d
        },
        { bytes: canvas.width * canvas.height * 4 },
      )
      inform(t('“{name}” now has {width} × {height} pixels. It looks the same on your design and prints sharper. You can undo it.', { name: layer.name, width: canvas.width, height: canvas.height }))
      onClose()
    } catch (error) {
      if (stop.signal.aborted) return
      console.error(error)
      problem(t('The photo could not be made bigger. It may be too big for this browser: try 2 times, or crop it first.'))
      onClose()
    }
  }

  const options = UPSCALE_FACTORS.map((f) => {
    const p = upscalePlan(source.width, source.height, f)
    return {
      value: String(f) as `${UpscaleFactor}`,
      label: f === 2 ? t('2 times') : t('4 times'),
      detail: `${p.width.toLocaleString()} × ${p.height.toLocaleString()}`,
      description: f === 2 ? t('Twice as wide and twice as tall: four times the pixels. Enough for most prints.') : t('Four times as wide and tall: sixteen times the pixels. For very small photos printed large.'),
    }
  })

  return (
    <Dialog
      title={t('Bigger and sharper')}
      subtitle={t('Gives “{name}” more pixels, so it prints sharp. It stays the same size on your design. No AI: nothing is made up, the photo’s own detail is kept crisp.', { name: layer.name })}
      submitLabel={share === null ? t('Apply') : t('Working…')}
      submitDisabled={plan.verdict === 'too-big' || share !== null}
      onSubmit={() => void apply()}
      onClose={onClose}
    >
      <Field label={t('How much bigger')} help={t('How many more pixels the photo gets. More pixels print sharper but make your design heavier.')}>
        <ChoiceGroup name={t('How much bigger')} value={String(factor) as `${UpscaleFactor}`} options={options} onChange={(value) => setFactor(Number(value) as UpscaleFactor)} />
      </Field>
      {share === null ? (
        <>
          <UpscalePreview source={source} factor={factor} />
          <p className="text-xs leading-relaxed text-ink-2">
            {t('Printed at its size on your design: now {now} dots per inch, after {after}. Sharp prints need about 300.', { now, after })}
          </p>
          {plan.verdict === 'large' && <Warning>{t('This makes a very big photo ({megapixels} megapixels). It can take a minute, and your design gets heavier to save.', { megapixels })}</Warning>}
          {plan.verdict === 'too-big' && <Warning>{t('Too big: this would make a {megapixels}-megapixel photo, more than a browser can safely hold. Choose 2 times, or crop the photo first.', { megapixels })}</Warning>}
        </>
      ) : (
        <Progress share={share} label={t('Making it bigger and sharper… {percent}%', { percent: Math.round(share * 100) })} />
      )}
    </Dialog>
  )
}

// ——— Words from a picture ———

const LANGUAGE_CHOICES: { id: OcrLanguage; name: () => string }[] = [
  { id: 'eng', name: () => t('English') },
  { id: 'heb', name: () => t('Hebrew') },
  { id: 'yid', name: () => t('Yiddish') },
]

type WordsStage = { stage: 'choose' } | { stage: 'reading'; progress: OcrProgress } | { stage: 'found'; lines: FoundLine[] } | { stage: 'failed' }

function WordsDialog({ layer, change, inform, onClose }: PictureHelperProps) {
  const [languages, setLanguages] = useState<OcrLanguage[]>(() => defaultOcrLanguages(language()))
  const [state, setState] = useState<WordsStage>({ stage: 'choose' })
  const openRef = useRef(true)
  useEffect(() => {
    openRef.current = true
    return () => void (openRef.current = false)
  }, [])

  const megabytes = Math.max(1, Math.round((OCR_ENGINE_BYTES + languages.reduce((sum, l) => sum + OCR_LANGUAGE_BYTES[l], 0)) / 1_000_000))

  async function read() {
    setState({ stage: 'reading', progress: { stage: 'preparing', share: 0 } })
    try {
      const lines = await readWords(layer.canvas, languages, (progress) => openRef.current && setState({ stage: 'reading', progress }))
      // The words are measured with their font, so it's loaded first.
      const text = lines.map((l) => l.text).join(' ')
      await Promise.all([400, 700].map((weight) => loadFont({ font: DEFAULT_FONT, weight, italic: false, size: 48 }, text).catch(() => {})))
      if (openRef.current) setState({ stage: 'found', lines })
    } catch (error) {
      console.error(error)
      if (openRef.current) setState({ stage: 'failed' })
    }
  }

  function add(lines: FoundLine[]) {
    const words = wordLayers(lines, layer, canvasPixels(layer.canvas), { ...DEFAULT_TEXT_STYLE, font: DEFAULT_FONT }, textMeasure, () => createId('layer'), textName)
    const name = t('Words from picture')
    change(name, (d) => addWordLayers(d, layer.id, words, { id: createId('group'), name }))
    inform(
      words.length === 1
        ? t('Added 1 line of words above “{name}”. Double-click it to change the words.', { name: layer.name })
        : t('Added {count} lines of words above “{name}”, kept together. Double-click a line to change its words.', { count: words.length, name: layer.name }),
    )
    onClose()
  }

  const found = state.stage === 'found' ? state.lines : null
  const submitLabel = state.stage === 'reading' ? t('Reading…') : found?.length ? t('Add as text') : state.stage === 'choose' ? t('Find the words') : t('Try again')

  return (
    <Dialog
      title={t('Words from a picture')}
      subtitle={t('Finds the words in “{name}” and puts them on your design as real text you can change, where they were and about the same size and color. The photo stays as it is.', { name: layer.name })}
      submitLabel={submitLabel}
      submitDisabled={state.stage === 'reading' || languages.length === 0}
      onSubmit={() => (found?.length ? add(found) : void read())}
      onClose={onClose}
    >
      <Field
        label={t('Languages in the picture')}
        help={t('Which languages to look for. Pick only the ones in the picture: it reads them better.')}
        note={languages.length === 0 ? t('Pick at least one language.') : t('The first time, the word reader comes from Pixel Studio itself (about {size} MB). After that it works without internet.', { size: megabytes })}
      >
        <div role="group" aria-label={t('Languages in the picture')} className="flex gap-1 rounded-[10px] border border-line bg-subtle p-1">
          {LANGUAGE_CHOICES.map((choice) => {
            const on = languages.includes(choice.id)
            return (
              <button
                key={choice.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={state.stage === 'reading'}
                onClick={() => {
                  setLanguages(on ? languages.filter((l) => l !== choice.id) : [...languages, choice.id])
                  if (state.stage !== 'reading') setState({ stage: 'choose' })
                }}
                className={`flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
              >
                {choice.name()}
              </button>
            )
          })}
        </div>
      </Field>
      {state.stage === 'reading' && (
        <Progress
          share={state.progress.share}
          label={
            state.progress.stage === 'reading'
              ? t('Reading the words… {percent}%', { percent: Math.round(state.progress.share * 100) })
              : t('Getting the word reader ready…')
          }
        />
      )}
      {state.stage === 'failed' && <Warning>{t('The word reader could not start. Its files come from Pixel Studio the first time: check that you are online, then try again.')}</Warning>}
      {found && found.length === 0 && (
        <Warning>{t('No words were found. Words come out best from a sharp, straight photo or scan. Check the languages, or try a bigger picture.')}</Warning>
      )}
      {found && found.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink">
            {found.length === 1 ? t('Found 1 line of words:') : t('Found {count} lines of words:', { count: found.length })}
          </p>
          <ul data-testid="found-words" className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line bg-subtle p-2 text-[13px] text-ink">
            {found.map((line, i) => (
              <li key={i} dir="auto" className="truncate">
                {line.text}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-2">{t('Press Add as text to put them on your design. You can undo it.')}</p>
        </div>
      )}
    </Dialog>
  )
}
