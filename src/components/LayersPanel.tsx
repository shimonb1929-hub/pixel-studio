import { Eye, EyeOff } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { EditorDocument, Layer } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'

const THUMB_SIZE = 36

function LayerThumbnail({ layer }: { layer: Layer }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const thumb = ref.current
    const ctx = thumb?.getContext('2d')
    if (!thumb || !ctx) return
    const dpr = window.devicePixelRatio || 1
    thumb.width = thumb.height = THUMB_SIZE * dpr
    const scale = Math.min(thumb.width / layer.canvas.width, thumb.height / layer.canvas.height)
    const w = layer.canvas.width * scale
    const h = layer.canvas.height * scale
    const x = (thumb.width - w) / 2
    const y = (thumb.height - h) / 2
    ctx.clearRect(0, 0, thumb.width, thumb.height)
    // Small checkerboard so see-through layers are visible.
    const square = 4 * dpr
    for (let row = 0; row * square < h; row++) {
      for (let col = 0; col * square < w; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#d4d4d8' : '#ffffff'
        ctx.fillRect(x + col * square, y + row * square, Math.min(square, w - col * square), Math.min(square, h - row * square))
      }
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(layer.canvas, x, y, w, h)
  }, [layer])

  return <canvas ref={ref} className="shrink-0 rounded-sm border border-zinc-600" style={{ width: THUMB_SIZE, height: THUMB_SIZE }} />
}

interface LayersPanelProps {
  doc: EditorDocument | null
  onToggleVisibility: (layerId: string) => void
}

export function LayersPanel({ doc, onToggleVisibility }: LayersPanelProps) {
  return (
    <aside aria-label="Layers" className="flex w-60 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="flex h-8 items-center border-b border-zinc-800 px-3">
        <Tooltip
          title="Layers"
          description="Layers are like clear sheets stacked on top of each other. You can change one sheet without touching the others. The top of this list is the front of your image."
        >
          <h2 className="cursor-default text-xs font-semibold uppercase tracking-wide text-zinc-400">Layers</h2>
        </Tooltip>
      </div>
      {!doc ? (
        <p className="p-3 text-xs leading-relaxed text-zinc-500">Open or create an image to see its layers here.</p>
      ) : (
        <ul className="overflow-y-auto py-1">
          {[...doc.layers].reverse().map((layer) => (
            <li key={layer.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800/60">
              <Tooltip
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                description="Hidden layers stay in your file but are not shown and are left out when you export."
              >
                <button
                  type="button"
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  aria-pressed={!layer.visible}
                  onClick={() => onToggleVisibility(layer.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                >
                  {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </Tooltip>
              <LayerThumbnail layer={layer} />
              <span className={`truncate text-[13px] ${layer.visible ? 'text-zinc-200' : 'text-zinc-500'}`}>{layer.name}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
