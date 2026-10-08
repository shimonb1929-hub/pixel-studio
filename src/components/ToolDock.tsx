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
      className="flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-card border border-line bg-surface p-1.5 shadow-card"
    >
      {TOOLS.map(({ id, name, key, icon: Icon, description }) => (
        <Tooltip key={id} side="right" title={`${name} tool`} shortcut={key} description={description}>
          <button
            type="button"
            aria-label={`${name} tool`}
            aria-pressed={tool === id}
            onClick={() => onToolChange(id)}
            className={`flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-medium transition-colors ${
              tool === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
            }`}
          >
            <Icon size={20} strokeWidth={1.75} />
            {name}
          </button>
        </Tooltip>
      ))}
    </nav>
  )
}
