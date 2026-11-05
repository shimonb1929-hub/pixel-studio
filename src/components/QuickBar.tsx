import { BringToFront, CopyPlus, Ellipsis, Paintbrush, Trash2, type LucideIcon } from 'lucide-react'
import type { Action } from '../actions.ts'
import type { Rect } from '../editor/geometry.ts'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'

// A small bar right next to what is picked, with the few things people do most with it, so they
// are found where the eyes already are. "More" opens every other choice for it.

const BAR_HEIGHT = 40
const GAP = 12

interface QuickBarProps {
  // Where the picked thing is, in the view's own pixels.
  around: Rect
  // The size of the view.
  width: number
  height: number
  actions: Action[]
  onMore: (x: number, y: number) => void
}

const ITEMS: { id: string; label: () => string; icon: LucideIcon; danger?: boolean }[] = [
  { id: 'layer-duplicate', label: () => t('Make a copy'), icon: CopyPlus },
  { id: 'copy-look', label: () => t('Copy the look'), icon: Paintbrush },
  { id: 'layer-front', label: () => t('To front'), icon: BringToFront },
  { id: 'layer-delete', label: () => t('Delete'), icon: Trash2, danger: true },
]

export function QuickBar({ around, width, height, actions, onMore }: QuickBarProps) {
  // Under the thing when there is room, otherwise above it, and always inside the view.
  const below = around.y + around.height + GAP
  const top = below + BAR_HEIGHT <= height - 56 ? below : Math.max(8, around.y - GAP - BAR_HEIGHT)
  const middle = Math.min(Math.max(around.x + around.width / 2, 0), width)
  const items = ITEMS.map((item) => ({ ...item, action: actions.find((a) => a.id === item.id) })).filter((item) => item.action && !item.action.disabledReason)
  return (
    <div
      role="group"
      aria-label={t('Quick choices for what is picked')}
      data-quickbar
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute z-[2] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface/95 p-1 shadow-float backdrop-blur"
      style={{ left: middle, top, height: BAR_HEIGHT, maxWidth: width - 16 }}
    >
      {items.map(({ id, label, icon: Icon, danger, action }) => (
        <Tooltip key={id} side="top" title={action!.title} description={action!.description} shortcut={action!.shortcut}>
          <button
            type="button"
            aria-label={label()}
            onClick={() => action!.run()}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] w-8 justify-center font-medium text-ink-2 transition-colors hover:bg-subtle ${danger ? 'hover:text-danger' : 'hover:text-ink'}`}
          >
            <Icon size={15} />
            <span className="sr-only">{label()}</span>
          </button>
        </Tooltip>
      ))}
      <Tooltip side="top" title={t('More')} description={t('Every other choice for what is picked, like a right-click.')}>
        <button
          type="button"
          aria-label={t('More')}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            onMore(box.left, box.bottom + 4)
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] w-8 justify-center font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
        >
          <Ellipsis size={15} />
          <span className="sr-only">{t('More')}</span>
        </button>
      </Tooltip>
    </div>
  )
}
