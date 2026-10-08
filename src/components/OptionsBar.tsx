import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ToolId } from '../editor/types.ts'
import { shortcut } from '../keys.ts'
import { TOOLS } from '../tools.ts'
import { Tooltip, type TipContent } from './Tooltip.tsx'

interface OptionsBarProps {
  tool: ToolId
  hasDocument: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onActualSize: () => void
  onFit: () => void
}

function BarButton({ tip, disabled, onClick, children }: { tip: TipContent; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip {...tip}>
      <button
        type="button"
        aria-label={tip.title}
        disabled={disabled}
        onClick={onClick}
        className="flex h-6 items-center gap-1.5 rounded px-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50 disabled:text-zinc-600 disabled:hover:bg-transparent"
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function OptionsBar({ tool, hasDocument, onZoomIn, onZoomOut, onActualSize, onFit }: OptionsBarProps) {
  const info = TOOLS.find((t) => t.id === tool)!
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3">
      <span className="text-xs font-semibold text-zinc-100">{info.name} tool</span>
      <span className="text-xs text-zinc-400">{info.howTo}</span>
      <div className="ml-auto flex items-center gap-1">
        <BarButton
          disabled={!hasDocument}
          onClick={onZoomOut}
          tip={{
            title: 'Zoom out',
            shortcut: shortcut('mod', '-'),
            description: 'Shows the image smaller so you can see more of it. The image itself does not change.',
          }}
        >
          <Minus size={14} />
        </BarButton>
        <BarButton
          disabled={!hasDocument}
          onClick={onZoomIn}
          tip={{
            title: 'Zoom in',
            shortcut: shortcut('mod', '+'),
            description: 'Shows the image bigger so you can see small details. The image itself does not change.',
          }}
        >
          <Plus size={14} />
        </BarButton>
        <BarButton
          disabled={!hasDocument}
          onClick={onActualSize}
          tip={{
            title: 'Actual size',
            shortcut: shortcut('mod', 'alt', '0'),
            description: 'Shows the image at its real size: each pixel of the image takes one pixel of your screen.',
          }}
        >
          <Scan size={14} />
          100%
        </BarButton>
        <BarButton
          disabled={!hasDocument}
          onClick={onFit}
          tip={{
            title: 'Fit on screen',
            shortcut: shortcut('mod', '0'),
            description: 'Makes the whole image fit inside the window, as large as possible.',
          }}
        >
          <Maximize size={14} />
          Fit
        </BarButton>
      </div>
    </div>
  )
}
