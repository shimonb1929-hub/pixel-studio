import { Check, Circle, Contrast, Copy, Crosshair, Eye, FlipHorizontal2, FlipVertical2, Lasso, Link, PaintBucket, RectangleHorizontal, RectangleVertical, RotateCcw, RotateCw, Scan, Square, SquareDashed, SquareMinus, SquarePlus, SquareSlash, Trash2, Unlink, type LucideIcon } from 'lucide-react'
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

export interface TransformControls {
  // False when there's nothing on the layer to resize.
  active: boolean
  changed: boolean
  width: number
  height: number
  angle: number
  keepProportions: boolean
  onKeepProportions: (keep: boolean) => void
  flip: (axis: 'horizontal' | 'vertical') => void
  rotate90: (direction: 1 | -1) => void
  apply: () => void
  cancel: () => void
}

export type CropShape = 'free' | 'original' | 'square' | 'portrait' | 'wide'

export interface CropControls {
  width: number
  height: number
  shape: CropShape
  onShape: (shape: CropShape) => void
  changed: boolean
  apply: () => void
  reset: () => void
}

function Readout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Tooltip title={title} description={description}>
      <span className="shrink-0 cursor-default whitespace-nowrap rounded-lg bg-subtle px-2.5 py-1.5 text-[12px] font-medium tabular-nums text-ink">{children}</span>
    </Tooltip>
  )
}

function TransformOptions({ controls }: { controls: TransformControls }) {
  if (!controls.active) {
    return <Hint>There is nothing on this layer to resize yet. Paint something first, or pick another layer in the Layers panel.</Hint>
  }
  const notYet = controls.changed ? undefined : 'Drag a handle first.'
  return (
    <>
      <Readout title="Size" description="How big it will be, in pixels.">
        {Math.round(Math.abs(controls.width))} × {Math.round(Math.abs(controls.height))} px
      </Readout>
      <Readout title="Angle" description="How far it is turned. Hold Shift while turning to go in neat 15° steps.">
        {controls.angle}°
      </Readout>
      <Divider />
      <div className="flex shrink-0 items-center">
        {/* The icon names describe the mirror line: a vertical line flips left to right. */}
        <BarButton icon={FlipVertical2} label="Mirror" title="Flip left to right" description="Mirror it, so the left side becomes the right side." onClick={() => controls.flip('horizontal')} />
        <BarButton icon={FlipHorizontal2} label="Upside down" title="Flip upside down" description="Mirror it top to bottom, so the top becomes the bottom." onClick={() => controls.flip('vertical')} />
        <BarButton icon={RotateCcw} label="Left" title="Turn left" description="Turn it a quarter turn to the left." onClick={() => controls.rotate90(-1)} />
        <BarButton icon={RotateCw} label="Right" title="Turn right" description="Turn it a quarter turn to the right." onClick={() => controls.rotate90(1)} />
      </div>
      <Tooltip
        title="Keep shape"
        description="When on, dragging a corner keeps the same shape, so nothing gets squashed or stretched. Hold Shift while dragging to do the opposite."
      >
        <button
          type="button"
          aria-pressed={controls.keepProportions}
          aria-label="Keep shape"
          onClick={() => controls.onKeepProportions(!controls.keepProportions)}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
            controls.keepProportions ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
          }`}
        >
          {controls.keepProportions ? <Link size={15} /> : <Unlink size={15} />}
          Keep shape
        </button>
      </Tooltip>
      <Divider />
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" disabled={!controls.changed} onClick={controls.cancel} tip={{ title: 'Cancel', shortcut: 'Esc', description: 'Put it back the way it was.', note: notYet }}>
        Cancel
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!controls.changed} onClick={controls.apply} tip={{ title: 'Apply', shortcut: 'Enter', description: 'Keep the new size and angle.', note: notYet }}>
        <Check size={15} />
        Apply
      </Button>
    </>
  )
}

const CROP_SHAPES: Choice<CropShape>[] = [
  { value: 'free', label: 'Free', icon: Scan, description: 'Any shape you like.' },
  { value: 'original', label: 'Original', icon: RectangleHorizontal, description: 'The same shape your design has now.' },
  { value: 'square', label: 'Square', icon: Square, description: 'A perfect square, good for profile pictures and square posts.' },
  { value: 'portrait', label: '4:5', icon: RectangleVertical, description: 'A little taller than wide, good for social posts.' },
  { value: 'wide', label: '16:9', icon: RectangleHorizontal, description: 'Wide like a TV screen, good for slides and video thumbnails.' },
]

function CropOptions({ controls }: { controls: CropControls }) {
  const notYet = controls.changed ? undefined : 'Drag the frame first.'
  return (
    <>
      <Segmented label="Crop shape" value={controls.shape} choices={CROP_SHAPES} onChange={controls.onShape} />
      <Readout title="New size" description="How big your design will be after cropping, in pixels.">
        {controls.width} × {controls.height} px
      </Readout>
      <Divider />
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" disabled={!controls.changed} onClick={controls.reset} tip={{ title: 'Start over', shortcut: 'Esc', description: 'Put the frame back around the whole design.', note: notYet }}>
        Start over
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!controls.changed} onClick={controls.apply} tip={{ title: 'Crop', shortcut: 'Enter', description: 'Cut the design down to the frame. You can undo this.', note: notYet }}>
        <Check size={15} />
        Crop
      </Button>
    </>
  )
}

export interface AdjustControls {
  // What will change, like “Layer 1”, or why nothing can.
  target: string | null
  blocked: string | null
  changed: boolean
  comparing: boolean
  onCompare: (on: boolean) => void
  apply: () => void
  cancel: () => void
}

function AdjustOptions({ controls }: { controls: AdjustControls }) {
  if (controls.blocked) return <Hint>{controls.blocked}</Hint>
  const notYet = controls.changed ? undefined : 'Pick a look or move a slider first.'
  const stopComparing = () => controls.onCompare(false)
  return (
    <>
      <Readout
        title="What changes"
        description="Adjustments change the selected layer, or only the selected part of it. To change another layer, pick it in the Layers panel."
      >
        Changes {controls.target}
      </Readout>
      <Divider />
      <Tooltip title="Compare" description="Press and hold to see how it looked before. You can also press and hold on your design." note={notYet}>
        <button
          type="button"
          aria-label="Hold to compare"
          aria-pressed={controls.comparing}
          aria-disabled={!controls.changed || undefined}
          onPointerDown={(event) => {
            if (!controls.changed || event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            controls.onCompare(true)
          }}
          onPointerUp={stopComparing}
          onPointerCancel={stopComparing}
          onLostPointerCapture={stopComparing}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent aria-pressed:bg-accent-soft aria-pressed:text-accent"
        >
          <Eye size={15} />
          Hold to compare
        </button>
      </Tooltip>
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" disabled={!controls.changed} onClick={controls.cancel} tip={{ title: 'Cancel', shortcut: 'Esc', description: 'Put it back the way it was.', note: notYet }}>
        Cancel
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!controls.changed} onClick={controls.apply} tip={{ title: 'Apply', shortcut: 'Enter', description: 'Keep the new look. You can undo it.', note: notYet }}>
        <Check size={15} />
        Apply
      </Button>
    </>
  )
}

function describeTolerance(tolerance: number): string {
  if (tolerance < 0.02) return 'Only exactly the same color gets filled.'
  if (tolerance < 0.25) return 'Fills very similar colors. Good for flat areas and drawings.'
  if (tolerance < 0.6) return 'Fills somewhat similar colors too. Good for photos.'
  return 'Fills almost any color. Be careful, it may fill a lot.'
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
  transform: TransformControls
  crop: CropControls
  adjust: AdjustControls
  fillTolerance: number
  onFillToleranceChange: (tolerance: number) => void
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
      ) : props.tool === 'transform' ? (
        <TransformOptions controls={props.transform} />
      ) : props.tool === 'crop' ? (
        <CropOptions controls={props.crop} />
      ) : props.tool === 'adjust' ? (
        <AdjustOptions controls={props.adjust} />
      ) : props.tool === 'fill' ? (
        <>
          <Slider
            className="w-40 shrink-0"
            label="Similar colors"
            help="How different a color can be and still get filled. Low fills only one exact color; high fills more."
            value={props.fillTolerance}
            display={`${Math.round(props.fillTolerance * 100)}%`}
            note={describeTolerance(props.fillTolerance)}
            onChange={(position) => props.onFillToleranceChange(Math.round(position * 100) / 100)}
          />
          <Hint>Click inside an area to fill it with your color. It looks at everything you can see, and paints on the selected layer.</Hint>
        </>
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
