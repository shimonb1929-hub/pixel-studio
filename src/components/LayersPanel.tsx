import { ArrowDown, ArrowUp, CircleHelp, Copy, Eye, EyeOff, Grid2x2, Lock, LockOpen, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { adjustmentLabel, isNeutral } from '../editor/adjust.ts'
import { drawLayer } from '../editor/compose.ts'
import { activeLayer } from '../editor/layers.ts'
import type { EditorDocument, Layer } from '../editor/types.ts'
import { Tooltip, type TipContent } from './Tooltip.tsx'
import { Slider } from './ui.tsx'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'

const THUMB_SIZE = 40

// A tiny picture of the design's frame with this layer in it, where it sits.
function LayerThumbnail({ layer, revision, doc }: { layer: Layer; revision: number; doc: EditorDocument }) {
  // Text is drawn again once its font arrives.
  const fonts = useFontsVersion()
  const { width: docWidth, height: docHeight } = doc
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const thumb = ref.current
    const ctx = thumb?.getContext('2d')
    if (!thumb || !ctx) return
    const dpr = window.devicePixelRatio || 1
    thumb.width = thumb.height = THUMB_SIZE * dpr
    const scale = Math.min(thumb.width / docWidth, thumb.height / docHeight)
    const w = docWidth * scale
    const h = docHeight * scale
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
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(scale, 0, 0, scale, x, y)
    drawLayer(ctx, doc, layer, { blend: false })
    ctx.restore()
    // Only this layer, its pixels and the design's size matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, revision, docWidth, docHeight, fonts])

  return <canvas ref={ref} aria-hidden className="shrink-0 rounded-md border border-line bg-subtle" style={{ width: THUMB_SIZE, height: THUMB_SIZE }} />
}

function RenameInput({ layer, onRename, onDone }: { layer: Layer; onRename: (name: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter and leaving the box can both fire; only the first one counts.
  const doneRef = useRef(false)

  useLayoutEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function finish(save: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    const name = draft.trim()
    if (save && name && name !== layer.name) onRename(name)
    onDone()
  }

  return (
    <input
      ref={inputRef}
      aria-label="Layer name"
      dir="auto"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true)
        if (event.key === 'Escape') finish(false)
      }}
      className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 text-[13px] text-ink outline-none ring-4 ring-accent/15"
    />
  )
}

function IconButton({ tip, disabledReason, onClick, children }: { tip: TipContent; disabledReason?: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip {...tip} side="top" note={disabledReason}>
      <button
        type="button"
        aria-label={tip.title}
        aria-disabled={disabledReason ? true : undefined}
        onClick={disabledReason ? undefined : onClick}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
      >
        {children}
      </button>
    </Tooltip>
  )
}

function describeLayerOpacity(opacity: number): string {
  if (opacity >= 0.99) return 'Solid. The whole layer shows fully.'
  if (opacity > 0.01) return 'Partly see-through. The layers below show through it.'
  return 'Invisible. The layer is still there; slide up to see it again.'
}

interface LayersPanelProps {
  doc: EditorDocument | null
  revision: number
  onSelect: (layerId: string) => void
  onToggleVisibility: (layerId: string) => void
  onToggleLock: (layerId: string) => void
  // Opens Adjust for a layer, to change its adjustments.
  onEditAdjust: (layerId: string) => void
  onRename: (layerId: string, name: string) => void
  onOpacity: (layerId: string, opacity: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onMove: (direction: 1 | -1) => void
  onDelete: () => void
  // The page under everything: picking it, and making it see-through or giving it a color again.
  onPickPage: () => void
  onSeeThrough: (seeThrough: boolean) => void
}

// The gray-and-white squares that mean "see-through".
const SEE_THROUGH = 'repeating-conic-gradient(#e8eaee 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'

export function LayersPanel(props: LayersPanelProps) {
  const { doc, revision } = props
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const active = doc ? activeLayer(doc) : undefined
  const activeIndex = doc && active ? doc.layers.indexOf(active) : -1
  const noDesign = doc ? undefined : 'Start a new design or open a picture first.'
  const noLayer = noDesign ?? (active ? undefined : 'Pick a layer first. The page itself always stays at the back.')
  const pagePicked = !!doc && !active

  return (
    <section aria-label="Layers" className="flex min-h-48 flex-1 flex-col rounded-card border border-line bg-surface shadow-card">
      <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
        <Tooltip
          title="Layers"
          description="Everything on your design, from front (top of the list) to back. Each photo, shape, text and drawing is its own layer. The page is always at the bottom."
        >
          <h2 className="flex cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            Layers
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <IconButton
          tip={{ title: 'New layer', description: 'Add an empty drawing above the selected layer. Painting makes one by itself when it needs to, so you rarely need this.' }}
          disabledReason={noDesign}
          onClick={props.onAdd}
        >
          <Plus size={17} />
        </IconButton>
      </div>

      {!doc ? (
        <p className="px-4 text-[13px] leading-relaxed text-ink-3">Your design's layers will show up here.</p>
      ) : (
        <ul aria-label="Layer list" className="min-h-0 flex-1 overflow-y-auto px-2">
          {[...doc.layers].reverse().map((layer) => {
            const selected = layer.id === doc.activeLayerId
            return (
              <li
                key={layer.id}
                className={`group flex items-center gap-1 rounded-[10px] pr-1 transition-colors ${selected ? 'bg-accent-soft' : 'hover:bg-subtle'}`}
              >
                {renamingId === layer.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-2">
                    <LayerThumbnail layer={layer} revision={revision} doc={doc} />
                    <RenameInput layer={layer} onRename={(name) => props.onRename(layer.id, name)} onDone={() => setRenamingId(null)} />
                  </div>
                ) : (
                  <Tooltip
                    title={selected ? `${layer.name} (selected)` : layer.name}
                    description={
                      selected
                        ? 'Painting and layer buttons work on this layer. Double-click the name to rename it.'
                        : 'Click to paint on this layer. Double-click the name to rename it.'
                    }
                    side="right"
                    className="flex min-w-0 flex-1"
                  >
                    <button
                      type="button"
                      aria-label={`Layer: ${layer.name}`}
                      aria-pressed={selected}
                      onClick={() => props.onSelect(layer.id)}
                      onDoubleClick={() => setRenamingId(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1.5 pl-2 text-left text-[13px] text-ink"
                    >
                      <LayerThumbnail layer={layer} revision={revision} doc={doc} />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-left">
                        {layer.name}
                      </span>
                    </button>
                  </Tooltip>
                )}
                {layer.adjust && !isNeutral(layer.adjust) && (
                  <Tooltip
                    title={`Adjusted: ${adjustmentLabel(layer.adjust).replace(/ look$/, '')}`}
                    description="This layer's colors are adjusted, and you can still change that. Click to open Adjust."
                  >
                    <button
                      type="button"
                      aria-label={`Change adjustments of ${layer.name}`}
                      onClick={() => props.onEditAdjust(layer.id)}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-accent transition-colors hover:bg-surface"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  description={
                    layer.locked
                      ? "Locked, so it can't be picked or moved on the design by accident. You can still paint on it. Click to unlock it."
                      : "Lock it, so it can't be picked or moved on the design by accident. Handy for backgrounds."
                  }
                >
                  <button
                    type="button"
                    aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    aria-pressed={layer.locked}
                    onClick={() => props.onToggleLock(layer.id)}
                    className={`flex h-8 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface hover:text-ink ${
                      layer.locked ? 'text-ink-2' : 'text-ink-3 opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
                    }`}
                  >
                    {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                  </button>
                </Tooltip>
                <Tooltip
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  description="Hidden layers stay in your design, but you can't see them and they are left out when you download."
                >
                  <button
                    type="button"
                    aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                    aria-pressed={!layer.visible}
                    onClick={() => props.onToggleVisibility(layer.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface hover:text-ink ${
                      layer.visible ? 'text-ink-3' : 'text-ink'
                    }`}
                  >
                    {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </Tooltip>
              </li>
            )
          })}
          <li className={`flex items-center gap-1 rounded-[10px] pr-1 transition-colors ${pagePicked ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
            <Tooltip
              title="Page"
              description="The paper under everything. Click it, then choose its color in the Color panel. Clicking an empty spot of your design picks it too."
              side="right"
              className="flex min-w-0 flex-1"
            >
              <button
                type="button"
                aria-label="Page"
                aria-pressed={pagePicked}
                onClick={props.onPickPage}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1.5 pl-2 text-left text-[13px] text-ink"
              >
                <span aria-hidden className="h-10 w-10 shrink-0 rounded-md border border-line" style={{ background: doc.background ?? SEE_THROUGH }} />
                <span className="min-w-0 flex-1 truncate">Page</span>
              </button>
            </Tooltip>
            <Tooltip
              title={doc.background === null ? 'Give the page a color' : 'See-through page'}
              description={
                doc.background === null
                  ? 'The page is see-through now: a PNG download keeps it see-through. Click to make it white again.'
                  : 'Take away the page color, so a PNG download is see-through around your things, like for a logo or a sticker.'
              }
            >
              <button
                type="button"
                aria-label="See-through page"
                aria-pressed={doc.background === null}
                onClick={() => props.onSeeThrough(doc.background !== null)}
                className={`flex h-8 w-7 items-center justify-center rounded-lg transition-colors ${
                  doc.background === null ? 'text-accent' : 'text-ink-3 hover:bg-surface hover:text-ink'
                }`}
              >
                <Grid2x2 size={14} />
              </button>
            </Tooltip>
          </li>
        </ul>
      )}

      <div className="shrink-0 border-t border-line px-3 pb-2 pt-3">
        {active && (
          <Slider
            className="mb-2 px-1"
            label="Layer opacity"
            help="How solid the selected layer is. Lower it to let the layers below show through."
            value={active.opacity}
            display={`${Math.round(active.opacity * 100)}%`}
            note={describeLayerOpacity(active.opacity)}
            onChange={(position) => props.onOpacity(active.id, Math.round(position * 100) / 100)}
          />
        )}
        <div className="flex items-center justify-between">
          <IconButton
            tip={{ title: 'Duplicate layer', description: 'Make an exact copy of the selected layer, placed right above it.' }}
            disabledReason={noLayer}
            onClick={props.onDuplicate}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton
            tip={{ title: 'Bring forward', description: 'Move the selected layer one step toward the front, so it covers the layer above it.' }}
            disabledReason={noLayer ?? (doc && activeIndex === doc.layers.length - 1 ? 'This layer is already at the front.' : undefined)}
            onClick={() => props.onMove(1)}
          >
            <ArrowUp size={16} />
          </IconButton>
          <IconButton
            tip={{ title: 'Send backward', description: 'Move the selected layer one step toward the back, behind the layer below it.' }}
            disabledReason={noLayer ?? (activeIndex === 0 ? 'This layer is already at the back.' : undefined)}
            onClick={() => props.onMove(-1)}
          >
            <ArrowDown size={16} />
          </IconButton>
          <IconButton
            tip={{ title: 'Delete layer', description: 'Remove the selected layer and everything on it. You can undo this.' }}
            disabledReason={noLayer}
            onClick={props.onDelete}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>
    </section>
  )
}
