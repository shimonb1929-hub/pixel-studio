import { Spline, CornerDownLeft, Undo2, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, BringToFront, Check, ChevronDown, Circle, Contrast, Copy, Crosshair, Eye, FlipHorizontal2, FlipVertical2, Group, Lasso, LayoutGrid, Link, LockOpen, Minus, PaintBucket, Pentagon, Plus, RectangleHorizontal, RectangleVertical, RotateCcw, RotateCw, Scan, SendToBack, Square, SquareDashed, SquareMinus, SquarePlus, SquareSlash, Star, Trash2, Ungroup, Unlink, WandSparkles, Eraser, Sparkles, type LucideIcon } from 'lucide-react'
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
} from '../editor/brushes.ts'
import type { LineUpEdge } from '../editor/organize.ts'
import type { SelectionMode, SelectionShape } from '../editor/selection.ts'
import type { ShapeType, ToolId } from '../editor/types.ts'
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
        value={settings.softness}
        display={`${Math.round(settings.softness * 100)}%`}
        note={describeSoftness(settings.softness)}
        onChange={(position) => set({ softness: Math.round(position * 100) / 100 })}
      />
      <Slider
        className="w-24 shrink-0 xl:w-32"
        label={erasing ? t('Strength') : t('Opacity')}
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
        <span className="text-[11px] font-medium">{preset.name}</span>
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
            className="fixed z-40 rounded-xl border border-line bg-surface p-2 shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <div role="radiogroup" aria-label={t("Ready-made brushes")}>
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="px-1 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group.title}</p>
                  <div className="grid grid-cols-5 gap-1 pb-1">
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
  onShapeChange,
  onModeChange,
}: {
  shape: SelectionShape
  mode: SelectionMode
  commands: SelectionCommands
  onShapeChange: (shape: SelectionShape) => void
  onModeChange: (mode: SelectionMode) => void
}) {
  const nothing = commands.hasSelection ? undefined : t('Select an area first.')
  return (
    <>
      <Segmented label={t("Shape")} value={shape} choices={SHAPES} onChange={onShapeChange} />
      <Segmented label={t("When you drag")} value={mode} choices={MODES} onChange={onModeChange} />
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton icon={SquareDashed} label={t("All")} title={t("Select all")} description={t("Select the whole design.")} onClick={commands.selectAll} />
        <BarButton icon={SquareSlash} label={t("None")} title={t("Deselect")} description={t("Clear the selection, so you can work on the whole design again.")} disabledReason={nothing} onClick={commands.deselect} />
        <BarButton icon={Contrast} label={t("Invert")} title={t("Invert selection")} description={t("Swap what is selected and what is not.")} onClick={commands.invert} />
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
  target: { kind: 'object' | 'part' | 'many' | 'group'; name: string; width: number; height: number; angle: number } | null
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
  // With a selected part: whether moving it fills the gap it leaves.
  fillGap: boolean
  onFillGap: (on: boolean) => void
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
      <span dir="auto" className="shrink-0 cursor-default whitespace-nowrap rounded-lg bg-subtle px-2.5 py-1.5 text-[12px] font-medium tabular-nums text-ink">{children}</span>
    </Tooltip>
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
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    // Esc closes just the menu, before anything else hears it (it would let go of what's picked).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
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
      <Readout title={t("Size")} description={part ? t('How big the selected part is, in pixels.') : several ? t('How big the frame around them is, in pixels.') : t('How big “{name}” is on your design, in pixels.', { name: target.name })}>
        {Math.round(Math.abs(target.width))} × {Math.round(Math.abs(target.height))} px
      </Readout>
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
          </div>
          <Divider />
        </>
      )}
      <div className="flex shrink-0 items-center">
        {/* The icon names describe the mirror line: a vertical line flips left to right. */}
        <BarButton icon={FlipVertical2} label={t("Mirror")} title={t("Flip left to right")} description={several ? t('Mirror them, so the left side becomes the right side.') : t('Mirror it, so the left side becomes the right side.')} onClick={() => controls.flip('horizontal')} />
        <BarButton icon={FlipHorizontal2} label={t("Upside down")} title={t("Flip upside down")} description={several ? t('Mirror them top to bottom, so the top becomes the bottom.') : t('Mirror it top to bottom, so the top becomes the bottom.')} onClick={() => controls.flip('vertical')} />
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
  const notYet = controls.changed ? undefined : t('Drag the frame first.')
  return (
    <>
      <Segmented label={t("Crop shape")} value={controls.shape} choices={CROP_SHAPES} onChange={controls.onShape} />
      <Readout title={t("New size")} description={t("How big your design will be after cropping, in pixels.")}>
        {controls.width} × {controls.height} px
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
  adjust: AdjustControls
  fillTolerance: number
  onFillToleranceChange: (tolerance: number) => void
  healSize: number
  onHealSizeChange: (size: number) => void
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
