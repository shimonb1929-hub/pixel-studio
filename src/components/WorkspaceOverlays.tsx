import { Maximize2, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EditorDocument, Point, ToolId } from '../editor/types.ts'
import { formatZoom } from '../editor/viewport.ts'
import { shortcut } from '../keys.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip, type TipContent } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

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
  return (
    <div className={`${PILL} bottom-3 start-3 hidden gap-3 rounded-xl px-3 py-2 text-xs tabular-nums text-ink-2 xl:flex`}>
      <Tooltip
        side="top"
        title={t("Design size")}
        description={t("How big your design really is, in pixels. Pixels are the tiny colored squares every digital picture is made of.")}
      >
        <span dir="ltr" className="cursor-default">
          {doc.width} × {doc.height} px
        </span>
      </Tooltip>
      <span className="h-3.5 w-px bg-line" />
      <Tooltip side="top" title={t("Pointer position")} description={t("Where your pointer is on the design, counted in pixels from the top-left corner.")}>
        <span dir="ltr" className="w-24 cursor-default whitespace-pre">
          {inside ? `X ${Math.floor(cursor.x)}   Y ${Math.floor(cursor.y)}` : 'X –   Y –'}
        </span>
      </Tooltip>
    </div>
  )
}
