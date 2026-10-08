import type { EditorDocument, Point } from '../editor/types.ts'
import { formatZoom } from '../editor/viewport.ts'
import { ALT_LABEL, shortcut } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'

interface StatusBarProps {
  doc: EditorDocument | null
  zoom: number
  cursor: Point | null
}

export function StatusBar({ doc, zoom, cursor }: StatusBarProps) {
  const inside = doc && cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < doc.width && cursor.y < doc.height
  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-400">
      {doc ? (
        <>
          <Tooltip side="top" title="Zoom" description="How big the image is shown on your screen. 100% is its real size.">
            <span className="tabular-nums text-zinc-200">{formatZoom(zoom)}</span>
          </Tooltip>
          <Tooltip side="top" title="Image size" description="The real size of your image, in pixels. Pixels are the tiny colored squares every digital image is made of.">
            <span className="tabular-nums">
              {doc.width} × {doc.height} px
            </span>
          </Tooltip>
          <Tooltip side="top" title="Pointer position" description="Where your pointer is on the image, counted in pixels from the top-left corner.">
            <span className="min-w-28 tabular-nums">
              {inside ? `X ${Math.floor(cursor.x)}   Y ${Math.floor(cursor.y)}` : 'X –   Y –'}
            </span>
          </Tooltip>
          <span className="ml-auto truncate text-zinc-500">
            Hold Space and drag to move around · {shortcut('mod')} or {ALT_LABEL} + scroll to zoom
          </span>
        </>
      ) : (
        <span className="text-zinc-500">No image open</span>
      )}
    </footer>
  )
}
