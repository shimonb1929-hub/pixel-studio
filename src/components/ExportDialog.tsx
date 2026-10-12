import { useEffect, useState } from 'react'
import { exportFileName, formatFileSize, stripExtension, type ExportFormat } from '../editor/fileNames.ts'
import { exportDocument } from '../editor/io.ts'
import type { EditorDocument } from '../editor/types.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

export interface ExportOptions {
  format: ExportFormat
  // 1–100, only used for JPG.
  quality: number
  fileName: string
}

const FORMATS: { value: ExportFormat; label: string; description: string }[] = live([
  {
    value: 'png',
    label: 'PNG',
    description:
      msg('Keeps every detail and any see-through parts. Files are bigger. Best for drawings, text, graphics and screenshots.'),
  },
  {
    value: 'jpeg',
    label: 'JPG',
    description:
      msg('Makes much smaller files and is best for photos. It cannot be see-through, so empty parts turn white. A tiny bit of detail is lost.'),
  },
  {
    value: 'project',
    label: msg('Project'),
    description:
      msg('Keeps every layer, so you can open it in Pixel Studio later and keep editing, on this computer or another one. Other programs can’t open it.'),
  },
])

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

  const canEstimate = doc.width * doc.height <= ESTIMATE_PIXEL_LIMIT
  const estimateKey = `${format}:${quality}`

  useEffect(() => {
    if (!canEstimate) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      exportDocument(doc, format, quality / 100)
        .then((blob) => !cancelled && setEstimate({ key: `${format}:${quality}`, size: blob.size }))
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [doc, format, quality, canEstimate])

  const fileName = exportFileName(baseName, format)

  return (
    <Dialog
      title={t("Download your design")}
      subtitle={t("Save it to your computer as a picture to share or print, or as a project to keep editing later.")}
      submitLabel={t("Download")}
      onSubmit={() => onExport({ format, quality, fileName })}
      onClose={onClose}
    >
      <Field
        label={t("File type")}
        help={t("How your design is stored. PNG keeps everything perfect. JPG makes small files for photos. Project keeps every layer so you can keep editing.")}
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
