import { useEffect, useState } from 'react'
import { exportFileName, formatFileSize, stripExtension, type ExportFormat } from '../editor/fileNames.ts'
import { exportDocument } from '../editor/io.ts'
import type { EditorDocument } from '../editor/types.ts'
import { ChoiceGroup, Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'

export interface ExportOptions {
  format: ExportFormat
  // 1–100, only used for JPG.
  quality: number
  fileName: string
}

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  {
    value: 'png',
    label: 'PNG',
    description:
      'Keeps every detail and any see-through parts. Files are bigger. Best for drawings, text, graphics and screenshots.',
  },
  {
    value: 'jpeg',
    label: 'JPG',
    description:
      'Makes much smaller files and is best for photos. It cannot be see-through, so empty parts turn white. A tiny bit of detail is lost.',
  },
  {
    value: 'project',
    label: 'Project',
    description:
      'Keeps every layer, so you can open it in Pixel Studio later and keep editing, on this computer or another one. Other programs can’t open it.',
  },
]

// Above this many pixels, measuring the file size on every change gets slow.
const ESTIMATE_PIXEL_LIMIT = 16_000_000

function describeQuality(quality: number): string {
  if (quality >= 90) return 'Very high quality. Looks just like your design.'
  if (quality >= 75) return 'High quality. Hard to tell apart from your design, and a good choice for most things.'
  if (quality >= 50) return 'Medium quality. Fine for websites, but edges may look a little soft.'
  return 'Low quality. A very small file, but you will probably see blur and blocky patches.'
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
      title="Download your design"
      subtitle="Save it to your computer as a picture to share or print, or as a project to keep editing later."
      submitLabel="Download"
      onSubmit={() => onExport({ format, quality, fileName })}
      onClose={onClose}
    >
      <Field
        label="File type"
        help="How your design is stored. PNG keeps everything perfect. JPG makes small files for photos. Project keeps every layer so you can keep editing."
        note={FORMATS.find((f) => f.value === format)!.description}
      >
        <ChoiceGroup name="File type" value={format} options={FORMATS} onChange={setFormat} />
      </Field>

      {format === 'jpeg' && (
        <Field
          label="Quality"
          htmlFor="export-quality"
          help="Lower quality makes a smaller file, but the picture can look blurry or blocky. Move the slider and watch the file size change."
          note={describeQuality(quality)}
        >
          <div className="flex items-center gap-3">
            <input
              id="export-quality"
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right text-sm font-medium tabular-nums">{quality}</span>
          </div>
        </Field>
      )}

      <Field
        label="File name"
        htmlFor="export-name"
        help="The name of the saved file. The ending (like .png) is added for you."
        note={
          format === 'project'
            ? `Saves as ${fileName}, usually into your Downloads folder. To keep editing, open it with Open… in Pixel Studio.`
            : `Saves as ${fileName}, usually into your Downloads folder.`
        }
      >
        <input id="export-name" data-autofocus className={inputClass} value={baseName} onChange={(e) => setBaseName(e.target.value)} />
      </Field>

      {canEstimate && (
        <div className="flex items-center justify-between rounded-[10px] bg-subtle px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-2">File size</span>
          <span className="font-medium tabular-nums">
            {estimate && estimate.key === estimateKey ? `About ${formatFileSize(estimate.size)}` : 'Measuring…'}
          </span>
        </div>
      )}
    </Dialog>
  )
}
