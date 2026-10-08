import { useEffect, useState } from 'react'
import { exportFileName, formatFileSize, stripExtension, type ExportFormat } from '../editor/fileNames.ts'
import { exportDocument } from '../editor/io.ts'
import type { EditorDocument } from '../editor/types.ts'
import { ChoiceGroup, Dialog, Field, inputClass } from './Dialog.tsx'

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
      'Keeps every detail and any see-through areas. Files are bigger. Best for graphics, text, drawings and screenshots.',
  },
  {
    value: 'jpeg',
    label: 'JPG',
    description:
      'Makes much smaller files and is best for photos. It cannot be see-through, so empty areas turn white. A little detail is lost.',
  },
]

// Above this many pixels, measuring the file size on every change gets slow.
const ESTIMATE_PIXEL_LIMIT = 16_000_000

function describeQuality(quality: number): string {
  if (quality >= 90) return 'Very high quality. Looks just like the original.'
  if (quality >= 75) return 'High quality. Hard to tell apart from the original, and a good balance for most uses.'
  if (quality >= 50) return 'Medium quality. Fine for the web, but edges may look a little soft.'
  return 'Low quality. A very small file, but you will likely see blur and blocky patches.'
}

interface ExportDialogProps {
  doc: EditorDocument
  onExport: (options: ExportOptions) => void
  onClose: () => void
}

export function ExportDialog({ doc, onExport, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png')
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
      title="Export as PNG or JPG"
      submitLabel="Export"
      onSubmit={() => onExport({ format, quality, fileName })}
      onClose={onClose}
    >
      <Field
        label="File type"
        help="How the picture is stored in the file. PNG keeps everything perfect; JPG makes small files for photos."
        note={FORMATS.find((f) => f.value === format)!.description}
      >
        <ChoiceGroup name="File type" value={format} options={FORMATS} onChange={setFormat} />
      </Field>

      {format === 'jpeg' && (
        <Field
          label="Quality"
          htmlFor="export-quality"
          help="Lower quality makes a smaller file, but the picture can look blurry or blocky. Try moving the slider and watch the file size below."
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
              className="flex-1 accent-accent"
            />
            <span className="w-8 text-right text-sm tabular-nums text-zinc-100">{quality}</span>
          </div>
        </Field>
      )}

      <Field
        label="File name"
        htmlFor="export-name"
        help="The name of the saved file. The ending (.png or .jpg) is added for you."
        note={`Saved as ${fileName}. Your browser puts it in your Downloads folder unless you have chosen another place.`}
      >
        <input id="export-name" data-autofocus className={inputClass} value={baseName} onChange={(e) => setBaseName(e.target.value)} />
      </Field>

      {canEstimate && (
        <p className="text-xs text-zinc-400">
          File size:{' '}
          <span className="tabular-nums text-zinc-100">
            {estimate && estimate.key === estimateKey ? `about ${formatFileSize(estimate.size)}` : 'measuring…'}
          </span>
        </p>
      )}
    </Dialog>
  )
}
