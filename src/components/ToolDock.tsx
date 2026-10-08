import { Fragment } from 'react'
import type { ToolId } from '../editor/types.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip } from './Tooltip.tsx'

interface ToolDockProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
}

export function ToolDock({ tool, onToolChange }: ToolDockProps) {
  return (
    <nav
      aria-label="Tools"
      className="flex w-[68px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-card"
    >
      {TOOLS.map(({ id, name, label, key, icon: Icon, description, group }, index) => (
        <Fragment key={id}>
          {index > 0 && TOOLS[index - 1].group !== group && <div role="separator" className="my-1 h-px w-10 shrink-0 bg-line" />}
          <Tooltip side="right" title={`${name} tool`} shortcut={key} description={description}>
            <button
              type="button"
              aria-label={`${name} tool`}
              aria-pressed={tool === id}
              onClick={() => onToolChange(id)}
              className={`flex h-[50px] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-medium transition-colors ${
                tool === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </button>
          </Tooltip>
        </Fragment>
      ))}
    </nav>
  )
}
