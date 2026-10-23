import { Brush, ImagePlus, Maximize2, Minus, Plus, Shapes, Type, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EditorDocument, Point, ToolId } from '../editor/types.ts'
import { formatZoom } from '../editor/viewport.ts'
import { shortcut } from '../keys.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip, type TipContent } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { documentPpi, formatInUnit, useUnit } from '../editor/units.ts'
import { UnitPicker } from './UnitPicker.tsx'
import { unitShort } from './unitWords.ts'

const PILL = 'absolute z-10 items-center border border-line bg-surface/95 shadow-card backdrop-blur'

// Always says what the current tool will do, right where you're looking.
export function ToolHint({ tool, extra }: { tool: ToolId; extra?: string }) {
  const info = TOOLS.find((t) => t.id === tool)!
  const Icon = info.icon
  // Centered with auto margins rather than left: 50%, which would limit it to half the width.
  return (
    <div
      role="status"
      className={`${PILL} pointer-events-none inset-x-3 top-3 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] gap-2 rounded-2xl px-3.5 py-1.5 text-xs leading-[18px]`}
    >
      <Icon size={14} className="shrink-0 text-accent" />
      <span className="shrink-0 whitespace-nowrap font-semibold text-ink">{info.name}</span>
      {/* Wraps rather than cutting the end off, so the whole hint can always be read. */}
      <span className="line-clamp-2 text-ink-2">
        {info.hint}
        {extra && <span className="font-medium text-accent"> {extra}</span>}
      </span>
    </div>
  )
}

function PillButton({ tip, onClick, className = '', children }: { tip: TipContent; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <Tooltip side="top" {...tip}>
      <button
        type="button"
        aria-label={tip.title}
        onClick={onClick}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-subtle hover:text-ink ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onActualSize: () => void
  onFit: () => void
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onActualSize, onFit }: ZoomControlsProps) {
  return (
    <div className={`${PILL} bottom-3 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-xl p-1`}>
      <PillButton
        onClick={onZoomOut}
        className="w-8 text-ink-2"
        tip={{
          title: t('Zoom out'),
          shortcut: shortcut('mod', 'Minus'),
          description: t('See your design smaller, so more of it fits. Your design itself does not change.'),
        }}
      >
        <Minus size={16} />
      </PillButton>
      <PillButton
        onClick={onActualSize}
        className="w-[68px] tabular-nums text-ink"
        tip={{
          title: t('Zoom level'),
          shortcut: shortcut('mod', 'alt', '0'),
          description: t('How big your design looks on screen. 100% is its real size. Click to go back to 100%.'),
        }}
      >
        {formatZoom(zoom)}
      </PillButton>
      <PillButton
        onClick={onZoomIn}
        className="w-8 text-ink-2"
        tip={{
          title: t('Zoom in'),
          shortcut: shortcut('mod', 'Plus'),
          description: t('See your design bigger, to work on small details. Your design itself does not change.'),
        }}
      >
        <Plus size={16} />
      </PillButton>
      <div className="mx-1 h-5 w-px bg-line" />
      <PillButton
        onClick={onFit}
        className="px-2.5 text-ink-2"
        tip={{
          title: t('Fit on screen'),
          shortcut: shortcut('mod', '0'),
          description: t('Show your whole design, as big as fits in the window.'),
        }}
      >
        <Maximize2 size={14} />
        {t('Fit')}
      </PillButton>
    </div>
  )
}

export function DesignInfo({ doc, cursor }: { doc: EditorDocument; cursor: Point | null }) {
  const inside = cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < doc.width && cursor.y < doc.height
  const [unit] = useUnit()
  const ppi = documentPpi(doc)
  const shown = (pixels: number) => formatInUnit(pixels, unit, ppi)
  const short = unitShort(unit)
  return (
    <div className={`${PILL} bottom-3 start-3 hidden gap-3 rounded-xl px-3 py-2 text-xs tabular-nums text-ink-2 xl:flex`}>
      <Tooltip
        side="top"
        title={t("Design size")}
        description={
          unit === 'px'
            ? t('How big your design really is, in pixels. Pixels are the tiny colored squares every digital picture is made of.')
            : t('How big your design will be on paper. It is {width} × {height} pixels, at {ppi} pixels per inch.', { width: doc.width, height: doc.height, ppi })
        }
      >
        <span dir="ltr" className="cursor-default">
          {shown(doc.width)} × {shown(doc.height)} {short}
        </span>
      </Tooltip>
      {/* The pointer position needs a wide screen; on a small laptop it would run into the zoom buttons. */}
      <span className="hidden h-3.5 w-px bg-line 2xl:block" />
      <Tooltip
        side="top"
        title={t("Pointer position")}
        description={t('Where your pointer is on the design, counted in {unit} from the top-left corner.', { unit: short })}
        className="hidden 2xl:inline-flex"
      >
        <span dir="ltr" className="min-w-24 cursor-default whitespace-pre">
          {inside ? `X ${shown(Math.floor(cursor.x))}   Y ${shown(Math.floor(cursor.y))}` : 'X –   Y –'}
        </span>
      </Tooltip>
      <span className="h-3.5 w-px bg-line" />
      <UnitPicker side="top" className="-my-1" />
    </div>
  )
}

interface StartHereProps {
  onAddWords: () => void
  onAddPhoto: () => void
  onAddShape: () => void
  onDraw: () => void
}

// While the page is still empty, the first steps sit right on it, so nobody has to wonder where to
// begin. They go away as soon as something is on the page.
export function StartHere({ onAddWords, onAddPhoto, onAddShape, onDraw }: StartHereProps) {
  const choices: { title: string; description: string; icon: LucideIcon; onClick: () => void }[] = [
    { title: t('Add words'), description: t('A heading in the middle of the page. Type to change the words.'), icon: Type, onClick: onAddWords },
    { title: t('Add a photo'), description: t('Pick a photo or picture from your computer to put on the page.'), icon: ImagePlus, onClick: onAddPhoto },
    { title: t('Add a shape'), description: t('Draw a rectangle, circle, star or arrow by dragging on the page.'), icon: Shapes, onClick: onAddShape },
    { title: t('Draw'), description: t('Draw and paint with a brush, like on paper.'), icon: Brush, onClick: onDraw },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div role="group" aria-label={t('Start here')} className="pointer-events-auto flex max-w-full flex-col items-center gap-3 rounded-2xl border border-line bg-surface/95 p-4 shadow-card backdrop-blur">
        <p className="text-[15px] font-semibold text-ink">{t('What goes on your page first?')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {choices.map(({ title, description, icon: Icon, onClick }) => (
            <Tooltip key={title} side="bottom" title={title} description={description}>
              <button
                type="button"
                onClick={onClick}
                className="flex h-[88px] w-[112px] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                <Icon size={26} strokeWidth={1.75} className="text-accent" />
                {title}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  )
}
