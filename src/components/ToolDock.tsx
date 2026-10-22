import { ImagePlus } from 'lucide-react'
import { Fragment } from 'react'
import type { ToolId } from '../editor/types.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { shortcut } from '../keys.ts'

interface ToolDockProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
  // Adding a photo is not a tool, but it is what people look for next to Shapes and Text.
  onAddPhoto: (() => void) | null
}

export function ToolDock({ tool, onToolChange, onAddPhoto }: ToolDockProps) {
  return (
    <nav
      aria-label={t("Tools")}
      className="flex w-[68px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-card"
    >
      {TOOLS.map(({ id, name, label, key, icon: Icon, description, group }, index) => (
        <Fragment key={id}>
          {index > 0 && TOOLS[index - 1].group !== group && <div role="separator" className="my-1 h-px w-10 shrink-0 bg-line" />}
          <Tooltip side="right" title={t('{tool} tool', { tool: name })} shortcut={key} description={description}>
            <button
              type="button"
              aria-label={t('{tool} tool', { tool: name })}
              aria-pressed={tool === id}
              onClick={() => onToolChange(id)}
              className={`flex h-[46px] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-medium transition-colors ${
                tool === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </button>
          </Tooltip>
          {id === 'text' && onAddPhoto && (
            <Tooltip
              side="right"
              title={t('Add a photo')}
              shortcut={shortcut('mod', 'shift', 'O')}
              description={t('Pick a photo or picture from your computer to put on the page. It keeps all its quality, however often you resize it.')}
            >
              <button
                type="button"
                aria-label={t('Add a photo')}
                onClick={onAddPhoto}
                className="flex h-[46px] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
              >
                <ImagePlus size={20} strokeWidth={1.75} />
                {t('Photo')}
              </button>
            </Tooltip>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
