import { ChevronDown, ChevronUp, Layers, PanelsTopLeft, RotateCcw, X, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button, ScrollRegion } from './ui.tsx'
import {
  canMove,
  clampWidth,
  DEFAULT_LAYOUT,
  isDefaultLayout,
  keepLayout,
  loadLayout,
  MAX_WIDTH,
  MIN_WIDTH,
  movePanel,
  PANEL_WIDTHS,
  setShown,
  type PanelId,
  type PanelLayout,
} from './panelLayout.ts'

// Which panel is open over the design on a narrow screen (a phone or an upright tablet).
export type OpenPanel = 'settings' | 'layers'

interface SidePanelsProps {
  // The panels for what is picked: its settings, its color, its effects. Each may be empty.
  panels: Record<Exclude<PanelId, 'layers'>, ReactNode>
  layers: ReactNode
  // What the settings are for, in one word ("Shape", "Text", "Color"), with its picture.
  settingsName: string
  settingsIcon: LucideIcon
  // Wide screens keep both in a column beside the design; narrow ones open one at a time.
  wide: boolean
  phone: boolean
  open: OpenPanel | null
  onOpen: (panel: OpenPanel | null) => void
}

// Sent to open "Your panels" from the Menu, search or Help.
export const OPEN_YOUR_PANELS = 'pixel-studio-open-your-panels'

const SPLIT_KEY = 'pixel-studio-panel-split'
const MIN_SPLIT = 0.15
const MAX_SPLIT = 0.85
// The least height the Layers panel needs beside the bar: its title, two rows and its buttons.
const LAYERS_ROOM = 272
// The "Your panels" button under the column, with the space above it. The two together (312px) are
// also written out in the column's usual size below, as Tailwind needs whole class names.
const YOUR_PANELS_ROW = 40

function rememberedSplit(): number | null {
  try {
    const value = Number(localStorage.getItem(SPLIT_KEY))
    return value >= MIN_SPLIT && value <= MAX_SPLIT ? value : null
  } catch {
    return null
  }
}

function keepSplit(split: number | null) {
  try {
    if (split === null) localStorage.removeItem(SPLIT_KEY)
    else localStorage.setItem(SPLIT_KEY, String(split))
  } catch {
    // Not kept, but the size still holds until the page is closed.
  }
}

// Drags with the mouse or a finger, calling `move` with each pointer position until let go.
function dragWith(event: ReactPointerEvent, move: (e: PointerEvent) => void, done: () => void) {
  event.preventDefault()
  const end = () => {
    done()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

// The panels on the right: beside the design on a wide screen, or opened over it on a narrow one.
export function SidePanels(props: SidePanelsProps) {
  return props.wide ? <PanelColumn panels={props.panels} layers={props.layers} /> : props.open ? <PanelSheet {...props} open={props.open} /> : null
}

// The column beside the design. The picked thing's panels sit together and the Layers list below
// them (or above, if moved there); the bar between them drags to give either one more room. The
// column's inner edge drags to make it wider, and "Your panels" picks which panels show and in what
// order.
function PanelColumn({ panels, layers }: { panels: SidePanelsProps['panels']; layers: ReactNode }) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<PanelLayout>(loadLayout)
  // How much of the column the other panels may take, or null for the usual amount.
  const [split, setSplit] = useState<number | null>(rememberedSplit)
  const [dragging, setDragging] = useState<'split' | 'width' | null>(null)

  const changeLayout = setLayout
  useEffect(() => keepLayout(layout), [layout])
  const change = (next: number | null) => {
    const clamped = next === null ? null : Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, next))
    setSplit(clamped)
    keepSplit(clamped)
  }
  const putBack = () => {
    changeLayout(DEFAULT_LAYOUT)
    change(null)
  }

  const layersShown = !layout.hidden.includes('layers')
  const layersOnTop = layout.order[0] === 'layers'
  const stack = layout.order.filter((id): id is Exclude<PanelId, 'layers'> => id !== 'layers' && !layout.hidden.includes(id))
  const anyShown = layersShown || stack.length > 0

  const startSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const column = columnRef.current
    if (event.button !== 0 || !column) return
    setDragging('split')
    dragWith(
      event,
      (e) => {
        const rect = column.getBoundingClientRect()
        // The share the other panels take: above the bar, or below it when Layers is on top.
        change(layersOnTop ? (rect.bottom - e.clientY) / rect.height : (e.clientY - rect.top) / rect.height)
      },
      () => setDragging(null),
    )
  }

  const onSplitKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const now = split ?? 0.64
    const step = layersOnTop ? -0.05 : 0.05
    if (event.key === 'ArrowUp') change(now - step)
    else if (event.key === 'ArrowDown') change(now + step)
    else if (event.key === 'Home') change(layersOnTop ? MAX_SPLIT : MIN_SPLIT)
    else if (event.key === 'End') change(layersOnTop ? MIN_SPLIT : MAX_SPLIT)
    else return
    event.preventDefault()
  }

  const startWidth = (event: ReactPointerEvent<HTMLDivElement>) => {
    const column = columnRef.current
    if (event.button !== 0 || !column) return
    setDragging('width')
    const rtl = getComputedStyle(column).direction === 'rtl'
    dragWith(
      event,
      (e) => {
        const rect = column.getBoundingClientRect()
        const width = clampWidth(rtl ? e.clientX - rect.left : rect.right - e.clientX)
        setLayout((now) => ({ ...now, width }))
      },
      () => setDragging(null),
    )
  }

  const onWidthKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // The edge faces the design, so the arrow pointing at the design makes the column wider.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const wider = rtl ? 'ArrowRight' : 'ArrowLeft'
    const narrower = rtl ? 'ArrowLeft' : 'ArrowRight'
    if (event.key === wider) changeLayout({ ...layout, width: clampWidth(layout.width + 16) })
    else if (event.key === narrower) changeLayout({ ...layout, width: clampWidth(layout.width - 16) })
    else return
    event.preventDefault()
  }

  const stackRegion = stack.length > 0 && (
    <ScrollRegion
      className={`gap-3 ${
        !layersShown
          ? 'min-h-0 flex-1'
          : `shrink-0 ${split === null ? 'max-h-[min(64%,calc(100%-312px))] [@media(max-height:820px)]:max-h-[min(56%,calc(100%-312px))]' : ''}`
      }`}
      style={!layersShown || split === null ? undefined : { maxHeight: `min(${split * 100}%, calc(100% - ${LAYERS_ROOM + YOUR_PANELS_ROW}px))` }}
    >
      {stack.map((id) => (
        <Fragment key={id}>{panels[id]}</Fragment>
      ))}
    </ScrollRegion>
  )
  const bar = stackRegion && layersShown && (
    <Tooltip
      side="top"
      title={t('Make room')}
      description={t('Drag up or down to give the Layers list or the panels beside it more room. Double-click to put it back.')}
      className="flex w-full shrink-0"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('Make room')}
        aria-valuemin={Math.round(MIN_SPLIT * 100)}
        aria-valuemax={Math.round(MAX_SPLIT * 100)}
        aria-valuenow={Math.round((split ?? 0.64) * 100)}
        tabIndex={0}
        onPointerDown={startSplit}
        onDoubleClick={() => change(null)}
        onKeyDown={onSplitKey}
        className="group flex h-3 w-full shrink-0 cursor-row-resize touch-none items-center justify-center outline-none"
      >
        <span
          aria-hidden
          className={`h-1 w-10 rounded-full transition-colors ${dragging === 'split' ? 'bg-accent' : 'bg-transparent group-hover:bg-line group-focus-visible:bg-accent'}`}
        />
      </div>
    </Tooltip>
  )
  const layersRegion = layersShown && layers

  return (
    <div ref={columnRef} className="relative flex shrink-0 flex-col" style={{ width: layout.width }}>
      {/* The inner edge, between the design and the panels: drag it to make the panels wider. */}
      <Tooltip
        side="right"
        title={t('Panel width')}
        description={t('Drag to make the panels wider or narrower. Double-click to put it back.')}
        className="absolute -start-3 inset-y-0 z-10 flex w-3"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Panel width')}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={layout.width}
          tabIndex={0}
          onPointerDown={startWidth}
          onDoubleClick={() => changeLayout({ ...layout, width: DEFAULT_LAYOUT.width })}
          onKeyDown={onWidthKey}
          className="group flex h-full w-full cursor-col-resize touch-none items-center justify-center outline-none"
        >
          <span
            aria-hidden
            className={`h-10 w-1 rounded-full transition-colors ${dragging === 'width' ? 'bg-accent' : 'bg-transparent group-hover:bg-line group-focus-visible:bg-accent'}`}
          />
        </div>
      </Tooltip>
      {layersOnTop ? (
        <>
          {layersRegion}
          {bar}
          {stackRegion}
        </>
      ) : (
        <>
          {stackRegion}
          {bar}
          {layersRegion}
        </>
      )}
      {!anyShown && (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-ink-3">
          {t('Every panel is put away. Press Your panels below to show them again.')}
        </p>
      )}
      <YourPanels layout={layout} onChange={changeLayout} onPutBack={putBack} canPutBack={!isDefaultLayout(layout) || split !== null} />
    </div>
  )
}

const PANEL_NAMES: Record<PanelId, () => string> = {
  settings: () => t('What you picked'),
  color: () => t('Color'),
  effects: () => t('Effects'),
  layers: () => t('Layers'),
}

interface YourPanelsProps {
  layout: PanelLayout
  onChange: (layout: PanelLayout) => void
  onPutBack: () => void
  canPutBack: boolean
}

// A small button under the panels that opens a short list of them: show or put away each one, move
// it up or down, and choose how wide they are. Every change shows right away.
function YourPanels({ layout, onChange, onPutBack, canPutBack }: YourPanelsProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_YOUR_PANELS, show)
    return () => window.removeEventListener(OPEN_YOUR_PANELS, show)
  }, [])

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const iconButton =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-30'
  const widths: [keyof typeof PANEL_WIDTHS, string][] = [
    ['narrow', t('Narrow')],
    ['wide', t('Wide')],
    ['widest', t('Widest')],
  ]

  return (
    <div
      ref={boxRef}
      className="relative mt-2 flex shrink-0 justify-center"
      onKeyDown={(event) => {
        // Keys pressed here stay here, so they never change the design.
        event.stopPropagation()
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <Tooltip side="top" title={t('Your panels')} description={t('Choose which panels you see here, their order, and how wide they are.')}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${open ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-subtle hover:text-ink'}`}
        >
          <PanelsTopLeft size={14} />
          {t('Your panels')}
        </button>
      </Tooltip>
      {open && (
        <div
          role="dialog"
          aria-label={t('Your panels')}
          className="absolute bottom-full end-0 z-40 mb-2 flex w-[272px] flex-col gap-3 rounded-[16px] border border-line bg-surface p-3 shadow-float"
        >
          <p className="px-1 text-[12px] leading-snug text-ink-2">{t('Show the panels you want, in the order you like. You see each change right away.')}</p>
          <ul className="flex flex-col gap-0.5">
            {layout.order.map((id) => {
              const shown = !layout.hidden.includes(id)
              const name = PANEL_NAMES[id]()
              return (
                <li key={id} className="flex items-center gap-1 rounded-[10px] ps-1 hover:bg-subtle">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={(event) => onChange(setShown(layout, id, event.target.checked))}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className={`truncate ${shown ? '' : 'text-ink-3'}`}>{name}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={t('Move {name} up', { name })}
                    title={t('Move {name} up', { name })}
                    disabled={!canMove(layout, id, -1)}
                    onClick={() => onChange(movePanel(layout, id, -1))}
                    className={iconButton}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Move {name} down', { name })}
                    title={t('Move {name} down', { name })}
                    disabled={!canMove(layout, id, 1)}
                    onClick={() => onChange(movePanel(layout, id, 1))}
                    className={iconButton}
                  >
                    <ChevronDown size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[12px] font-medium text-ink-2">{t('How wide')}</span>
            <div role="radiogroup" aria-label={t('How wide')} className="flex gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
              {widths.map(([key, label]) => {
                const on = layout.width === PANEL_WIDTHS[key]
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ ...layout, width: PANEL_WIDTHS[key] })}
                    className={`h-8 flex-1 rounded-lg text-[12px] font-medium transition-colors ${on ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <Button variant="secondary" disabled={!canPutBack} onClick={onPutBack} tip={{ title: t('Put back how it was'), description: t('Show every panel again, in the usual order and size.') }}>
            <RotateCcw size={14} />
            {t('Put back how it was')}
          </Button>
        </div>
      )}
    </div>
  )
}

// On a narrow screen one panel opens at a time, over the design: from the side on a tablet, from the
// bottom on a phone. Tabs at its top switch between the picked thing's settings and the Layers list.
function PanelSheet({ panels, layers, settingsName, settingsIcon: SettingsIcon, phone, open, onOpen }: SidePanelsProps & { open: OpenPanel }) {
  const tab = (panel: OpenPanel, Icon: LucideIcon, name: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={open === panel}
      onClick={() => onOpen(panel)}
      className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
        open === panel ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  )
  return (
    <aside
      aria-label={t('Panels')}
      className={`fixed z-30 flex flex-col gap-2 border border-line bg-shell p-2 shadow-float ${
        phone ? 'inset-x-0 bottom-0 h-[min(68vh,560px)] rounded-t-3xl pt-1' : 'bottom-3 end-3 top-[130px] w-[320px] rounded-[20px]'
      }`}
    >
      {phone && <span aria-hidden className="mx-auto mt-1 h-1 w-10 shrink-0 rounded-full bg-line" />}
      <div className="flex shrink-0 items-center gap-1.5">
        <div role="tablist" className="flex min-w-0 flex-1 gap-1 rounded-xl bg-subtle p-1">
          {tab('settings', SettingsIcon, settingsName)}
          {tab('layers', Layers, t('Layers'))}
        </div>
        <Tooltip title={t('Close panels')} description={t('Put the panels away to see more of your design. The buttons at the top of your design open them again.')}>
          <button
            type="button"
            aria-label={t('Close panels')}
            onClick={() => onOpen(null)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <X size={18} />
          </button>
        </Tooltip>
      </div>
      {open === 'settings' ? (
        <ScrollRegion className="min-h-0 flex-1 gap-3">
          {panels.settings}
          {panels.color}
          {panels.effects}
        </ScrollRegion>
      ) : (
        layers
      )}
    </aside>
  )
}

interface PanelButtonsProps {
  settingsName: string
  settingsIcon: LucideIcon
  onOpen: (panel: OpenPanel) => void
}

// On a narrow screen, the two buttons at the top of the design that open the panels. The first is
// named after what is picked, so the settings for it are always one tap away.
export function PanelButtons({ settingsName, settingsIcon: SettingsIcon, onOpen }: PanelButtonsProps) {
  // A soft glow when the first button starts meaning something new, so it's noticed without a word.
  const [fresh, setFresh] = useState(false)
  const lastRef = useRef(settingsName)
  useEffect(() => {
    if (lastRef.current === settingsName) return
    lastRef.current = settingsName
    setFresh(true)
    const timer = window.setTimeout(() => setFresh(false), 1600)
    return () => window.clearTimeout(timer)
  }, [settingsName])

  const button = 'flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink'
  return (
    <div role="group" aria-label={t('Panels')} className="absolute end-3 top-3 z-20 flex gap-0.5 rounded-xl border border-line bg-surface/95 p-1 shadow-card backdrop-blur">
      <Tooltip side="bottom" title={t('Settings for {thing}', { thing: settingsName })} description={t('Open the settings for what you picked: its color, size, style and more.')}>
        <button type="button" onClick={() => onOpen('settings')} className={`${button} ${fresh ? 'bg-accent-soft text-accent' : ''}`}>
          <SettingsIcon size={16} />
          {settingsName}
        </button>
      </Tooltip>
      <Tooltip side="bottom" title={t('Layers')} description={t('Everything on your design, from front to back. Drag a layer by its handle to put it in front of or behind others.')}>
        <button type="button" onClick={() => onOpen('layers')} className={button}>
          <Layers size={16} />
          {t('Layers')}
        </button>
      </Tooltip>
    </div>
  )
}
