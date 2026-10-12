import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleHelp, Copy, Eye, EyeOff, Grid2x2, Lock, LockOpen, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { adjustmentName, isNeutral } from '../editor/adjust.ts'
import { drawLayer } from '../editor/compose.ts'
import { activeLayer } from '../editor/layers.ts'
import type { EditorDocument, Layer, LayerGroup } from '../editor/types.ts'
import { Tooltip, type TipContent } from './Tooltip.tsx'
import { Slider } from './ui.tsx'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'
import { t } from '../i18n/i18n.ts'

const THUMB_SIZE = 40

// A tiny picture of the design's frame with these layers in it, where they sit.
function LayerThumbnail({ layers, revision, doc }: { layers: Layer[]; revision: number; doc: EditorDocument }) {
  // Text is drawn again once its font arrives.
  const fonts = useFontsVersion()
  const { width: docWidth, height: docHeight } = doc
  const ref = useRef<HTMLCanvasElement>(null)
  // What was drawn last, so it's drawn again only when the layers, their pixels or the size change.
  const drawnRef = useRef<{ layers: Layer[]; revision: number; fonts: number; width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const thumb = ref.current
    const ctx = thumb?.getContext('2d')
    if (!thumb || !ctx) return
    const last = drawnRef.current
    if (
      last &&
      last.revision === revision &&
      last.fonts === fonts &&
      last.width === docWidth &&
      last.height === docHeight &&
      last.layers.length === layers.length &&
      last.layers.every((l, i) => l === layers[i])
    ) {
      return
    }
    drawnRef.current = { layers, revision, fonts, width: docWidth, height: docHeight }
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
    // Bottom first, like on the design.
    for (const layer of [...layers].reverse()) drawLayer(ctx, doc, layer, { blend: false })
    ctx.restore()
  })

  return <canvas ref={ref} aria-hidden className="shrink-0 rounded-md border border-line bg-subtle" style={{ width: THUMB_SIZE, height: THUMB_SIZE }} />
}

function RenameInput({ name, onRename, onDone }: { name: string; onRename: (name: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(name)
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
    const next = draft.trim()
    if (save && next && next !== name) onRename(next)
    onDone()
  }

  return (
    <input
      ref={inputRef}
      aria-label={t("Layer name")}
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
  if (opacity >= 0.99) return t('Solid. The whole layer shows fully.')
  if (opacity > 0.01) return t('Partly see-through. The layers below show through it.')
  return t('Invisible. The layer is still there; slide up to see it again.')
}

interface LayersPanelProps {
  doc: EditorDocument | null
  revision: number
  // Several things picked together, or null.
  picked: string[] | null
  onSelect: (layerId: string) => void
  // Shift+click: adds a layer (with everything kept together with it) to what's picked, or takes it away.
  onToggle: (layerId: string) => void
  // Things kept together: picking them all, hiding them all, and naming them.
  onPickGroup: (groupId: string) => void
  onToggleGroupVisibility: (groupId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
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

type Row = { kind: 'layer'; layer: Layer; inGroup: boolean } | { kind: 'group'; group: LayerGroup; members: Layer[] }

export function LayersPanel(props: LayersPanelProps) {
  const { doc, revision, picked } = props
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // Things kept together show as one row; these are opened to show their parts.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const active = doc ? activeLayer(doc) : undefined
  const noDesign = doc ? undefined : t('Start a new design or open a picture first.')
  const noLayer = noDesign ?? (active ? undefined : t('Pick a layer first. The page itself always stays at the back.'))
  const pagePicked = !!doc && !active
  // What the buttons below work on.
  const targets = picked ?? (active ? [active.id] : [])
  const atFront = !!doc && targets.length > 0 && doc.layers.slice(-targets.length).every((l) => targets.includes(l.id))
  const atBack = !!doc && targets.length > 0 && doc.layers.slice(0, targets.length).every((l) => targets.includes(l.id))
  const several = targets.length > 1

  const isPicked = (layer: Layer) => (picked ? picked.includes(layer.id) : layer.id === doc?.activeLayerId)
  // A group is open when opened, or when one of its parts is picked on its own.
  const isOpen = (groupId: string) => openGroups.has(groupId) || (!picked && active?.group?.id === groupId)
  const toggleOpen = (groupId: string) =>
    setOpenGroups((open) => {
      const next = new Set(open)
      if (!next.delete(groupId)) next.add(groupId)
      return next
    })

  const rows: Row[] = []
  if (doc) {
    const fromTop = [...doc.layers].reverse()
    fromTop.forEach((layer, i) => {
      const group = layer.group
      if (group && fromTop[i - 1]?.group?.id !== group.id) rows.push({ kind: 'group', group, members: fromTop.filter((l) => l.group?.id === group.id) })
      if (!group || isOpen(group.id)) rows.push({ kind: 'layer', layer, inGroup: !!group })
    })
  }

  return (
    <section aria-label={t("Layers")} className="flex min-h-fit flex-1 flex-col rounded-card border border-line bg-surface shadow-card">
      <div className="flex h-12 shrink-0 items-center justify-between ps-4 pe-2">
        <Tooltip
          title={t("Layers")}
          description={t("Everything on your design, from front (top of the list) to back. Each photo, shape, text and drawing is its own layer. The page is always at the bottom. Hold Shift and click to pick several.")}
        >
          <h2 className="flex cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            {t('Layers')}
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <IconButton
          tip={{ title: t('New layer'), description: t('Add an empty drawing above the selected layer. Painting makes one by itself when it needs to, so you rarely need this.') }}
          disabledReason={noDesign}
          onClick={props.onAdd}
        >
          <Plus size={17} />
        </IconButton>
      </div>

      {!doc ? (
        <p className="px-4 text-[13px] leading-relaxed text-ink-3">{t("Your design's layers will show up here.")}</p>
      ) : (
        <ul aria-label={t("Layer list")} className="min-h-[156px] flex-1 overflow-y-auto px-2">
          {rows.map((row) => {
            if (row.kind === 'group') {
              const { group, members } = row
              const selected = members.every(isPicked)
              const open = isOpen(group.id)
              const visible = members.some((l) => l.visible)
              return (
                <li key={`group:${group.id}`} className={`group flex items-center gap-0.5 rounded-[10px] pe-1 transition-colors ${selected ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
                  <button
                    type="button"
                    aria-label={open ? t('Hide the parts of {name}', { name: group.name }) : t('Show the parts of {name}', { name: group.name })}
                    aria-expanded={open}
                    onClick={() => toggleOpen(group.id)}
                    className="flex h-8 w-5 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink"
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {renamingId === group.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
                      <LayerThumbnail layers={members} revision={revision} doc={doc} />
                      <RenameInput name={group.name} onRename={(name) => props.onRenameGroup(group.id, name)} onDone={() => setRenamingId(null)} />
                    </div>
                  ) : (
                    <Tooltip
                      title={t('{name} (kept together)', { name: group.name })}
                      description={t('{count} parts that are picked and moved as one. Click to pick them; open the arrow to see the parts. Double-click the name to rename it.', { count: members.length })}
                      side="right"
                      className="flex min-w-0 flex-1"
                    >
                      <button
                        type="button"
                        aria-label={t('Kept together: {name}', { name: group.name })}
                        aria-pressed={selected}
                        onClick={(event) => (event.shiftKey ? props.onToggle(members[0].id) : props.onPickGroup(group.id))}
                        onDoubleClick={() => setRenamingId(group.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1.5 text-start text-[13px] text-ink"
                      >
                        <LayerThumbnail layers={members} revision={revision} doc={doc} />
                        <span dir="auto" className="min-w-0 flex-1 truncate text-start font-medium">
                          {group.name}
                        </span>
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip title={visible ? t('Hide') : t('Show')} description={t("Hide or show all of its parts. Hidden things stay in your design, but are left out when you download.")}>
                    <button
                      type="button"
                      aria-label={visible ? t('Hide {name}', { name: group.name }) : t('Show {name}', { name: group.name })}
                      aria-pressed={!visible}
                      onClick={() => props.onToggleGroupVisibility(group.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface hover:text-ink ${visible ? 'text-ink-3' : 'text-ink'}`}
                    >
                      {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </Tooltip>
                </li>
              )
            }
            const { layer, inGroup } = row
            const selected = isPicked(layer)
            return (
              <li
                key={layer.id}
                className={`group flex items-center gap-1 rounded-[10px] pe-1 transition-colors ${inGroup ? 'ms-5' : ''} ${selected ? 'bg-accent-soft' : 'hover:bg-subtle'}`}
              >
                {renamingId === layer.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 ps-2">
                    <LayerThumbnail layers={[layer]} revision={revision} doc={doc} />
                    <RenameInput name={layer.name} onRename={(name) => props.onRename(layer.id, name)} onDone={() => setRenamingId(null)} />
                  </div>
                ) : (
                  <Tooltip
                    title={selected ? t('{name} (selected)', { name: layer.name }) : layer.name}
                    description={
                      selected
                        ? t('Painting and layer buttons work on this layer. Double-click the name to rename it. Hold Shift and click to pick several.')
                        : t('Click to paint on this layer. Double-click the name to rename it. Hold Shift and click to pick several.')
                    }
                    side="right"
                    className="flex min-w-0 flex-1"
                  >
                    <button
                      type="button"
                      aria-label={t('Layer: {name}', { name: layer.name })}
                      aria-pressed={selected}
                      onClick={(event) => (event.shiftKey ? props.onToggle(layer.id) : props.onSelect(layer.id))}
                      onDoubleClick={() => setRenamingId(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1.5 ps-2 text-start text-[13px] text-ink"
                    >
                      <LayerThumbnail layers={[layer]} revision={revision} doc={doc} />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                        {layer.name}
                      </span>
                    </button>
                  </Tooltip>
                )}
                {layer.adjust && !isNeutral(layer.adjust) && (
                  <Tooltip
                    title={t('Adjusted: {what}', { what: adjustmentName(layer.adjust) })}
                    description={t("This layer's colors are adjusted, and you can still change that. Click to open Adjust.")}
                  >
                    <button
                      type="button"
                      aria-label={t('Change adjustments of {name}', { name: layer.name })}
                      onClick={() => props.onEditAdjust(layer.id)}
                      className="flex h-8 w-7 items-center justify-center rounded-lg text-accent transition-colors hover:bg-surface"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip
                  title={layer.locked ? t('Unlock layer') : t('Lock layer')}
                  description={
                    layer.locked
                      ? t("Locked, so it can't be picked or moved on the design by accident. You can still paint on it. Click to unlock it.")
                      : t("Lock it, so it can't be picked or moved on the design by accident. Handy for backgrounds.")
                  }
                >
                  <button
                    type="button"
                    aria-label={layer.locked ? t('Unlock {name}', { name: layer.name }) : t('Lock {name}', { name: layer.name })}
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
                  title={layer.visible ? t('Hide layer') : t('Show layer')}
                  description={t("Hidden layers stay in your design, but you can't see them and they are left out when you download.")}
                >
                  <button
                    type="button"
                    aria-label={layer.visible ? t('Hide {name}', { name: layer.name }) : t('Show {name}', { name: layer.name })}
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
          <li className={`flex items-center gap-1 rounded-[10px] pe-1 transition-colors ${pagePicked ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
            <Tooltip
              title={t("Page")}
              description={t("The paper under everything. Click it, then choose its color in the Color panel. Clicking an empty spot of your design picks it too.")}
              side="right"
              className="flex min-w-0 flex-1"
            >
              <button
                type="button"
                aria-label={t("Page")}
                aria-pressed={pagePicked}
                onClick={props.onPickPage}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1.5 ps-2 text-start text-[13px] text-ink"
              >
                <span aria-hidden className="h-10 w-10 shrink-0 rounded-md border border-line" style={{ background: doc.background ?? SEE_THROUGH }} />
                <span className="min-w-0 flex-1 truncate">{t('Page')}</span>
              </button>
            </Tooltip>
            <Tooltip
              title={doc.background === null ? t('Give the page a color') : t('See-through page')}
              description={
                doc.background === null
                  ? t('The page is see-through now: a PNG download keeps it see-through. Click to make it white again.')
                  : t('Take away the page color, so a PNG download is see-through around your things, like for a logo or a sticker.')
              }
            >
              <button
                type="button"
                aria-label={t("See-through page")}
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
            label={t("Layer opacity")}
            help={t("How solid the selected layer is. Lower it to let the layers below show through.")}
            value={active.opacity}
            display={`${Math.round(active.opacity * 100)}%`}
            note={describeLayerOpacity(active.opacity)}
            onChange={(position) => props.onOpacity(active.id, Math.round(position * 100) / 100)}
          />
        )}
        <div className="flex items-center justify-between">
          <IconButton
            tip={{ title: several ? t('Duplicate') : t('Duplicate layer'), description: several ? t('Make exact copies of the picked things, placed right above them.') : t('Make an exact copy of the selected layer, placed right above it.') }}
            disabledReason={noLayer}
            onClick={props.onDuplicate}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton
            tip={{ title: t('Bring forward'), description: several ? t('Move the picked things one step toward the front.') : t('Move the selected layer one step toward the front, so it covers the layer above it.') }}
            disabledReason={noLayer ?? (atFront ? (several ? t('They are already at the front.') : t('This layer is already at the front.')) : undefined)}
            onClick={() => props.onMove(1)}
          >
            <ArrowUp size={16} />
          </IconButton>
          <IconButton
            tip={{ title: t('Send backward'), description: several ? t('Move the picked things one step toward the back.') : t('Move the selected layer one step toward the back, behind the layer below it.') }}
            disabledReason={noLayer ?? (atBack ? (several ? t('They are already at the back.') : t('This layer is already at the back.')) : undefined)}
            onClick={() => props.onMove(-1)}
          >
            <ArrowDown size={16} />
          </IconButton>
          <IconButton
            tip={{ title: several ? t('Delete') : t('Delete layer'), description: several ? t('Remove the picked things. You can undo this.') : t('Remove the selected layer and everything on it. You can undo this.') }}
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
