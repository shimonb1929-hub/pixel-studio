import { FolderOpen, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SavedDesign } from '../editor/library.ts'
import { useSavedDesigns } from '../hooks/useSavedDesigns.ts'
import { shortcut } from '../keys.ts'
import { SIZE_PRESETS, type SizePreset } from '../presets.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'
import { YourDesigns } from './YourDesigns.tsx'

const PREVIEW_MAX = 40

// An outline with the same shape as the design, so you can see wide, tall or square at a glance.
function ShapePreview({ width, height }: { width: number; height: number }) {
  const scale = PREVIEW_MAX / Math.max(width, height)
  return (
    <div className="flex h-12 w-12 items-center justify-center">
      <div
        className="rounded-[3px] border-[1.5px] border-ink-3/45 bg-subtle transition-colors group-hover:border-accent group-hover:bg-accent-soft"
        style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
      />
    </div>
  )
}

function Tile({ label, detail, preview, onClick }: { label: string; detail: string; preview: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-3 rounded-card border border-line bg-surface px-3 pb-4 pt-5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-float"
    >
      {preview}
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-ink-3">{detail}</span>
      </span>
    </button>
  )
}

interface WelcomeScreenProps {
  // `taken` are the names of the designs already kept, so the new one can be told apart.
  onPreset: (preset: SizePreset, taken: string[]) => void
  onCustom: () => void
  onOpen: () => void
  onOpenDesign: (design: SavedDesign) => Promise<void>
}

export function WelcomeScreen({ onPreset, onCustom, onOpen, onOpenDesign }: WelcomeScreenProps) {
  const { designs, loadedAt, refresh } = useSavedDesigns()
  // People coming back see their designs first, then the ways to start something new.
  const returning = designs.length > 0

  return (
    <div className="flex h-full overflow-y-auto">
      <div className="m-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-center text-[28px] font-semibold tracking-tight text-ink">What are you making today?</h1>
        <p className="mt-2 text-center text-[15px] text-ink-2">
          {returning ? 'Pick up where you left off, or start something new.' : 'Pick a size to start, or open a picture from your computer.'}
        </p>

        {returning && (
          <>
            <YourDesigns designs={designs} now={loadedAt} onOpen={onOpenDesign} onChanged={refresh} />
            <h2 className="mt-10 text-[15px] font-semibold tracking-tight text-ink">Start something new</h2>
          </>
        )}

        <div className={`${returning ? 'mt-3' : 'mt-9'} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
          {SIZE_PRESETS.map((preset) => (
            <Tooltip
              key={preset.id}
              title={preset.name}
              description={`${preset.use} ${preset.width} × ${preset.height} pixels, with a white background.`}
              className="flex"
            >
              <Tile
                label={preset.name}
                detail={`${preset.width} × ${preset.height}`}
                preview={<ShapePreview width={preset.width} height={preset.height} />}
                onClick={() => onPreset(preset, designs.map((d) => d.name))}
              />
            </Tooltip>
          ))}
          <Tooltip
            title="Custom size"
            shortcut={shortcut('mod', 'alt', 'N')}
            description="Choose your own width, height and background color."
            className="flex"
          >
            <Tile
              label="Custom size"
              detail="Your own size"
              preview={
                <div className="flex h-12 w-12 items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[3px] border-[1.5px] border-dashed border-ink-3/45 text-ink-3 transition-colors group-hover:border-accent group-hover:text-accent">
                    <Plus size={18} />
                  </div>
                </div>
              }
              onClick={onCustom}
            />
          </Tooltip>
        </div>

        <div className="mt-9 flex flex-col items-center gap-2.5">
          <Button
            className="h-10 px-5"
            onClick={onOpen}
            tip={{
              title: 'Open a picture',
              shortcut: shortcut('mod', 'O'),
              description: 'Pick a picture from your computer (PNG, JPG, GIF, WebP and more) to edit it, or a Pixel Studio project you downloaded.',
            }}
          >
            <FolderOpen size={16} />
            Open a picture…
          </Button>
          <p className="text-xs text-ink-3">or drop a picture or project file anywhere on this window</p>
        </div>
      </div>
    </div>
  )
}
