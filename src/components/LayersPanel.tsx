import { CircleHelp, Eye, EyeOff } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { EditorDocument, Layer } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'

const THUMB_SIZE = 40

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
        ctx.fillStyle = (row + col) % 2 ? '#e8eaee' : '#ffffff'
        ctx.fillRect(x + col * square, y + row * square, Math.min(square, w - col * square), Math.min(square, h - row * square))
      }
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(layer.canvas, x, y, w, h)
  }, [layer])

  return (
    <canvas
      ref={ref}
      className="shrink-0 rounded-md border border-line bg-subtle"
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
    />
  )
}

interface LayersPanelProps {
  doc: EditorDocument | null
  onToggleVisibility: (layerId: string) => void
}

export function LayersPanel({ doc, onToggleVisibility }: LayersPanelProps) {
  return (
    <aside
      aria-label="Layers"
      className="hidden w-64 shrink-0 flex-col rounded-card border border-line bg-surface shadow-card md:flex"
    >
      <div className="flex h-12 items-center px-4">
        <Tooltip
          title="Layers"
          description="Layers are like clear sheets stacked on top of each other. You can change one sheet without touching the others. The top of the list is the front of your design."
        >
          <h2 className="flex cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            Layers
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>
      {!doc ? (
        <p className="px-4 text-[13px] leading-relaxed text-ink-3">Your design's layers will show up here.</p>
      ) : (
        <ul className="overflow-y-auto px-2 pb-2">
          {[...doc.layers].reverse().map((layer) => (
            <li key={layer.id} className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-subtle">
              <LayerThumbnail layer={layer} />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${layer.visible ? 'text-ink' : 'text-ink-3'}`}>
                {layer.name}
              </span>
              <Tooltip
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                description="Hidden layers stay in your design, but you can't see them and they are left out when you download."
              >
                <button
                  type="button"
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  aria-pressed={!layer.visible}
                  onClick={() => onToggleVisibility(layer.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
