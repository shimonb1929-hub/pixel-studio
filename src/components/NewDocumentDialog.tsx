import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { MAX_DOCUMENT_SIDE, validateDocumentSize, type BackgroundFill } from '../editor/document.ts'
import { ChoiceGroup, Dialog, Field, inputClass } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'

export interface NewDocumentOptions {
  name: string
  width: number
  height: number
  background: BackgroundFill
}

const PRESETS = [
  { id: 'hd', label: 'Screen or video, 1920 × 1080', width: 1920, height: 1080 },
  { id: 'square', label: 'Square social post, 1080 × 1080', width: 1080, height: 1080 },
  { id: 'story', label: 'Phone story, 1080 × 1920', width: 1080, height: 1920 },
  { id: 'banner', label: 'Website banner, 1200 × 630', width: 1200, height: 630 },
  { id: 'a4', label: 'A4 page for printing, 2480 × 3508', width: 2480, height: 3508 },
  { id: 'letter', label: 'Letter page for printing, 2550 × 3300', width: 2550, height: 3300 },
  { id: 'small', label: 'Small, 800 × 600', width: 800, height: 600 },
]

const BACKGROUNDS: { value: BackgroundFill; label: string; description: string }[] = [
  { value: 'white', label: 'White', description: 'Starts as a plain white sheet, like paper.' },
  { value: 'black', label: 'Black', description: 'Starts as a solid black sheet.' },
  {
    value: 'transparent',
    label: 'Transparent',
    description:
      'Starts see-through. Gray and white squares show the empty areas. Good for cut-outs and graphics you will place on top of something else.',
  },
]

interface NewDocumentDialogProps {
  defaultName: string
  onCreate: (options: NewDocumentOptions) => void
  onClose: () => void
}

function describeShape(width: number, height: number): string {
  if (width === height) return 'square'
  return width > height ? 'wide (landscape)' : 'tall (portrait)'
}

export function NewDocumentDialog({ defaultName, onCreate, onClose }: NewDocumentDialogProps) {
  const [name, setName] = useState(defaultName)
  const [width, setWidth] = useState('1920')
  const [height, setHeight] = useState('1080')
  const [background, setBackground] = useState<BackgroundFill>('white')

  const widthValue = Number(width)
  const heightValue = Number(height)
  const sizeError = width === '' || height === '' ? 'Enter a width and a height.' : validateDocumentSize(widthValue, heightValue)
  const preset = PRESETS.find((p) => p.width === widthValue && p.height === heightValue)

  function handleSubmit() {
    if (sizeError) return
    onCreate({ name: name.trim() || defaultName, width: widthValue, height: heightValue, background })
  }

  return (
    <Dialog title="New image" submitLabel="Create" submitDisabled={!!sizeError} onSubmit={handleSubmit} onClose={onClose}>
      <Field label="Name" htmlFor="new-name" help="What this image is called. It is used as the file name when you export.">
        <input id="new-name" data-autofocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field
        label="Ready-made size"
        htmlFor="new-preset"
        help="Common sizes for screens, social posts and printed pages. Pick one, or type your own width and height below."
      >
        <select
          id="new-preset"
          className={inputClass}
          value={preset?.id ?? 'custom'}
          onChange={(e) => {
            const next = PRESETS.find((p) => p.id === e.target.value)
            if (!next) return
            setWidth(String(next.width))
            setHeight(String(next.height))
          }}
        >
          <option value="custom" disabled>
            Custom size
          </option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Size in pixels"
        help={`Pixels are the tiny colored squares every digital image is made of. More pixels means more detail and a bigger file. Up to ${MAX_DOCUMENT_SIDE.toLocaleString('en-US')} on each side.`}
        note={
          sizeError ? (
            <span className="text-red-400">{sizeError}</span>
          ) : (
            `${widthValue.toLocaleString('en-US')} pixels wide and ${heightValue.toLocaleString('en-US')} pixels tall, ${describeShape(widthValue, heightValue)}.`
          )
        }
      >
        <div className="flex items-center gap-2">
          <input
            aria-label="Width in pixels"
            className={inputClass}
            inputMode="numeric"
            value={width}
            onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
          />
          <Tooltip title="Swap width and height" description="Turns the image sideways: a wide image becomes tall, and a tall one becomes wide.">
            <button
              type="button"
              aria-label="Swap width and height"
              onClick={() => {
                setWidth(height)
                setHeight(width)
              }}
              className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <ArrowLeftRight size={15} />
            </button>
          </Tooltip>
          <input
            aria-label="Height in pixels"
            className={inputClass}
            inputMode="numeric"
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </Field>

      <Field
        label="Background"
        help="The color your image starts with. You can paint over it later."
        note={BACKGROUNDS.find((b) => b.value === background)!.description}
      >
        <ChoiceGroup name="Background" value={background} options={BACKGROUNDS} onChange={setBackground} />
      </Field>
    </Dialog>
  )
}
