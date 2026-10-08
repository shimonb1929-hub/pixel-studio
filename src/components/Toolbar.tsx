import type { ToolId } from '../editor/types.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip } from './Tooltip.tsx'

interface ToolbarProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
}

export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <nav aria-label="Tools" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-900 py-2">
      {TOOLS.map(({ id, name, key, icon: Icon, description }) => (
        <Tooltip key={id} side="right" title={`${name} tool`} shortcut={key} description={description}>
          <button
            type="button"
            aria-label={`${name} tool`}
            aria-pressed={tool === id}
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              tool === id ? 'bg-accent text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            onClick={() => onToolChange(id)}
          >
            <Icon size={18} strokeWidth={1.75} />
          </button>
        </Tooltip>
      ))}
    </nav>
  )
}
