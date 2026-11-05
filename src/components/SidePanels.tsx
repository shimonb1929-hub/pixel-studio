import { Layers, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'
import { ScrollRegion } from './ui.tsx'

// Which panel is open over the design on a narrow screen (a phone or an upright tablet).
export type OpenPanel = 'settings' | 'layers'

interface SidePanelsProps {
  // The panels for what is picked: its settings, its color, its effects.
  settings: ReactNode
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

const SPLIT_KEY = 'pixel-studio-panel-split'
const MIN_SPLIT = 0.15
const MAX_SPLIT = 0.85
// The least height the Layers panel needs below the bar: its title, two rows and its buttons.
const LAYERS_ROOM = 272

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

// The panels on the right: beside the design on a wide screen, or opened over it on a narrow one.
export function SidePanels(props: SidePanelsProps) {
  return props.wide ? <PanelColumn settings={props.settings} layers={props.layers} /> : props.open ? <PanelSheet {...props} open={props.open} /> : null
}

// The column beside the design. The picked thing's panels sit on top and the Layers list below;
// the bar between them drags up or down to give either one more room.
function PanelColumn({ settings, layers }: { settings: ReactNode; layers: ReactNode }) {
  const columnRef = useRef<HTMLDivElement>(null)
  // How much of the column the top panels may take, or null for the usual amount.
  const [split, setSplit] = useState<number | null>(rememberedSplit)
  const [dragging, setDragging] = useState(false)

  const change = (next: number | null) => {
    const clamped = next === null ? null : Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, next))
    setSplit(clamped)
    keepSplit(clamped)
  }

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const column = columnRef.current
    if (event.button !== 0 || !column) return
    event.preventDefault()
    setDragging(true)
    const move = (e: PointerEvent) => {
      const rect = column.getBoundingClientRect()
      change((e.clientY - rect.top) / rect.height)
    }
    const end = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const now = split ?? 0.64
    if (event.key === 'ArrowUp') change(now - 0.05)
    else if (event.key === 'ArrowDown') change(now + 0.05)
    else if (event.key === 'Home') change(MIN_SPLIT)
    else if (event.key === 'End') change(MAX_SPLIT)
    else return
    event.preventDefault()
  }

  return (
    <div ref={columnRef} className="flex w-[288px] shrink-0 flex-col">
      {/* Until the bar is moved, the panels take the room they need, up to about two thirds of the
          column (then they scroll); the Layers panel always keeps the rest, so it never slips off a
          short screen. However far the bar is moved, Layers keeps room for its title, a few rows and
          its buttons. */}
      <ScrollRegion
        className={`shrink-0 gap-3 ${split === null ? 'max-h-[64%] [@media(max-height:820px)]:max-h-[56%]' : ''}`}
        style={split === null ? undefined : { maxHeight: `min(${split * 100}%, calc(100% - ${LAYERS_ROOM}px))` }}
      >
        {settings}
      </ScrollRegion>
      <Tooltip
        side="top"
        title={t('Make room')}
        description={t('Drag up to give the Layers list more room, or down to give the panels above more room. Double-click to put it back.')}
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
          onPointerDown={startDrag}
          onDoubleClick={() => change(null)}
          onKeyDown={onKeyDown}
          className="group flex h-3 w-full shrink-0 cursor-row-resize touch-none items-center justify-center outline-none"
        >
          <span
            aria-hidden
            className={`h-1 w-10 rounded-full transition-colors ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-line group-focus-visible:bg-accent'}`}
          />
        </div>
      </Tooltip>
      {layers}
    </div>
  )
}

// On a narrow screen one panel opens at a time, over the design: from the side on a tablet, from the
// bottom on a phone. Tabs at its top switch between the picked thing's settings and the Layers list.
function PanelSheet({ settings, layers, settingsName, settingsIcon: SettingsIcon, phone, open, onOpen }: SidePanelsProps & { open: OpenPanel }) {
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
      {open === 'settings' ? <ScrollRegion className="min-h-0 flex-1 gap-3">{settings}</ScrollRegion> : layers}
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
