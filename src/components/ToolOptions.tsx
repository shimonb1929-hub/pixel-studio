import { RotateCcw } from 'lucide-react'
import {
  BRUSH_PRESETS,
  describeOpacity,
  describeSize,
  describeSmoothing,
  describeSoftness,
  ERASER_PRESETS,
  sameSettings,
  sizeToSlider,
  sliderToSize,
  type BrushSettings,
} from '../editor/brushes.ts'
import type { ToolId } from '../editor/types.ts'
import { toolInfo } from '../tools.ts'
import { StrokePreview } from './StrokePreview.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'

interface PaintOptionsProps {
  erasing: boolean
  settings: BrushSettings
  presetId: string | null
  color: string
  onChange: (settings: BrushSettings, presetId: string | null) => void
}

function PaintOptions({ erasing, settings, presetId, color, onChange }: PaintOptionsProps) {
  const presets = erasing ? ERASER_PRESETS : BRUSH_PRESETS
  const preset = presets.find((p) => p.id === presetId)
  const changed = preset !== undefined && !sameSettings(preset.settings, settings)
  const mode = erasing ? 'erase' : 'paint'
  const set = (patch: Partial<BrushSettings>) => onChange({ ...settings, ...patch }, presetId)

  return (
    <>
      <div role="radiogroup" aria-label={erasing ? 'Ready-made erasers' : 'Ready-made brushes'} className="flex shrink-0 gap-1">
        {presets.map((p) => (
          <Tooltip key={p.id} title={p.name} description={p.description}>
            <button
              type="button"
              role="radio"
              aria-checked={p.id === presetId}
              aria-label={p.name}
              onClick={() => onChange(p.settings, p.id)}
              className={`flex h-[50px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-lg transition-colors xl:w-[74px] ${
                p.id === presetId ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <StrokePreview settings={p.settings} color={color} mode={mode} width={58} height={24} maxSize={14} />
              <span className="text-[11px] font-medium">{p.name}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="h-9 w-px shrink-0 bg-line" />

      <Tooltip
        title={erasing ? 'Your eraser' : 'Your brush'}
        description="A sample of how it works right now. It changes as you move the sliders."
      >
        <div className="hidden h-[42px] w-[104px] shrink-0 items-center justify-center rounded-lg border border-line bg-white xl:flex">
          <StrokePreview settings={settings} color={color} mode={mode} width={96} height={36} maxSize={26} />
        </div>
      </Tooltip>

      <Slider
        className="w-28 shrink-0 xl:w-32"
        label="Size"
        help="How thick the line is."
        value={sizeToSlider(settings.size)}
        display={`${settings.size} px`}
        note={describeSize(settings.size)}
        onChange={(position) => set({ size: sliderToSize(position) })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label="Softness"
        help="How blurry the edge of the line is."
        value={settings.softness}
        display={`${Math.round(settings.softness * 100)}%`}
        note={describeSoftness(settings.softness)}
        onChange={(position) => set({ softness: Math.round(position * 100) / 100 })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label={erasing ? 'Strength' : 'Opacity'}
        help={erasing ? 'How much paint the eraser removes.' : 'How solid the paint is. Lower lets what is underneath show through.'}
        value={settings.opacity}
        display={`${Math.round(settings.opacity * 100)}%`}
        note={describeOpacity(settings.opacity, erasing)}
        onChange={(position) => set({ opacity: Math.max(0.01, Math.round(position * 100) / 100) })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label="Steady hand"
        help="Smooths out shaky lines, so your drawing looks clean and confident."
        value={settings.smoothing}
        display={`${Math.round(settings.smoothing * 100)}%`}
        note={describeSmoothing(settings.smoothing)}
        onChange={(position) => set({ smoothing: Math.round(position * 100) / 100 })}
      />

      {changed && (
        <Button
          variant="ghost"
          className="h-8 shrink-0 px-2.5 text-[13px]"
          onClick={() => onChange(preset.settings, preset.id)}
          tip={{ title: `Reset ${preset.name}`, description: `Put the sliders back to how ${preset.name} started.` }}
        >
          <RotateCcw size={14} />
          Reset
        </Button>
      )}
    </>
  )
}

interface ToolOptionsProps {
  tool: ToolId
  brush: BrushSettings
  brushPresetId: string | null
  eraser: BrushSettings
  eraserPresetId: string | null
  color: string
  onBrushChange: (settings: BrushSettings, presetId: string | null) => void
  onEraserChange: (settings: BrushSettings, presetId: string | null) => void
}

// The bar under the top bar: settings for the tool in use, or what it does if it has none.
export function ToolOptions(props: ToolOptionsProps) {
  const info = toolInfo(props.tool)
  const Icon = info.icon
  return (
    <div
      aria-label={`${info.name} settings`}
      role="toolbar"
      className="mx-2 mb-2 flex h-[62px] shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden rounded-card border border-line bg-surface px-3 shadow-card xl:gap-4"
    >
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span className="text-[13px] font-semibold leading-tight text-ink">{info.name}</span>
      </div>
      <div className="h-9 w-px shrink-0 bg-line" />
      {props.tool === 'brush' ? (
        <PaintOptions erasing={false} settings={props.brush} presetId={props.brushPresetId} color={props.color} onChange={props.onBrushChange} />
      ) : props.tool === 'eraser' ? (
        <PaintOptions erasing settings={props.eraser} presetId={props.eraserPresetId} color={props.color} onChange={props.onEraserChange} />
      ) : (
        <p className="min-w-64 text-[13px] leading-snug text-ink-2">{info.description}</p>
      )}
    </div>
  )
}
