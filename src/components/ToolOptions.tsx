import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, BringToFront, Check, ChevronDown, Circle, Contrast, Copy, Crosshair, Eye, FlipHorizontal2, FlipVertical2, Group, Lasso, LayoutGrid, Link, LockOpen, Minus, PaintBucket, Pentagon, Plus, RectangleHorizontal, RectangleVertical, RotateCcw, RotateCw, Scan, SendToBack, Square, SquareDashed, SquareMinus, SquarePlus, SquareSlash, Star, Trash2, Ungroup, Unlink, WandSparkles, Eraser, type LucideIcon } from 'lucide-react'
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
  {
    value: 'magic',
    label: 'Magic',
    icon: WandSparkles,
    description: 'Click a thing (a person, an animal, a house, a tree) and it is selected for you, right to its edges. Or drag a box around it. The first time, it takes a moment to get ready.',
  },
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

const LINE_UPS: { edge: LineUpEdge; label: string; icon: LucideIcon }[] = [
  { edge: 'left', label: 'Left edges', icon: AlignStartVertical },
  { edge: 'center', label: 'Centers', icon: AlignCenterVertical },
  { edge: 'right', label: 'Right edges', icon: AlignEndVertical },
  { edge: 'top', label: 'Tops', icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Middles', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Bottoms', icon: AlignEndHorizontal },
]

// Lining up, as a small menu of pictures: with each other for several things, with the page for one.
function LineUpMenu({ several, onLineUp, onSpread }: { several: boolean; onLineUp: (edge: LineUpEdge) => void; onSpread: (axis: 'x' | 'y') => void }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The bar scrolls sideways, so the menu floats above the page instead of inside the bar.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = buttonRef.current?.getBoundingClientRect()
    const menu = menuRef.current?.getBoundingClientRect()
    if (!anchor || !menu) return
    setPosition({ left: Math.min(Math.max(8, anchor.left), window.innerWidth - menu.width - 8), top: anchor.bottom + 6 })
  }, [open])

  // Once it's in place (and can take focus), the first choice is ready for the keyboard.
  useEffect(() => {
    if (open && position) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
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

  function choose(run: () => void) {
    setOpen(false)
    setPosition(null)
    run()
  }

  const item = 'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-ink-2 outline-none hover:bg-subtle hover:text-ink focus-visible:bg-subtle focus-visible:text-ink'
  return (
    <>
      <Tooltip
        title="Line up"
        description={several ? 'Line the picked things up with each other by an edge or the middle, or space them evenly.' : 'Move it to an edge or the middle of the page.'}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label="Line up"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setPosition(null)
            setOpen(!open)
          }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${open ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
        >
          <AlignStartVertical size={15} />
          <span className="hidden xl:inline">Line up</span>
          <ChevronDown size={13} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Line up"
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
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{several ? 'Line up their' : 'Move to the page’s'}</p>
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
                <p className="px-1 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Even gaps</p>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" role="menuitem" aria-label="Space evenly across" onClick={() => choose(() => onSpread('x'))} className={item}>
                    <AlignHorizontalSpaceBetween size={18} />
                    Across
                  </button>
                  <button type="button" role="menuitem" aria-label="Space evenly down" onClick={() => choose(() => onSpread('y'))} className={item}>
                    <AlignVerticalSpaceBetween size={18} />
                    Down
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

const PAGE_PLACES: Record<LineUpEdge, string> = {
  left: 'Left edge',
  center: 'Center',
  right: 'Right edge',
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
}

function ArrangeOptions({ controls }: { controls: ArrangeBarControls }) {
  const { target } = controls
  if (!target) {
    return (
      <>
        <Hint>{controls.blocked ?? 'Click anything on your design to pick it.'}</Hint>
        {controls.locked && (
          <Button variant="secondary" className="h-8 shrink-0 px-3 text-[13px]" onClick={controls.unlock} tip={{ title: 'Unlock', description: 'Let this layer be picked and moved again.' }}>
            <LockOpen size={15} />
            Unlock
          </Button>
        )}
      </>
    )
  }
  const part = target.kind === 'part'
  const several = target.kind === 'many' || target.kind === 'group'
  const it = several ? 'them' : 'it'
  return (
    <>
      {several && (
        <Readout
          title={target.kind === 'group' ? `${target.name} (kept together)` : target.name}
          description={
            target.kind === 'group'
              ? 'These are kept together, so they are picked and moved as one. Double-click a part on your design to change just it.'
              : 'They move, resize and turn together. Hold Shift and click to add or take away one. Click empty paper to let go.'
          }
        >
          <span dir="auto">{target.name}</span>
        </Readout>
      )}
      <Readout title="Size" description={part ? 'How big the selected part is, in pixels.' : several ? 'How big the frame around them is, in pixels.' : `How big "${target.name}" is on your design, in pixels.`}>
        {Math.round(Math.abs(target.width))} × {Math.round(Math.abs(target.height))} px
      </Readout>
      {!several && (
        <Readout title="Angle" description="How far it is turned. Hold Shift while turning to go in neat 15° steps.">
          {target.angle}°
        </Readout>
      )}
      <Divider />
      {several && (
        <>
          <div className="flex shrink-0 items-center">
            {controls.kept ? (
              <BarButton icon={Ungroup} label="Take apart" title="Take apart" description="Let the parts be picked and moved on their own again." onClick={controls.takeApart} />
            ) : (
              <BarButton icon={Group} label="Keep together" title="Keep together" description="Make them one thing: from now on, a click on any part picks them all. Double-click a part to change just it." onClick={controls.keepTogether} />
            )}
            {target.kind === 'many' && <BarButton icon={LayoutGrid} label="Tidy up" title="Tidy up" description="Put them in a neat row or column, with even gaps, lined up through their middles." onClick={controls.tidyUp} />}
            {target.kind === 'many' && <LineUpMenu several onLineUp={controls.lineUp} onSpread={controls.spreadOut} />}
          </div>
          <Divider />
        </>
      )}
      <div className="flex shrink-0 items-center">
        {/* The icon names describe the mirror line: a vertical line flips left to right. */}
        <BarButton icon={FlipVertical2} label="Mirror" title="Flip left to right" description={`Mirror ${it}, so the left side becomes the right side.`} onClick={() => controls.flip('horizontal')} />
        <BarButton icon={FlipHorizontal2} label="Upside down" title="Flip upside down" description={`Mirror ${it} top to bottom, so the top becomes the bottom.`} onClick={() => controls.flip('vertical')} />
        <BarButton icon={RotateCcw} label="Left" title="Turn left" description={`Turn ${it} a quarter turn to the left.`} onClick={() => controls.rotate90(-1)} />
        <BarButton icon={RotateCw} label="Right" title="Turn right" description={`Turn ${it} a quarter turn to the right.`} onClick={() => controls.rotate90(1)} />
      </div>
      {!several && (
        <Tooltip
          title="Keep shape"
          description="When on, dragging a corner keeps the same shape, so nothing gets squashed or stretched. Hold Shift while dragging to do the opposite. The side handles always stretch."
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
            <span className="hidden xl:inline">Keep shape</span>
          </button>
        </Tooltip>
      )}
      <Divider />
      <div className="flex shrink-0 items-center">
        <BarButton
          icon={Crosshair}
          label="Center"
          title="Center on design"
          description={part ? 'Move the selected part so it sits exactly in the middle of your design.' : `Move ${it} so ${several ? 'they sit' : 'it sits'} exactly in the middle of your design.`}
          onClick={controls.center}
        />
        {!part && target.kind !== 'many' && <LineUpMenu several={false} onLineUp={controls.lineUp} onSpread={controls.spreadOut} />}
        {controls.removeBackground && (
          <BarButton
            icon={Eraser}
            label="Remove background"
            title="Remove background"
            roomy
            description={`AI finds the main thing in "${target.name}" and makes everything around it see-through. The first time, the AI is downloaded, which takes a moment. You can undo it.`}
            onClick={controls.removeBackground}
          />
        )}
        {!part && (
          <>
            <BarButton icon={BringToFront} label="Forward" title="Bring forward" description={several ? 'Move them one step toward the front.' : `Move "${target.name}" one step toward the front, over the thing above it.`} onClick={controls.forward} />
            <BarButton icon={SendToBack} label="Backward" title="Send backward" description={several ? 'Move them one step toward the back.' : `Move "${target.name}" one step toward the back, behind the thing below it.`} onClick={controls.backward} />
            <BarButton icon={Trash2} label="Delete" title="Delete" description={several ? 'Remove them from your design. You can undo this.' : `Remove "${target.name}" from your design. You can undo this.`} onClick={controls.remove} />
          </>
        )}
      </div>
    </>
  )
}

const SHAPE_TYPES: Choice<ShapeType>[] = [
  { value: 'rectangle', label: 'Rectangle', icon: Square, description: 'Rectangles and squares. Round their corners in the Shape panel.' },
  { value: 'ellipse', label: 'Oval', icon: Circle, description: 'Ovals and circles. Hold Shift while drawing for a perfect circle.' },
  { value: 'polygon', label: 'Polygon', icon: Pentagon, description: 'Triangles, hexagons and more. Choose the number of sides in the Shape panel.' },
  { value: 'star', label: 'Star', icon: Star, description: 'Stars with as many points as you like.' },
  { value: 'line', label: 'Line', icon: Minus, description: 'Straight lines, with an arrow head if you like. Hold Shift to keep them straight.' },
]

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
  arrange: ArrangeBarControls
  crop: CropControls
  shapeType: ShapeType
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
        <ArrangeOptions controls={props.arrange} />
      ) : props.tool === 'shape' ? (
        <>
          <Segmented label="Shape to draw" value={props.shapeType} choices={SHAPE_TYPES} onChange={props.onShapeTypeChange} />
          <Hint>Drag on your design to draw, or click to drop one. Its colors come from the Color panel.</Hint>
        </>
      ) : props.tool === 'text' ? (
        <>
          <div className="flex shrink-0 gap-1.5">
            {(Object.keys(TEXT_KINDS) as TextKind[]).map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                className="h-8 shrink-0 px-3 text-[13px]"
                onClick={() => props.onAddText(kind)}
                tip={{ title: `Add ${TEXT_KINDS[kind].name.toLowerCase()}`, description: `${TEXT_KINDS[kind].description} It starts in the middle; just type to replace the words.` }}
              >
                <Plus size={15} />
                {TEXT_KINDS[kind].name}
              </Button>
            ))}
          </div>
          <Hint>Or click where your text should start, or drag a box for a paragraph. Hebrew and Yiddish go right to left by themselves.</Hint>
        </>
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
      ) : props.tool === 'heal' ? (
        <>
          <Slider
            className="w-40 shrink-0"
            label="Size"
            help="How wide the brush is. A little bigger than the spot works best."
            value={sizeToSlider(props.healSize)}
            display={`${props.healSize} px`}
            onChange={(position) => props.onHealSizeChange(sliderToSize(position))}
          />
          <Hint>Brush over a spot, a scratch or a small thing. When you let go, it is filled in from what is around it. Undo brings it back.</Hint>
        </>
      ) : (
        <Hint>{info.description}</Hint>
      )}
    </div>
  )
}
