import { ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { exportFileName, formatFileSize, stripExtension, type ExportFormat } from '../editor/fileNames.ts'
import { exportDocument } from '../editor/io.ts'
import { defaultWidthInches, type PdfPurpose, type PdfSettings } from '../editor/pdfLayout.ts'
import type { EditorDocument } from '../editor/types.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

export interface ExportOptions {
  format: ExportFormat
  // 1–100, only used for JPG.
  quality: number
  fileName: string
  pdf: PdfSettings
}

// Plain words first, so anyone can choose; the file type's short name sits underneath for those
// who know it.
const FORMATS: { value: ExportFormat; label: string; detail: string; description: string }[] = live([
  {
    value: 'png',
    label: msg('Best quality'),
    detail: 'PNG',
    description:
      msg('Keeps every detail and any see-through parts. Files are bigger. Best for drawings, text, graphics and screenshots.'),
  },
  {
    value: 'jpeg',
    label: msg('Small file'),
    detail: 'JPG',
    description:
      msg('Makes much smaller files and is best for photos. It cannot be see-through, so empty parts turn white. A tiny bit of detail is lost.'),
  },
  {
    value: 'pdf',
    label: msg('Page'),
    detail: 'PDF',
    description:
      msg('A page that opens the same everywhere and is ready to print or send. Text stays sharp, and Hebrew and Yiddish read right to left just as you see them.'),
  },
  {
    value: 'project',
    label: msg('Project'),
    detail: msg('Keep editing'),
    description:
      msg('Keeps every layer, so you can open it in Pixel Studio later and keep editing, on this computer or another one. Other programs can’t open it.'),
  },
])

const PURPOSES: { value: PdfPurpose; label: string; description: string }[] = live([
  {
    value: 'screen',
    label: msg('Screen'),
    description: msg('For sending by email or reading on a computer or phone. A small file that still looks sharp.'),
  },
  {
    value: 'print',
    label: msg('Printing'),
    description: msg('For printing at home or at a print shop. Every detail is kept, so the file is bigger.'),
  },
])

// Below this many design pixels for each inch of paper, photos start to look soft when printed.
const SOFT_PPI = 150

// Keeps digits and the first dot, so "8.5" can be typed but "8.5.1" can't.
function decimalInput(value: string): string {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

function inchesText(inches: number): string {
  return String(Math.round(inches * 100) / 100)
}

function hasPhotos(doc: EditorDocument): boolean {
  return doc.layers.some((l) => l.visible && (l.kind === 'raster' || (l.kind === 'shape' && l.fill.kind === 'photo')))
}

function Check({ checked, onChange, label, help }: { checked: boolean; onChange: (checked: boolean) => void; label: string; help: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-xs leading-relaxed text-ink-2">{help}</span>
      </span>
    </label>
  )
}

// Above this many pixels, measuring the file size on every change gets slow.
const ESTIMATE_PIXEL_LIMIT = 16_000_000

function describeQuality(quality: number): string {
  if (quality >= 90) return t('Very high quality. Looks just like your design.')
  if (quality >= 75) return t('High quality. Hard to tell apart from your design, and a good choice for most things.')
  if (quality >= 50) return t('Medium quality. Fine for websites, but edges may look a little soft.')
  return t('Low quality. A very small file, but you will probably see blur and blocky patches.')
}

interface ExportDialogProps {
  doc: EditorDocument
  initialFormat?: ExportFormat
  onExport: (options: ExportOptions) => void
  onClose: () => void
}

export function ExportDialog({ doc, initialFormat = 'png', onExport, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const [quality, setQuality] = useState(90)
  const [baseName, setBaseName] = useState(() => stripExtension(doc.name))
  const [estimate, setEstimate] = useState<{ key: string; size: number } | null>(null)
  const [purpose, setPurpose] = useState<PdfPurpose>('print')
  // Typed as text so "8." can be on the way to "8.5"; the other side follows the design's shape.
  const [paperWidth, setPaperWidth] = useState(() => inchesText(defaultWidthInches(doc.width)))
  const [paperHeight, setPaperHeight] = useState(() => inchesText((defaultWidthInches(doc.width) * doc.height) / doc.width))
  // The side typed last is kept exact; the other is rounded for showing. Untouched, the size is the
  // exact one at 300 pixels per inch, so an A4 design prints exactly A4.
  const [paperSide, setPaperSide] = useState<'width' | 'height' | null>(null)
  const [showPrintShop, setShowPrintShop] = useState(false)
  const [bleed, setBleed] = useState(false)
  const [cropMarks, setCropMarks] = useState(false)

  const widthInches =
    paperSide === 'width' ? Number(paperWidth) : paperSide === 'height' ? (Number(paperHeight) * doc.width) / doc.height : defaultWidthInches(doc.width)
  const paperError = purpose === 'print' && !(widthInches > 0 && Number(paperHeight) > 0) ? t('Type how big it should be on paper.') : null
  const pdf: PdfSettings = { purpose, widthInches, bleed, cropMarks }

  // Printing makes a big file that takes a while, so its size is only measured for screens.
  const canEstimate = doc.width * doc.height <= ESTIMATE_PIXEL_LIMIT && !(format === 'pdf' && purpose === 'print')
  const estimateKey = `${format}:${quality}:${purpose}`

  useEffect(() => {
    if (!canEstimate) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      exportDocument(doc, format, quality / 100, { purpose, widthInches: 0, bleed: false, cropMarks: false })
        .then((blob) => !cancelled && setEstimate({ key: `${format}:${quality}:${purpose}`, size: blob.size }))
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [doc, format, quality, purpose, canEstimate])

  const fileName = exportFileName(baseName, format)

  function paperSizeNote(): ReactNode {
    if (paperError) return <span className="text-danger">{paperError}</span>
    const cm = (inches: number) => String(Math.round(inches * 25.4) / 10)
    const size = t('Prints {width} × {height} inches ({cmWidth} × {cmHeight} cm).', {
      width: inchesText(widthInches),
      height: paperHeight,
      cmWidth: cm(widthInches),
      cmHeight: cm(Number(paperHeight)),
    })
    const soft = hasPhotos(doc) && doc.width / widthInches < SOFT_PPI
    return `${size} ${soft ? t('Text and shapes stay sharp at any size, but photos may look a little soft this big.') : t('Text and shapes stay sharp at any size.')}`
  }

  return (
    <Dialog
      title={t("Download your design")}
      subtitle={t("Save it to your computer as a picture to share or print, or as a project to keep editing later.")}
      submitLabel={t("Download")}
      submitDisabled={format === 'pdf' && !!paperError}
      onSubmit={() => onExport({ format, quality, fileName, pdf })}
      onClose={onClose}
    >
      <Field
        label={t("File type")}
        help={t("How your design is stored. Best quality keeps everything perfect. Small file is best for photos. Page makes a PDF to print or send. Project keeps every layer so you can keep editing.")}
        note={FORMATS.find((f) => f.value === format)!.description}
      >
        <ChoiceGroup name={t("File type")} value={format} options={FORMATS} onChange={setFormat} />
      </Field>

      {format === 'jpeg' && (
        <Field
          label={t("Quality")}
          htmlFor="export-quality"
          help={t("Lower quality makes a smaller file, but the picture can look blurry or blocky. Move the slider and watch the file size change.")}
          note={describeQuality(quality)}
        >
          <div className="flex items-center gap-3">
            <input
              id="export-quality"
              type="range"
              dir="ltr"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-end text-sm font-medium tabular-nums">{quality}</span>
          </div>
        </Field>
      )}

      {format === 'pdf' && (
        <Field
          label={t("Made for")}
          help={t("Pick Screen for a PDF you will send or read on a computer or phone, and Printing for paper.")}
          note={PURPOSES.find((p) => p.value === purpose)!.description}
        >
          <ChoiceGroup name={t("Made for")} value={purpose} options={PURPOSES} onChange={setPurpose} />
        </Field>
      )}

      {format === 'pdf' && purpose === 'print' && (
        <Field
          label={t("Size on paper")}
          help={t("How big your design prints, in inches. Change one side and the other follows, so nothing gets stretched.")}
          note={paperSizeNote()}
        >
          <div className="flex items-center gap-2">
            {(['width', 'height'] as const).map((side) => (
              <div key={side} className="relative flex-1">
                <input
                  aria-label={side === 'width' ? t('Width in inches') : t('Height in inches')}
                  className={`${inputClass} pe-14`}
                  inputMode="decimal"
                  value={side === 'width' ? paperWidth : paperHeight}
                  onChange={(e) => {
                    const typed = decimalInput(e.target.value)
                    const ratio = side === 'width' ? doc.height / doc.width : doc.width / doc.height
                    const other = Number(typed) > 0 ? inchesText(Number(typed) * ratio) : ''
                    setPaperWidth(side === 'width' ? typed : other)
                    setPaperHeight(side === 'width' ? other : typed)
                    setPaperSide(side)
                  }}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{side === 'width' ? t('wide') : t('tall')}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      {format === 'pdf' && purpose === 'print' && (
        <div>
          <button
            type="button"
            aria-expanded={showPrintShop}
            onClick={() => setShowPrintShop((open) => !open)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            {t('For print shops')}
            <ChevronDown size={14} className={`transition-transform ${showPrintShop ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showPrintShop && (
            <div className="mt-3 space-y-3">
              <Check
                checked={bleed}
                onChange={setBleed}
                label={t('Extra edge for cutting')}
                help={t('Adds a thin strip of your design around the edges, an eighth of an inch (3 mm). Print shops cut a little inside it, so no white line shows. Ask for it if your design has color up to the edge.')}
              />
              <Check
                checked={cropMarks}
                onChange={setCropMarks}
                label={t('Cut lines')}
                help={t('Short lines in the corners, outside your design, that show the print shop exactly where to cut.')}
              />
            </div>
          )}
        </div>
      )}

      <Field
        label={t("File name")}
        htmlFor="export-name"
        help={t("The name of the saved file. The ending (like .png) is added for you.")}
        note={
          format === 'project'
            ? t('Saves as {file}, usually into your Downloads folder. To keep editing, open it with Open… in Pixel Studio.', { file: fileName })
            : t('Saves as {file}, usually into your Downloads folder.', { file: fileName })
        }
      >
        <input id="export-name" data-autofocus className={inputClass} value={baseName} onChange={(e) => setBaseName(e.target.value)} />
      </Field>

      {canEstimate && (
        <div className="flex items-center justify-between rounded-[10px] bg-subtle px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-2">{t('File size')}</span>
          <span className="font-medium tabular-nums">
            {estimate && estimate.key === estimateKey ? t('About {size}', { size: formatFileSize(estimate.size) }) : t('Measuring…')}
          </span>
        </div>
      )}
    </Dialog>
  )
}
