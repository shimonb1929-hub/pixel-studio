import { Spline, CornerDownLeft, Undo2, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, BringToFront, Check, ChevronDown, Circle, Contrast, Copy, Crosshair, Eye, FlipHorizontal2, FlipVertical2, Group, Lasso, LayoutGrid, Link, LockOpen, Minus, PaintBucket, Pentagon, Plus, RectangleHorizontal, RectangleVertical, RotateCcw, RotateCw, Scan, SendToBack, Square, SquareDashed, SquareMinus, SquarePlus, SquareSlash, Star, Trash2, WrapText, CircleOff, BetweenHorizontalStart, Shapes, Ungroup, Unlink, WandSparkles, Eraser, Sparkles, SquaresExclude, SquaresIntersect, SquaresSubtract, SquaresUnite, Table2, type LucideIcon, Droplet, Blend, Footprints, MapPin } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  type BrushPreset,
  type BrushSettings,
  type CopyBrush,
} from '../editor/brushes.ts'
import type { BoxChange } from '../editor/arrange.ts'
import type { LineUpEdge } from '../editor/organize.ts'
import type { CombineMode } from '../editor/combine.ts'
import { signedDecimalInput, formatInUnit, pixelsToUnit, unitToPixels, useUnit, type Unit } from '../editor/units.ts'
import { MAX_LAYER_SIDE } from '../editor/document.ts'
import { UnitPicker } from './UnitPicker.tsx'
import { unitShort } from './unitWords.ts'
import { MAX_EDGE_CHANGE, type SelectionMode, type SelectionShape } from '../editor/selection.ts'
import type { ShapeType, TextWrap, TextWrapMode, ToolId } from '../editor/types.ts'
import { ALT_LABEL } from '../keys.ts'
import { TEXT_KINDS, type TextKind } from '../text/presets.ts'
import { toolInfo } from '../tools.ts'
import { StrokePreview } from './StrokePreview.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button, Slider } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

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
      {erasing ? (
        <div role="radiogroup" aria-label={t("Ready-made erasers")} className="flex shrink-0 gap-1">
          {presets.map((p) => (
            <PresetTile key={p.id} preset={p} chosen={p.id === presetId} color={color} mode={mode} onChoose={() => onChange(p.settings, p.id)} />
          ))}
        </div>
      ) : (
        <BrushPicker presetId={presetId} color={color} onChoose={(p) => onChange(p.settings, p.id)} />
      )}

      <div className="h-9 w-px shrink-0 bg-line" />

      <Tooltip
        title={erasing ? t('Your eraser') : t('Your brush')}
        description={t("A sample of how it works right now. It changes as you move the sliders.")}
      >
        <div className="hidden h-[42px] w-[104px] shrink-0 items-center justify-center rounded-lg border border-line bg-white xl:flex">
          <StrokePreview settings={settings} color={color} mode={mode} width={96} height={36} maxSize={26} />
        </div>
      </Tooltip>

      <Slider
        className="w-28 shrink-0 xl:w-32"
        label={t("Size")}
        help={t("How thick the line is.")}
        value={sizeToSlider(settings.size)}
        display={`${settings.size} px`}
        note={describeSize(settings.size)}
        onChange={(position) => set({ size: sliderToSize(position) })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label={t("Softness")}
        help={t("How blurry the edge of the line is.")}
        pro="Hardness (the other way round)"
        value={settings.softness}
        display={`${Math.round(settings.softness * 100)}%`}
        note={describeSoftness(settings.softness)}
        onChange={(position) => set({ softness: Math.round(position * 100) / 100 })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label={t('Strength')}
        pro="Opacity"
        help={erasing ? t('How much paint the eraser removes.') : t('How solid the paint is. Lower lets what is underneath show through.')}
        value={settings.opacity}
        display={`${Math.round(settings.opacity * 100)}%`}
        note={describeOpacity(settings.opacity, erasing)}
        onChange={(position) => set({ opacity: Math.max(0.01, Math.round(position * 100) / 100) })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label={t("Steady hand")}
        help={t("Smooths out shaky lines, so your drawing looks clean and confident.")}
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
          tip={{ title: t('Reset {brush}', { brush: preset.name }), description: t('Put the sliders back to how {brush} started.', { brush: preset.name }) }}
        >
          <RotateCcw size={14} />
          {t('Reset')}
        </Button>
      )}
    </>
  )
}

function PresetTile({ preset, chosen, color, mode, big, onChoose }: { preset: BrushPreset; chosen: boolean; color: string; mode: 'paint' | 'erase'; big?: boolean; onChoose: () => void }) {
  return (
    <Tooltip title={preset.name} description={preset.description}>
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={preset.name}
        onClick={onChoose}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${big ? 'h-[66px] w-[104px]' : 'h-[50px] w-[68px] xl:w-[74px]'} ${
          chosen ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
        }`}
      >
        <StrokePreview settings={preset.settings} color={color} mode={mode} width={big ? 92 : 58} height={big ? 38 : 24} maxSize={big ? 22 : 14} />
        <span className={`font-medium ${big ? 'text-[12px]' : 'text-[11px]'}`}>{preset.name}</span>
      </button>
    </Tooltip>
  )
}

// All the ready-made brushes, in a panel that opens from one button, so the bar stays short as
// more brushes are added.
function BrushPicker({ presetId, color, onChoose }: { presetId: string | null; color: string; onChoose: (preset: BrushPreset) => void }) {
  const { open, setOpen, position, setPosition, buttonRef, menuRef } = useFloatingMenu('[role="radio"][aria-checked="true"]', '[role="radio"]')
  const current = BRUSH_PRESETS.find((p) => p.id === presetId)
  const groups = [
    { title: t('For drawing'), presets: BRUSH_PRESETS.filter((p) => p.kind !== 'paint') },
    { title: t('Paint and effects'), presets: BRUSH_PRESETS.filter((p) => p.kind === 'paint') },
  ]
  return (
    <>
      <Tooltip title={t("Brushes")} description={t("Pick a ready-made brush: pencil, pen, marker, oil paint, splatter, drips and more.")}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('Brushes: {brush}', { brush: current?.name ?? t('your own') })}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-[50px] shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors ${open ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
        >
          <span className="flex flex-col items-center gap-0.5">
            {current ? <StrokePreview settings={current.settings} color={color} mode="paint" width={58} height={24} maxSize={14} /> : <span className="h-6" />}
            <span className="text-[11px] font-medium">{current?.name ?? t('Your brush')}</span>
          </span>
          <ChevronDown size={14} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label={t("Brushes")}
            onKeyDown={(event) => {
              // Arrow keys move between the brushes.
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])
              const index = items.indexOf(document.activeElement as HTMLElement)
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              event.stopPropagation()
              items[(index + step + items.length) % items.length]?.focus()
            }}
            className="fixed z-40 rounded-2xl border border-line bg-surface p-3 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <div role="radiogroup" aria-label={t("Ready-made brushes")}>
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="px-1 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group.title}</p>
                  <div className="grid grid-cols-5 gap-1.5 pb-1.5">
                    {group.presets.map((p) => (
                      <PresetTile
                        key={p.id}
                        preset={p}
                        chosen={p.id === presetId}
                        color={color}
                        mode="paint"
                        big
                        onChoose={() => {
                          setOpen(false)
                          setPosition(null)
                          onChoose(p)
                          buttonRef.current?.focus()
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
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

// `compact` names only the chosen one on smaller screens; the others show their icon, and their
// name on hover.
function Segmented<T extends string>({ label, value, choices, compact, onChange }: { label: string; value: T; choices: Choice<T>[]; compact?: boolean; onChange: (value: T) => void }) {
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
            <span className={compact && value !== choice.value ? 'hidden 2xl:inline' : undefined}>{choice.label}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

const SHAPES: Choice<SelectionShape>[] = live([
  { value: 'rectangle', label: msg('Rectangle'), icon: Square, description: msg('Drag to select a rectangle. Hold Shift while dragging for a perfect square.') },
  { value: 'ellipse', label: msg('Oval'), icon: Circle, description: msg('Drag to select an oval. Hold Shift while dragging for a perfect circle.') },
  { value: 'freehand', label: msg('Freehand'), icon: Lasso, description: msg('Draw around any shape by hand. Let go to close it.') },
  {
    value: 'magic',
    label: msg('Magic'),
    icon: WandSparkles,
    description: msg('Click a thing (a person, an animal, a house, a tree) and it is selected for you, right to its edges. Or drag a box around it. The first time, it takes a moment to get ready.'),
  },
  {
    value: 'color',
    label: msg('Same color'),
    icon: Droplet,
    description: msg('Click a color, and everything of a similar color is selected: a blue sky, a white wall, a green background. Professionals call this the Magic wand.'),
  },
])

const MODES: Choice<SelectionMode>[] = live([
  { value: 'replace', label: msg('New'), icon: Square, description: msg('Each drag starts a fresh selection.') },
  { value: 'add', label: msg('Add'), icon: SquarePlus, description: msg('Each drag adds to what is already selected. Tip: holding Shift does this too.') },
  {
    value: 'subtract',
    label: msg('Take away'),
    icon: SquareMinus,
    get description() {
      return t('Each drag removes from what is already selected. Tip: holding {alt} does this too.', { alt: ALT_LABEL })
    },
  },
])

export interface ColorSelectControls {
  tolerance: number
  onToleranceChange: (tolerance: number) => void
  // Only the parts touching the clicked spot, or that color everywhere.
  touching: boolean
  onTouchingChange: (touching: boolean) => void
}

export interface EdgeControls {
  // The edge being tried out, or null when the edge isn't being changed.
  editing: { soften: number; grow: number } | null
  start: () => void
  change: (change: { soften?: number; grow?: number }) => void
  apply: () => void
  cancel: () => void
}

export interface CopyBarControls {
  brush: CopyBrush
  onBrushChange: (brush: CopyBrush) => void
  aligned: boolean
  onAlignedChange: (aligned: boolean) => void
  // A spot to copy from has been clicked.
  picked: boolean
  pickAgain: () => void
}

// A button that stays pressed while its setting is on.
function OnOff({ on, icon: Icon, label, description, onChange }: { on: boolean; icon: LucideIcon; label: string; description: string; onChange: (on: boolean) => void }) {
  return (
    <Tooltip title={label} description={description}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
          on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
        }`}
      >
        <Icon size={15} />
        <span className="hidden xl:inline">{label}</span>
      </button>
    </Tooltip>
  )
}

// The edge sliders move a pixel at a time with the arrow keys.
const SOFTEN_MAX = 100
const GROW_MAX = Math.min(100, MAX_EDGE_CHANGE)

function describeEdge(soften: number, grow: number): string {
  if (soften === 0 && grow === 0) return t('Move a slider to see the new edge. The parts left out are dimmed.')
  return t('The dimmed parts are left out. Press Apply to keep the new edge.')
}

// Changing the edge of the selection: softer (feather), bigger (expand) or smaller (contract),
// seen on the design before it's kept.
function EdgeOptions({ controls, editing }: { controls: EdgeControls; editing: { soften: number; grow: number } }) {
  const { soften, grow } = editing
  const notYet = soften === 0 && grow === 0 ? t('Move a slider first.') : undefined
  return (
    <>
      <Slider
        className="w-44 shrink-0"
        label={t('Soften edge (Feather)')}
        help={t('Makes the edge of the selection fade out gently, so what you paint, delete, move or change blends in without a hard line.')}
        value={soften / SOFTEN_MAX}
        step={1 / SOFTEN_MAX}
        display={`${soften} px`}
        onChange={(position) => controls.change({ soften: Math.round(position * SOFTEN_MAX) })}
      />
      <Slider
        className="w-48 shrink-0"
        label={t('Grow or shrink (Expand, Contract)')}
        help={t('Moves the edge of the selection outward to take in a little more, or inward to leave a little out. Good for catching a thin edge that was missed.')}
        value={(grow / GROW_MAX + 1) / 2}
        origin={0.5}
        step={1 / (GROW_MAX * 2)}
        display={`${grow > 0 ? '+' : ''}${grow} px`}
        onChange={(position) => controls.change({ grow: Math.round((position * 2 - 1) * GROW_MAX) })}
      />
      <Hint>{describeEdge(soften, grow)}</Hint>
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" onClick={controls.cancel} tip={{ title: t('Cancel'), shortcut: 'Esc', description: t('Keep the edge as it was.') }}>
        {t('Cancel')}
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!!notYet} onClick={controls.apply} tip={{ title: t('Apply'), shortcut: 'Enter', description: t('Keep the new edge. You can undo it.'), note: notYet }}>
        <Check size={15} />
        {t('Apply')}
      </Button>
    </>
  )
}

function describeColorReach(tolerance: number): string {
  if (tolerance < 0.02) return t('Only exactly the same color gets selected.')
  if (tolerance < 0.25) return t('Selects very similar colors. Good for flat areas and drawings.')
  if (tolerance < 0.6) return t('Selects somewhat similar colors too. Good for photos.')
  return t('Selects almost any color. Be careful, it may select a lot.')
}

function ColorSelectOptions({ controls }: { controls: ColorSelectControls }) {
  return (
    <>
      <Slider
        className="w-36 shrink-0"
        label={t('Similar colors')}
        help={t('How different a color can be and still get selected. Low picks only one exact color; high picks more. Professionals call this Tolerance.')}
        value={controls.tolerance}
        display={`${Math.round(controls.tolerance * 100)}%`}
        note={describeColorReach(controls.tolerance)}
        onChange={(position) => controls.onToleranceChange(Math.round(position * 100) / 100)}
      />
      <OnOff
        on={controls.touching}
        icon={Footprints}
        label={t('Only touching')}
        description={t('When on, only the part connected to where you click is selected. When off, that color is selected everywhere on the design. Professionals call this Contiguous.')}
        onChange={controls.onTouchingChange}
      />
    </>
  )
}

// Copy paint: the spot to copy from, the brush, and whether the copy follows along.
function CopyOptions({ controls }: { controls: CopyBarControls }) {
  const { brush } = controls
  return (
    <>
      <Slider
        className="w-32 shrink-0"
        label={t('Size')}
        help={t('How wide the brush is.')}
        note={describeSize(brush.size)}
        value={sizeToSlider(brush.size)}
        display={`${brush.size} px`}
        onChange={(position) => controls.onBrushChange({ ...brush, size: sliderToSize(position) })}
      />
      <Slider
        className="w-28 shrink-0"
        label={t('Softness')}
        help={t('How gently the copy fades into what is around it. Soft edges hide the join.')}
        note={describeSoftness(brush.softness)}
        value={brush.softness}
        display={`${Math.round(brush.softness * 100)}%`}
        onChange={(position) => controls.onBrushChange({ ...brush, softness: Math.round(position * 100) / 100 })}
      />
      <Slider
        className="w-28 shrink-0"
        label={t('Strength')}
        help={t('How fully the copy covers what is there. Lower lets some of the old picture show through, for a gentle blend.')}
        value={brush.opacity}
        display={`${Math.round(brush.opacity * 100)}%`}
        onChange={(position) => controls.onBrushChange({ ...brush, opacity: Math.max(0.01, Math.round(position * 100) / 100) })}
      />
      <Divider />
      <OnOff
        on={controls.aligned}
        icon={Link}
        label={t('Follow along (Aligned)')}
        description={t('When on, the copy keeps following your brush from one stroke to the next, as if the two were tied together. When off, every new stroke starts copying from the spot you picked.')}
        onChange={controls.onAlignedChange}
      />
      <BarButton
        icon={MapPin}
        label={t('New spot')}
        title={t('Copy from a new spot')}
        description={t('Pick another part of the photo to copy from: click it next. Tip: holding {alt} and clicking does this too.', { alt: ALT_LABEL })}
        disabledReason={controls.picked ? undefined : t('Click the part you want to copy first.')}
        onClick={controls.pickAgain}
      />
      <Hint>{controls.picked ? t('Paint where the copy should go. The cross shows what is being copied.') : t('Click the part of your photo you want to copy.')}</Hint>
    </>
  )
}

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

// On or off: when the selected part of a picture is moved, AI fills the gap it leaves behind.
function FillGapToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Tooltip
      title={t('Fill the gap')}
      description={t('When on, moving the selected part of a photo fills the place it came from with what is around it, as if it was never there. When off, that place is left see-through.')}
    >
      <button
        type="button"
        aria-pressed={on}
        aria-label={t('Fill the gap')}
        onClick={() => onChange(!on)}
        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
          on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
        }`}
      >
        <Sparkles size={15} />
        <span className="hidden xl:inline">{t('Fill the gap')}</span>
      </button>
    </Tooltip>
  )
}

// `roomy` buttons show their word only on very wide screens, where the bar has room for it.
function BarButton({
  icon: Icon,
  label,
  title,
  description,
  disabledReason,
  roomy,
  onClick,
}: {
  icon: LucideIcon
  label: string
  title?: string
  description: string
  disabledReason?: string
  roomy?: boolean
  onClick: () => void
}) {
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
      <span className={roomy ? 'hidden 2xl:inline' : 'hidden xl:inline'}>{label}</span>
    </Button>
  )
}

const Divider = () => <div className="h-9 w-px shrink-0 bg-line" />

function SelectOptions({
  shape,
  mode,
  commands,
  colorSelect,
  edge,
  onShapeChange,
  onModeChange,
}: {
  shape: SelectionShape
  mode: SelectionMode
  commands: SelectionCommands
  colorSelect: ColorSelectControls
  edge: EdgeControls
  onShapeChange: (shape: SelectionShape) => void
  onModeChange: (mode: SelectionMode) => void
}) {
  const nothing = commands.hasSelection ? undefined : t('Select an area first.')
  if (edge.editing) return <EdgeOptions controls={edge} editing={edge.editing} />
  return (
    <>
      <Segmented label={t("Shape")} value={shape} choices={SHAPES} compact onChange={onShapeChange} />
      {shape === 'color' && <ColorSelectOptions controls={colorSelect} />}
      <Segmented label={t("When you drag")} value={mode} choices={MODES} onChange={onModeChange} />
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton icon={SquareDashed} label={t("All")} title={t("Select all")} description={t("Select the whole design.")} onClick={commands.selectAll} />
        <BarButton icon={SquareSlash} roomy label={t("Let go")} description={t('Stop selecting (Deselect), so the whole design can be changed again. Nothing in your design changes.')} disabledReason={nothing} onClick={commands.deselect} />
        <BarButton icon={Contrast} label={t("Swap")} title={t("Select everything else")} description={t("Swap what is selected and what is not.")} onClick={commands.invert} />
        <BarButton
          icon={Blend}
          label={t('Edge')}
          title={t('Soften, grow or shrink the edge')}
          description={t('Make the edge of the selection soft so changes blend in (Feather), or move it out or in a little (Expand, Contract). You see the new edge before you keep it.')}
          disabledReason={nothing}
          onClick={edge.start}
        />
      </div>
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton icon={PaintBucket} label={t("Fill")} title={t("Fill with color")} description={t("Fill the selected area of the selected layer with your current color.")} disabledReason={nothing} onClick={commands.fill} />
        <BarButton icon={Trash2} label={t("Delete")} title={t("Delete selected area")} description={t("Erase everything inside the selection on the selected layer.")} disabledReason={nothing} onClick={commands.remove} />
        <BarButton icon={Copy} label={t("To new layer")} title={t("Copy to new layer")} description={t("Copy the selected part of the layer onto a new layer of its own, so you can move or change it separately.")} disabledReason={nothing} onClick={commands.toNewLayer} />
      </div>
    </>
  )
}

export interface ArrangeBarControls {
  // What the handles are on: a whole object, the selected part, several things picked together,
  // or one thing kept together. Null when nothing can be arranged.
  // Its size and top-left corner before turning, in pixels. `place` sets any of them, or the angle.
  target: {
    kind: 'object' | 'part' | 'many' | 'group'
    name: string
    width: number
    height: number
    x: number
    y: number
    angle: number
    place: (change: BoxChange) => void
  } | null
  // The design's pixels per inch, for showing sizes in inches, centimeters or millimeters.
  ppi: number
  // Why nothing can be arranged, in plain words.
  blocked: string | null
  // The selected layer is locked; the bar offers to unlock it.
  locked: boolean
  // Something picked is kept together, so it can be taken apart.
  kept: boolean
  keepProportions: boolean
  onKeepProportions: (keep: boolean) => void
  flip: (axis: 'horizontal' | 'vertical') => void
  rotate90: (direction: 1 | -1) => void
  center: () => void
  // One step toward the front or the back.
  forward: () => void
  backward: () => void
  remove: () => void
  unlock: () => void
  keepTogether: () => void
  takeApart: () => void
  tidyUp: () => void
  lineUp: (edge: LineUpEdge) => void
  spreadOut: (axis: 'x' | 'y') => void
  // Set when one photo or drawing is picked: AI makes everything around the main thing see-through.
  removeBackground?: () => void
  // Set when one picture or shape is picked: whether text flows around it, and how.
  textWrap?: TextWrapControls
  // Set when several things are picked: makes one shape out of them, or says why it can't.
  combine?: (mode: CombineMode) => void
  combineBlocked?: string | null
  // Set when one text and one shape are picked: runs the words along the shape's edge.
  alongShape?: () => void
  // With a selected part: whether moving it fills the gap it leaves.
  fillGap: boolean
  onFillGap: (on: boolean) => void
}

export interface TextWrapControls {
  value: TextWrap | null
  // Off, or a way for text to flow around it.
  onMode: (mode: TextWrapMode | null) => void
  // The space kept free around it, in design pixels; `done` is false while a slider is being dragged.
  onGap: (gap: number) => void
  // The most space the slider gives.
  maxGap: number
  ppi: number
}

export type CropShape = 'free' | 'original' | 'square' | 'portrait' | 'wide'

export interface CropControls {
  width: number
  height: number
  ppi: number
  shape: CropShape
  onShape: (shape: CropShape) => void
  changed: boolean
  apply: () => void
  reset: () => void
}

function Readout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Tooltip title={title} description={description}>
      <span dir="auto" className="shrink-0 cursor-default whitespace-nowrap rounded-lg bg-subtle px-2.5 py-1.5 text-[12px] font-medium tabular-nums text-ink">{children}</span>
    </Tooltip>
  )
}

// How much the arrow keys change a number box: one pixel, a tenth of an inch or centimeter, one
// millimeter. Shift makes the step ten times bigger.
const UNIT_STEP: Record<Unit, number> = { px: 1, in: 0.1, cm: 0.1, mm: 1 }

interface NumberBoxProps {
  label: string
  description: string
  // The number shown, already in the chosen unit.
  value: string
  // Written after the number, like "wide" or "°".
  suffix: string
  step: number
  // Typed numbers outside these are left alone, as if nothing was typed; the arrow keys stop at them.
  min?: number
  max?: number
  onCommit: (value: number) => void
}

// A number you can type over. It's kept when you press Enter or click away, and Esc puts back what
// was there. The arrow keys change it a step at a time.
function NumberBox({ label, description, value, suffix, step, min, max, onCommit }: NumberBoxProps) {
  const [draft, setDraft] = useState<string | null>(null)
  // Set by Esc, so leaving the box then doesn't keep what was typed.
  const cancelled = useRef(false)
  const commit = (text: string) => {
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const number = Number(text)
    if (text === '' || text === '.' || !Number.isFinite(number) || text === value) return
    if ((min !== undefined && number < min) || (max !== undefined && number > max)) return
    onCommit(number)
  }
  const within = (number: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number))
  return (
    <Tooltip title={label} description={description}>
      <label className="relative flex items-center">
        <input
          aria-label={label}
          dir="ltr"
          inputMode="decimal"
          value={draft ?? value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(signedDecimalInput(e.target.value))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              cancelled.current = true
              e.currentTarget.blur()
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const by = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
              const next = Math.round((Number(draft ?? value) + by) * 1000) / 1000
              setDraft(null)
              onCommit(within(next))
            }
          }}
          className="h-8 w-full rounded-lg border border-transparent bg-subtle pe-10 ps-2 text-[12px] font-medium tabular-nums text-ink outline-none transition-colors hover:border-line focus:border-accent focus:bg-surface"
        />
        <span className="pointer-events-none absolute end-2 text-[11px] text-ink-3">{suffix}</span>
      </label>
    </Tooltip>
  )
}

// Size, place and angle of what's picked. The bar shows the size; a click opens boxes to type an
// exact size, place and angle, in the unit chosen there.
function SizeMenu({ target, ppi, showAngle }: { target: NonNullable<ArrangeBarControls['target']>; ppi: number; showAngle: boolean }) {
  const { open, setOpen, position, setPosition, buttonRef, menuRef } = useFloatingMenu('input')
  const [unit] = useUnit()
  const shown = (pixels: number) => formatInUnit(pixels, unit, ppi)
  const toPixels = (value: number) => unitToPixels(value, unit, ppi)
  const step = UNIT_STEP[unit]
  const short = unitShort(unit)
  const smallest = pixelsToUnit(1, unit, ppi) || undefined
  const biggest = pixelsToUnit(MAX_LAYER_SIDE, unit, ppi)
  const heading = 'px-0.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3'
  return (
    <>
      <Tooltip
        title={t('Size')}
        description={t('How big it is. Click to type an exact size, place and angle, in pixels, inches, centimeters or millimeters.')}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('Size and place')}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[12px] font-medium tabular-nums transition-colors ${open ? 'bg-line text-ink' : 'bg-subtle text-ink hover:bg-line'}`}
        >
          <span dir="ltr">
            {shown(target.width)} × {shown(target.height)} {short}
          </span>
          <ChevronDown size={13} className="text-ink-3" />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label={t('Size and place')}
            className="fixed z-40 w-64 space-y-3 rounded-xl border border-line bg-surface p-3 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <div>
              <p className={heading}>{t('Size')}</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberBox
                  label={t('Width')}
                  description={t('How wide it is, in {unit}. Type a number and press Enter. With Keep shape on, the height changes to match.', { unit: short })}
                  value={shown(target.width)}
                  suffix={t('wide')}
                  step={step}
                  min={smallest}
                  max={biggest}
                  onCommit={(value) => target.place({ width: Math.max(1, toPixels(value)) })}
                />
                <NumberBox
                  label={t('Height')}
                  description={t('How tall it is, in {unit}. Type a number and press Enter. With Keep shape on, the width changes to match.', { unit: short })}
                  value={shown(target.height)}
                  suffix={t('tall')}
                  step={step}
                  min={smallest}
                  max={biggest}
                  onCommit={(value) => target.place({ height: Math.max(1, toPixels(value)) })}
                />
              </div>
            </div>
            <div>
              <p className={heading}>{t('Place')}</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberBox
                  label={t('From the left')}
                  description={t('How far its left edge is from the left edge of your design, in {unit}.', { unit: short })}
                  value={shown(target.x)}
                  suffix={t('left')}
                  step={step}
                  onCommit={(value) => target.place({ x: toPixels(value) })}
                />
                <NumberBox
                  label={t('From the top')}
                  description={t('How far its top edge is from the top edge of your design, in {unit}.', { unit: short })}
                  value={shown(target.y)}
                  suffix={t('top')}
                  step={step}
                  onCommit={(value) => target.place({ y: toPixels(value) })}
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              {showAngle && (
                <div className="flex-1">
                  <p className={heading}>{t('Angle')}</p>
                  <NumberBox
                    label={t('Angle')}
                    description={t('How far it is turned, in degrees. Type a number and press Enter, or hold Shift while turning to go in neat 15° steps.')}
                    value={String(target.angle)}
                    suffix="°"
                    step={1}
                    onCommit={(value) => target.place({ angle: value })}
                  />
                </div>
              )}
              <div className="flex-1">
                <p className={heading}>{t('Measure in')}</p>
                <UnitPicker className="h-8 w-full rounded-lg border border-line px-2 text-[12px]" />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

const LINE_UPS: { edge: LineUpEdge; label: string; icon: LucideIcon }[] = live([
  { edge: 'left', label: msg('Left edges'), icon: AlignStartVertical },
  { edge: 'center', label: msg('Centers'), icon: AlignCenterVertical },
  { edge: 'right', label: msg('Right edges'), icon: AlignEndVertical },
  { edge: 'top', label: msg('Tops'), icon: AlignStartHorizontal },
  { edge: 'middle', label: msg('Middles'), icon: AlignCenterHorizontal },
  { edge: 'bottom', label: msg('Bottoms'), icon: AlignEndHorizontal },
])

// Lining up, as a small menu of pictures: with each other for several things, with the page for one.
// A menu that floats under its button. The bar scrolls sideways, so the menu sits above the page
// instead of inside the bar. A click elsewhere, Esc or a window resize closes it.
// `focusFirst` lists where the keyboard starts, best first.
function useFloatingMenu(...focusFirst: string[]) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = buttonRef.current?.getBoundingClientRect()
    const menu = menuRef.current?.getBoundingClientRect()
    if (!anchor || !menu) return
    setPosition({ left: Math.min(Math.max(8, anchor.left), window.innerWidth - menu.width - 8), top: anchor.bottom + 6 })
  }, [open])

  // Once it's in place (and can take focus), the first choice is ready for the keyboard.
  useEffect(() => {
    if (!open || !position) return
    for (const selector of focusFirst) {
      const choice = menuRef.current?.querySelector<HTMLElement>(selector)
      if (choice) return choice.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      // A number being typed is kept, as it is when clicking away anywhere else.
      if (menuRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      setOpen(false)
    }
    // Esc closes just the menu, before anything else hears it (it would let go of what's picked).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // In a number box, Esc first puts back what was there; the next Esc closes the menu.
      if (event.target instanceof HTMLInputElement && menuRef.current?.contains(event.target) && document.activeElement === event.target) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return { open, setOpen, position, setPosition, buttonRef, menuRef }
}

const COMBINES: { mode: CombineMode; label: string; description: string; icon: LucideIcon }[] = live([
  { mode: 'join', label: msg('Join'), description: msg('Make them one shape, as if they were melted together.'), icon: SquaresUnite },
  { mode: 'cut', label: msg('Cut out'), description: msg('The shapes on top cut their shape out of the bottom one, like a cookie cutter.'), icon: SquaresSubtract },
  { mode: 'overlap', label: msg('Overlap'), description: msg('Keep only the part where they all overlap.'), icon: SquaresIntersect },
  { mode: 'apart', label: msg('Apart'), description: msg('Keep everything except where they overlap, which becomes a hole.'), icon: SquaresExclude },
])

// Making one shape out of several: a small menu of pictures, each saying what it does.
function CombineMenu({ blocked, onCombine }: { blocked: string | null; onCombine: (mode: CombineMode) => void }) {
  const { open, setOpen, position, setPosition, buttonRef, menuRef } = useFloatingMenu('[role="menuitem"]:not([disabled])')
  const item = 'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-ink-2 outline-none hover:bg-subtle hover:text-ink focus-visible:bg-subtle focus-visible:text-ink disabled:pointer-events-none disabled:opacity-40'
  return (
    <>
      <Tooltip title={t('Make one shape')} description={t('Join the picked shapes into one, cut one out of another, or keep just where they overlap. The new shape looks like the bottom one, and stays sharp at any size.')}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('Make one shape')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${open ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
        >
          <SquaresUnite size={15} />
          <span className="hidden xl:inline">{t('Make one shape')}</span>
          <ChevronDown size={13} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t('Make one shape')}
            onKeyDown={(event) => {
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
              const index = items.indexOf(document.activeElement as HTMLElement)
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
              if (step === 0 || items.length === 0) return
              event.preventDefault()
              event.stopPropagation()
              items[(index + step + items.length) % items.length]?.focus()
            }}
            className="fixed z-40 w-72 rounded-xl border border-line bg-surface p-2 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            {blocked && <p role="note" className="px-1 pb-2 text-[12px] leading-snug text-ink-2">{blocked}</p>}
            <div className="grid grid-cols-4 gap-1">
              {COMBINES.map(({ mode, label, description, icon: Icon }) => (
                <Tooltip key={mode} title={label} description={description} className="flex">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!!blocked}
                    onClick={() => {
                      setOpen(false)
                      setPosition(null)
                      onCombine(mode)
                    }}
                    className={`${item} flex-1`}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

const WRAPS: { mode: TextWrapMode | null; label: string; description: string; icon: LucideIcon }[] = live([
  { mode: null, label: msg('Off'), description: msg('Text runs over or under it, as if it were not there.'), icon: CircleOff },
  { mode: 'shape', label: msg('Its shape'), description: msg('Text hugs its outline: round text edges beside a circle, and close around what is left of a photo with its background removed.'), icon: Shapes },
  { mode: 'box', label: msg('Its box'), description: msg('Text keeps out of the rectangle it sits in, in straight lines.'), icon: Square },
  { mode: 'jump', label: msg('Above and below'), description: msg('Text stops above it and goes on below it, with nothing beside it.'), icon: BetweenHorizontalStart },
])

// Text flowing around a picture or shape (text wrap): a small menu of ways, and the space kept free.
function TextWrapMenu({ controls }: { controls: TextWrapControls }) {
  const { open, setOpen, position, setPosition, buttonRef, menuRef } = useFloatingMenu('[role="menuitemradio"][aria-checked="true"]')
  const [unit] = useUnit()
  const on = !!controls.value
  const item = 'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] font-medium leading-tight outline-none focus-visible:bg-subtle'
  const gap = controls.value?.gap ?? 0
  return (
    <>
      <Tooltip
        title={t('Text around it (text wrap)')}
        description={t('Make text in a box flow around this, instead of running over or under it. It works on text in a box: drag a box with the Text tool.')}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('Text around it')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${open || on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
        >
          <WrapText size={15} />
          <span className="hidden 2xl:inline">{t('Text around it')}</span>
          <ChevronDown size={13} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t('Text around it')}
            onKeyDown={(event) => {
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])
              const index = items.indexOf(document.activeElement as HTMLElement)
              if (index < 0) return
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              event.stopPropagation()
              items[(index + step + items.length) % items.length]?.focus()
            }}
            className="fixed z-40 w-80 rounded-xl border border-line bg-surface p-2 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <p className="px-1 pb-2 text-[12px] leading-snug text-ink-2">{t('How text in a box flows around it:')}</p>
            <div className="grid grid-cols-4 gap-1">
              {WRAPS.map(({ mode, label, description, icon: Icon }) => {
                const chosen = (controls.value?.mode ?? null) === mode
                return (
                  <Tooltip key={mode ?? 'off'} title={label} description={description} className="flex">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={chosen}
                      onClick={() => controls.onMode(mode)}
                      className={`${item} flex-1 ${chosen ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  </Tooltip>
                )
              })}
            </div>
            {on && (
              <Slider
                className="px-1 pb-1 pt-3"
                label={t('Space around')}
                help={t('How much empty space is kept between it and the text.')}
                value={gap / controls.maxGap}
                display={`${formatInUnit(gap, unit, controls.ppi)} ${unitShort(unit)}`}
                onChange={(position) => controls.onGap(Math.round(position * controls.maxGap))}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function LineUpMenu({ several, onLineUp, onSpread }: { several: boolean; onLineUp: (edge: LineUpEdge) => void; onSpread: (axis: 'x' | 'y') => void }) {
  const { open, setOpen, position, setPosition, buttonRef, menuRef } = useFloatingMenu('[role="menuitem"]')

  function choose(run: () => void) {
    setOpen(false)
    setPosition(null)
    run()
  }

  const item = 'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-ink-2 outline-none hover:bg-subtle hover:text-ink focus-visible:bg-subtle focus-visible:text-ink'
  return (
    <>
      <Tooltip
        title={t("Line up")}
        description={several ? t('Line the picked things up with each other by an edge or the middle, or space them evenly.') : t('Move it to an edge or the middle of the page.')}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={t("Line up")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${open ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
        >
          <AlignStartVertical size={15} />
          <span className="hidden xl:inline">{t('Line up')}</span>
          <ChevronDown size={13} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t("Line up")}
            onKeyDown={(event) => {
              // Arrow keys move between the choices.
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
              const index = items.indexOf(document.activeElement as HTMLElement)
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              event.stopPropagation()
              items[(index + step + items.length) % items.length]?.focus()
            }}
            className="fixed z-40 w-60 rounded-xl border border-line bg-surface p-2 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{several ? t('Line up their') : t('Move to the page’s')}</p>
            <div className="grid grid-cols-3 gap-1">
              {LINE_UPS.map(({ edge, label, icon: Icon }) => {
                const words = several ? label : PAGE_PLACES[edge]
                return (
                  <button key={edge} type="button" role="menuitem" aria-label={several ? `Line up ${label.toLowerCase()}` : `Move to ${words.toLowerCase()}`} onClick={() => choose(() => onLineUp(edge))} className={item}>
                    <Icon size={18} />
                    {words}
                  </button>
                )
              })}
            </div>
            {several && (
              <>
                <p className="px-1 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t('Even gaps')}</p>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" role="menuitem" aria-label={t("Space evenly across")} onClick={() => choose(() => onSpread('x'))} className={item}>
                    <AlignHorizontalSpaceBetween size={18} />
                    {t('Across')}
                  </button>
                  <button type="button" role="menuitem" aria-label={t("Space evenly down")} onClick={() => choose(() => onSpread('y'))} className={item}>
                    <AlignVerticalSpaceBetween size={18} />
                    {t('Down')}
                  </button>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

const PAGE_PLACES: Record<LineUpEdge, string> = live({
  left: msg('Left edge'),
  center: msg('Center'),
  right: msg('Right edge'),
  top: msg('Top'),
  middle: msg('Middle'),
  bottom: msg('Bottom'),
})

function ArrangeOptions({ controls }: { controls: ArrangeBarControls }) {
  const { target } = controls
  if (!target) {
    return (
      <>
        {controls.blocked && <Hint>{controls.blocked}</Hint>}
        {controls.locked && (
          <Button variant="secondary" className="h-8 shrink-0 px-3 text-[13px]" onClick={controls.unlock} tip={{ title: t('Unlock'), description: t('Let this layer be picked and moved again.') }}>
            <LockOpen size={15} />
            {t('Unlock')}
          </Button>
        )}
      </>
    )
  }
  const part = target.kind === 'part'
  const several = target.kind === 'many' || target.kind === 'group'
  return (
    <>
      {several && (
        <Readout
          title={target.kind === 'group' ? t('{name} (kept together)', { name: target.name }) : target.name}
          description={
            target.kind === 'group'
              ? t('These are kept together, so they are picked and moved as one. Double-click a part on your design to change just it.')
              : t('They move, resize and turn together. Hold Shift and click to add or take away one. Click empty paper to let go.')
          }
        >
          <span dir="auto">{target.name}</span>
        </Readout>
      )}
      <SizeMenu target={target} ppi={controls.ppi} showAngle={!several} />
      {!several && (
        <Readout title={t("Angle")} description={t("How far it is turned. Hold Shift while turning to go in neat 15° steps.")}>
          {target.angle}°
        </Readout>
      )}
      <Divider />
      {several && (
        <>
          <div className="flex shrink-0 items-center">
            {controls.kept ? (
              <BarButton icon={Ungroup} label={t("Take apart")} title={t("Take apart")} description={t("Let the parts be picked and moved on their own again.")} onClick={controls.takeApart} />
            ) : (
              <BarButton icon={Group} label={t("Keep together")} title={t("Keep together")} description={t("Make them one thing: from now on, a click on any part picks them all. Double-click a part to change just it.")} onClick={controls.keepTogether} />
            )}
            {target.kind === 'many' && <BarButton icon={LayoutGrid} label={t("Tidy up")} title={t("Tidy up")} description={t("Put them in a neat row or column, with even gaps, lined up through their middles.")} onClick={controls.tidyUp} />}
            {target.kind === 'many' && <LineUpMenu several onLineUp={controls.lineUp} onSpread={controls.spreadOut} />}
            {controls.combine && <CombineMenu blocked={controls.combineBlocked ?? null} onCombine={controls.combine} />}
            {controls.alongShape && (
              <BarButton icon={Spline} label={t('Along the shape')} title={t('Along the shape')} description={t('The words follow the edge of the shape picked with them, like words around a round badge. The shape stays; delete it if you want only the words.')} onClick={controls.alongShape} />
            )}
          </div>
          <Divider />
        </>
      )}
      <div className="flex shrink-0 items-center">
        {/* The icon names describe the mirror line: a vertical line flips left to right. */}
        <BarButton icon={FlipVertical2} roomy label={t("Mirror")} title={t("Flip left to right")} description={several ? t('Mirror them, so the left side becomes the right side.') : t('Mirror it, so the left side becomes the right side.')} onClick={() => controls.flip('horizontal')} />
        <BarButton icon={FlipHorizontal2} roomy label={t("Upside down")} title={t("Flip upside down")} description={several ? t('Mirror them top to bottom, so the top becomes the bottom.') : t('Mirror it top to bottom, so the top becomes the bottom.')} onClick={() => controls.flip('vertical')} />
        <BarButton icon={RotateCcw} label={t("Left")} title={t("Turn left")} description={several ? t('Turn them a quarter turn to the left.') : t('Turn it a quarter turn to the left.')} onClick={() => controls.rotate90(-1)} />
        <BarButton icon={RotateCw} label={t("Right")} title={t("Turn right")} description={several ? t('Turn them a quarter turn to the right.') : t('Turn it a quarter turn to the right.')} onClick={() => controls.rotate90(1)} />
      </div>
      {!several && (
        <Tooltip
          title={t("Keep shape")}
          description={t("When on, dragging a corner keeps the same shape, so nothing gets squashed or stretched. Hold Shift while dragging to do the opposite. The side handles always stretch.")}
        >
          <button
            type="button"
            aria-pressed={controls.keepProportions}
            aria-label={t("Keep shape")}
            onClick={() => controls.onKeepProportions(!controls.keepProportions)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
              controls.keepProportions ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
            }`}
          >
            {controls.keepProportions ? <Link size={15} /> : <Unlink size={15} />}
            <span className="hidden xl:inline">{t('Keep shape')}</span>
          </button>
        </Tooltip>
      )}
      {part && <FillGapToggle on={controls.fillGap} onChange={controls.onFillGap} />}
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton
          icon={Crosshair}
          label={t("Center")}
          title={t("Center on design")}
          description={part ? t('Move the selected part so it sits exactly in the middle of your design.') : several ? t('Move them so they sit exactly in the middle of your design.') : t('Move it so it sits exactly in the middle of your design.')}
          onClick={controls.center}
        />
        {!part && target.kind !== 'many' && <LineUpMenu several={false} onLineUp={controls.lineUp} onSpread={controls.spreadOut} />}
        {controls.textWrap && <TextWrapMenu controls={controls.textWrap} />}
        {controls.removeBackground && (
          <BarButton
            icon={Eraser}
            label={t("Remove background")}
            title={t("Remove background")}
            roomy
            description={t('AI finds the main thing in “{name}” and makes everything around it see-through. The first time, the AI is downloaded, which takes a moment. You can undo it.', { name: target.name })}
            onClick={controls.removeBackground}
          />
        )}
        {!part && (
          <>
            <BarButton icon={BringToFront} label={t("Forward")} title={t("Bring forward")} description={several ? t('Move them one step toward the front.') : t('Move “{name}” one step toward the front, over the thing above it.', { name: target.name })} onClick={controls.forward} />
            <BarButton icon={SendToBack} label={t("Backward")} title={t("Send backward")} description={several ? t('Move them one step toward the back.') : t('Move “{name}” one step toward the back, behind the thing below it.', { name: target.name })} onClick={controls.backward} />
            <BarButton icon={Trash2} label={t("Delete")} title={t("Delete")} description={several ? t('Remove them from your design. You can undo this.') : t('Remove “{name}” from your design. You can undo this.', { name: target.name })} onClick={controls.remove} />
          </>
        )}
      </div>
    </>
  )
}

const SHAPE_TYPES: Choice<ShapeType>[] = live([
  { value: 'rectangle', label: msg('Rectangle'), icon: Square, description: msg('Rectangles and squares. Round their corners in the Shape panel.') },
  { value: 'ellipse', label: msg('Oval'), icon: Circle, description: msg('Ovals and circles. Hold Shift while drawing for a perfect circle.') },
  { value: 'polygon', label: msg('Polygon'), icon: Pentagon, description: msg('Triangles, hexagons and more. Choose the number of sides in the Shape panel.') },
  { value: 'star', label: msg('Star'), icon: Star, description: msg('Stars with as many points as you like.') },
  { value: 'line', label: msg('Line'), icon: Minus, description: msg('Straight lines, with an arrow head if you like. Hold Shift to keep them straight.') },
])

const CROP_SHAPES: Choice<CropShape>[] = live([
  { value: 'free', label: msg('Free'), icon: Scan, description: msg('Any shape you like.') },
  { value: 'original', label: msg('Original'), icon: RectangleHorizontal, description: msg('The same shape your design has now.') },
  { value: 'square', label: msg('Square'), icon: Square, description: msg('A perfect square, good for profile pictures and square posts.') },
  { value: 'portrait', label: '4:5', icon: RectangleVertical, description: msg('A little taller than wide, good for social posts.') },
  { value: 'wide', label: '16:9', icon: RectangleHorizontal, description: msg('Wide like a TV screen, good for slides and video thumbnails.') },
])

function CropOptions({ controls }: { controls: CropControls }) {
  const [unit] = useUnit()
  const shown = (pixels: number) => formatInUnit(pixels, unit, controls.ppi)
  const notYet = controls.changed ? undefined : t('Drag the frame first.')
  return (
    <>
      <Segmented label={t("Crop shape")} value={controls.shape} choices={CROP_SHAPES} onChange={controls.onShape} />
      <Readout title={t("New size")} description={t('How big your design will be after cropping, in {unit}.', { unit: unitShort(unit) })}>
        <span dir="ltr">
          {shown(controls.width)} × {shown(controls.height)} {unitShort(unit)}
        </span>
      </Readout>
      <Divider />
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" disabled={!controls.changed} onClick={controls.reset} tip={{ title: t('Start over'), shortcut: 'Esc', description: t('Put the frame back around the whole design.'), note: notYet }}>
        {t('Start over')}
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!controls.changed} onClick={controls.apply} tip={{ title: t('Crop'), shortcut: 'Enter', description: t('Cut the design down to the frame. You can undo this.'), note: notYet }}>
        <Check size={15} />
        {t('Crop')}
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
  const notYet = controls.changed ? undefined : t('Pick a look or move a slider first.')
  const stopComparing = () => controls.onCompare(false)
  return (
    <>
      <Readout
        title={t("What changes")}
        description={t("Adjustments change the selected layer, or only the selected part of it. To change another layer, pick it in the Layers panel.")}
      >
        {controls.target}
      </Readout>
      <Divider />
      <Tooltip title={t("Compare")} description={t("Press and hold to see how it looked before. You can also press and hold on your design.")} note={notYet}>
        <button
          type="button"
          aria-label={t("Hold to compare")}
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
          {t('Hold to compare')}
        </button>
      </Tooltip>
      <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" disabled={!controls.changed} onClick={controls.cancel} tip={{ title: t('Cancel'), shortcut: 'Esc', description: t('Put it back the way it was.'), note: notYet }}>
        {t('Cancel')}
      </Button>
      <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" disabled={!controls.changed} onClick={controls.apply} tip={{ title: t('Apply'), shortcut: 'Enter', description: t('Keep the new look. You can undo it.'), note: notYet }}>
        <Check size={15} />
        {t('Apply')}
      </Button>
    </>
  )
}

// The Pen's settings: finishing a path while drawing, or changing the picked point.
export interface PenBarControls {
  drawing: boolean
  pointCount: number
  canClose: boolean
  selectedPoint: { smooth: boolean } | null
  finish: () => void
  close: () => void
  removeLast: () => void
  setSmooth: (smooth: boolean) => void
  deletePoint: () => void
}

const POINT_KINDS: Choice<'sharp' | 'smooth'>[] = live([
  { value: 'sharp', label: msg('Sharp corner'), icon: Pentagon, description: msg('The lines meet at a point, like the corner of a star. Tip: double-click a point to switch.') },
  { value: 'smooth', label: msg('Smooth curve'), icon: Spline, description: msg('The line flows through the point in a round curve. Drag its round handles to change how it bends.') },
])

function PenOptions({ controls }: { controls: PenBarControls }) {
  if (controls.drawing) {
    return (
      <>
        <Button
          variant="secondary"
          className="h-8 shrink-0 px-3 text-[13px]"
          disabled={!controls.canClose}
          onClick={controls.close}
          tip={{ title: t('Close shape'), description: t('Join the last point to the first, making a closed shape that is filled with color. Clicking the first point does this too.'), note: controls.canClose ? undefined : t('Place at least three points first.') }}
        >
          <Pentagon size={15} />
          {t('Close shape')}
        </Button>
        <Button
          variant="ghost"
          className="h-8 shrink-0 px-3 text-[13px]"
          onClick={controls.removeLast}
          tip={{ title: t('Take back last point'), shortcut: 'Backspace', description: t('Remove the point you placed last, and keep drawing from the one before.') }}
        >
          <Undo2 size={15} />
          {t('Last point')}
        </Button>
        <Button
          variant="primary"
          className="h-8 shrink-0 px-3.5 text-[13px]"
          onClick={controls.finish}
          tip={{ title: t('Finish'), shortcut: 'Enter', description: t('Stop here and keep it as an open line, like a curve or a wave. Clicking the last point again does this too.') }}
        >
          <CornerDownLeft size={15} />
          {t('Finish')}
        </Button>
        <Hint>
          {controls.pointCount < 2
            ? t('Click to place the next point, or press and drag to make the line curve.')
            : t('Keep clicking to add points. Click the first point to close the shape, or press Enter to finish a line.')}
        </Hint>
      </>
    )
  }
  if (controls.selectedPoint) {
    return (
      <>
        <Segmented label={t("Point")} value={controls.selectedPoint.smooth ? 'smooth' : 'sharp'} choices={POINT_KINDS} onChange={(kind) => controls.setSmooth(kind === 'smooth')} />
        <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" onClick={controls.deletePoint} tip={{ title: t('Delete point'), shortcut: 'Delete', description: t('Take this point out. The lines on either side join up.') }}>
          <Trash2 size={15} />
          {t('Delete point')}
        </Button>
        <Hint>{t('Drag the point to move it, or its round handles to change the curve. Hold {key} on a handle to bend one side only.', { key: ALT_LABEL })}</Hint>
      </>
    )
  }
  // Nothing is being drawn and no point is picked: the hint over the page says what to do.
  return null
}

function describeTolerance(tolerance: number): string {
  if (tolerance < 0.02) return t('Only exactly the same color gets filled.')
  if (tolerance < 0.25) return t('Fills very similar colors. Good for flat areas and drawings.')
  if (tolerance < 0.6) return t('Fills somewhat similar colors too. Good for photos.')
  return t('Fills almost any color. Be careful, it may fill a lot.')
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
  arrange: ArrangeBarControls
  crop: CropControls
  shapeType: ShapeType
  pen: PenBarControls
  onShapeTypeChange: (type: ShapeType) => void
  onAddText: (kind: TextKind) => void
  onAddTable: () => void
  adjust: AdjustControls
  fillTolerance: number
  onFillToleranceChange: (tolerance: number) => void
  healSize: number
  onHealSizeChange: (size: number) => void
  copy: CopyBarControls
  colorSelect: ColorSelectControls
  edge: EdgeControls
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
      aria-label={t('{tool} settings', { tool: info.name })}
      role="toolbar"
      className="mx-3 mb-3 flex h-[62px] shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden rounded-card border border-line bg-surface px-3 shadow-card xl:gap-4"
    >
      <div className="flex shrink-0 items-center gap-2 pe-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span className="text-[14px] font-semibold leading-tight text-ink">{info.name}</span>
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
          colorSelect={props.colorSelect}
          edge={props.edge}
          onShapeChange={props.onSelectionShapeChange}
          onModeChange={props.onSelectionModeChange}
        />
      ) : props.tool === 'move' ? (
        <ArrangeOptions controls={props.arrange} />
      ) : props.tool === 'shape' ? (
        <>
          <Segmented label={t("Shape to draw")} value={props.shapeType} choices={SHAPE_TYPES} onChange={props.onShapeTypeChange} />
          <Hint>{t('Drag on your design to draw, or click to drop one. Its colors come from the Color panel. For a shape of your own, use the Curve tool (P).')}</Hint>
        </>
      ) : props.tool === 'pen' ? (
        <PenOptions controls={props.pen} />
      ) : props.tool === 'text' ? (
        <>
          <div className="flex shrink-0 gap-1.5">
            {(Object.keys(TEXT_KINDS) as TextKind[]).map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                className="h-8 shrink-0 px-3 text-[13px]"
                onClick={() => props.onAddText(kind)}
                tip={{ title: TEXT_KINDS[kind].addTitle, description: t('{description} It starts in the middle; just type to replace the words.', { description: TEXT_KINDS[kind].description }) }}
              >
                <Plus size={15} />
                {TEXT_KINDS[kind].name}
              </Button>
            ))}
            <Button
              variant="secondary"
              className="h-8 shrink-0 px-3 text-[13px]"
              onClick={props.onAddTable}
              tip={{
                title: t('Add a table'),
                description: t('Rows and columns of words, for menus, price lists and timetables. Click a cell to type in it; Tab goes to the next cell.'),
              }}
            >
              <Table2 size={15} />
              {t('Table')}
            </Button>
          </div>
        </>
      ) : props.tool === 'crop' ? (
        <CropOptions controls={props.crop} />
      ) : props.tool === 'adjust' ? (
        <AdjustOptions controls={props.adjust} />
      ) : props.tool === 'fill' ? (
        <>
          <Slider
            className="w-40 shrink-0"
            label={t("Similar colors")}
            help={t("How different a color can be and still get filled. Low fills only one exact color; high fills more.")}
            value={props.fillTolerance}
            display={`${Math.round(props.fillTolerance * 100)}%`}
            note={describeTolerance(props.fillTolerance)}
            onChange={(position) => props.onFillToleranceChange(Math.round(position * 100) / 100)}
          />
        </>
      ) : props.tool === 'clone' ? (
        <CopyOptions controls={props.copy} />
      ) : props.tool === 'heal' ? (
        <>
          <Slider
            className="w-40 shrink-0"
            label={t("Size")}
            help={t("How wide the brush is. A little bigger than the spot works best.")}
            value={sizeToSlider(props.healSize)}
            display={`${props.healSize} px`}
            onChange={(position) => props.onHealSizeChange(sliderToSize(position))}
          />
        </>
      ) : (
        <Hint>{info.description}</Hint>
      )}
    </div>
  )
}
