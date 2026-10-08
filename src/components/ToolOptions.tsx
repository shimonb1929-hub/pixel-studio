import { Circle, Contrast, Copy, Crosshair, Lasso, PaintBucket, RotateCcw, Square, SquareDashed, SquareMinus, SquarePlus, SquareSlash, Trash2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
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
import type { SelectionMode, SelectionShape } from '../editor/selection.ts'
import type { ToolId } from '../editor/types.ts'
import { ALT_LABEL } from '../keys.ts'
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

interface Choice<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  description: string
}

function Segmented<T extends string>({ label, value, choices, onChange }: { label: string; value: T; choices: Choice<T>[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
      {choices.map((choice) => (
        <Tooltip key={choice.value} title={choice.label} description={choice.description}>
          <button
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            aria-label={choice.label}
            onClick={() => onChange(choice.value)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
              value === choice.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <choice.icon size={15} strokeWidth={1.9} />
            {choice.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

const SHAPES: Choice<SelectionShape>[] = [
  { value: 'rectangle', label: 'Rectangle', icon: Square, description: 'Drag to select a rectangle. Hold Shift while dragging for a perfect square.' },
  { value: 'ellipse', label: 'Oval', icon: Circle, description: 'Drag to select an oval. Hold Shift while dragging for a perfect circle.' },
  { value: 'freehand', label: 'Freehand', icon: Lasso, description: 'Draw around any shape by hand. Let go to close it.' },
]

const MODES: Choice<SelectionMode>[] = [
  { value: 'replace', label: 'New', icon: Square, description: 'Each drag starts a fresh selection.' },
  { value: 'add', label: 'Add', icon: SquarePlus, description: 'Each drag adds to what is already selected. Tip: holding Shift does this too.' },
  { value: 'subtract', label: 'Take away', icon: SquareMinus, description: `Each drag removes from what is already selected. Tip: holding ${ALT_LABEL} does this too.` },
]

export interface SelectionCommands {
  hasSelection: boolean
  selectAll: () => void
  deselect: () => void
  invert: () => void
  fill: () => void
  remove: () => void
  toNewLayer: () => void
  center: () => void
}

function BarButton({ icon: Icon, label, title, description, disabledReason, onClick }: { icon: LucideIcon; label: string; title?: string; description: string; disabledReason?: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      aria-label={title ?? label}
      className="h-8 shrink-0 px-2 text-[12px]"
      disabled={!!disabledReason}
      onClick={onClick}
      tip={{ title: title ?? label, description, note: disabledReason }}
    >
      <Icon size={15} />
      <span className="hidden xl:inline">{label}</span>
    </Button>
  )
}

const Divider = () => <div className="h-9 w-px shrink-0 bg-line" />

function SelectOptions({
  shape,
  mode,
  commands,
  onShapeChange,
  onModeChange,
}: {
  shape: SelectionShape
  mode: SelectionMode
  commands: SelectionCommands
  onShapeChange: (shape: SelectionShape) => void
  onModeChange: (mode: SelectionMode) => void
}) {
  const nothing = commands.hasSelection ? undefined : 'Select an area first.'
  return (
    <>
      <Segmented label="Shape" value={shape} choices={SHAPES} onChange={onShapeChange} />
      <Segmented label="When you drag" value={mode} choices={MODES} onChange={onModeChange} />
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton icon={SquareDashed} label="All" title="Select all" description="Select the whole design." onClick={commands.selectAll} />
        <BarButton icon={SquareSlash} label="None" title="Deselect" description="Clear the selection, so you can work on the whole design again." disabledReason={nothing} onClick={commands.deselect} />
        <BarButton icon={Contrast} label="Invert" title="Invert selection" description="Swap what is selected and what is not." onClick={commands.invert} />
      </div>
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton icon={PaintBucket} label="Fill" title="Fill with color" description="Fill the selected area of the selected layer with your current color." disabledReason={nothing} onClick={commands.fill} />
        <BarButton icon={Trash2} label="Delete" title="Delete selected area" description="Erase everything inside the selection on the selected layer." disabledReason={nothing} onClick={commands.remove} />
        <BarButton icon={Copy} label="To new layer" title="Copy to new layer" description="Copy the selected part of the layer onto a new layer of its own, so you can move or change it separately." disabledReason={nothing} onClick={commands.toNewLayer} />
      </div>
    </>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="min-w-64 text-[13px] leading-snug text-ink-2">{children}</p>
}

interface ToolOptionsProps {
  tool: ToolId
  selectionShape: SelectionShape
  selectionMode: SelectionMode
  onSelectionShapeChange: (shape: SelectionShape) => void
  onSelectionModeChange: (mode: SelectionMode) => void
  selection: SelectionCommands
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
      ) : props.tool === 'select' ? (
        <SelectOptions
          shape={props.selectionShape}
          mode={props.selectionMode}
          commands={props.selection}
          onShapeChange={props.onSelectionShapeChange}
          onModeChange={props.onSelectionModeChange}
        />
      ) : props.tool === 'move' ? (
        <>
          <Hint>
            Drag to move the selected layer{props.selection.hasSelection ? ', or just the selected part' : ''}. Arrow keys nudge it 1 pixel; with Shift, 10 pixels.
          </Hint>
          <BarButton
            icon={Crosshair}
            label="Center"
            title="Center on design"
            description={
              props.selection.hasSelection
                ? 'Move the selected part so it sits exactly in the middle of your design.'
                : 'Move the selected layer so what is on it sits exactly in the middle of your design.'
            }
            onClick={props.selection.center}
          />
        </>
      ) : (
        <Hint>{info.description}</Hint>
      )}
    </div>
  )
}
