import { X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { drawLayer } from '../editor/compose.ts'
import { paintPage } from '../editor/gradient.ts'
import type { EditorDocument } from '../editor/types.ts'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'
import { LAYOUT_COLORS, LAYOUT_KINDS, LAYOUTS, buildLayout, layoutColors, loadLayoutFonts, type LayoutInfo, type LayoutKind } from '../layouts/layouts.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'
import { t, useLanguage } from '../i18n/i18n.ts'

// Draws a design small, from its own shapes and words: never a picture.
export function DesignPreview({ doc, maxWidth, maxHeight, label }: { doc: EditorDocument; maxWidth: number; maxHeight: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(maxWidth / doc.width, maxHeight / doc.height)
  const width = Math.round(doc.width * scale)
  const height = Math.round(doc.height * scale)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(canvas.width / doc.width, canvas.height / doc.height)
    paintPage(ctx, doc, doc.width, doc.height)
    for (const layer of doc.layers) {
      if (!layer.visible) continue
      ctx.globalAlpha = layer.opacity
      drawLayer(ctx, doc, layer)
    }
    ctx.globalAlpha = 1
  }, [doc, width, height])

  return <canvas ref={ref} role="img" data-preview aria-label={label} className="rounded-md shadow-card" style={{ width, height }} />
}

type KindChoice = 'all' | LayoutKind

interface LayoutsDialogProps {
  // Which kind to show first.
  kind?: KindChoice
  // The layout picked first.
  layoutId?: string
  onUse: (layout: LayoutInfo, colors: string) => void
  onClose: () => void
}

// Ready-made layouts to start from: pick one, try its colors, then start with it. Everything in a
// layout is a shape or a text, so all of it can be changed afterwards.
export function LayoutsDialog({ kind: startKind = 'all', layoutId, onUse, onClose }: LayoutsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdropRef = useRef(false)
  const titleId = useId()
  const [kind, setKind] = useState<KindChoice>(startKind)
  const [picked, setPicked] = useState<LayoutInfo>(() => LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS.find((l) => startKind === 'all' || l.kind === startKind) ?? LAYOUTS[0])
  // Colors chosen for every layout, or null for each layout's own.
  const [colors, setColors] = useState<string | null>(null)
  const fonts = useFontsVersion()
  const language = useLanguage()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    for (const layout of LAYOUTS) void loadLayoutFonts(layout)
  }, [])

  const shown = LAYOUTS.filter((l) => kind === 'all' || l.kind === kind)
  // Each preview is the layout itself, drawn again whenever a font arrives.
  const previews = useMemo(
    () => new Map(LAYOUTS.map((layout) => [layout.id, buildLayout(layout, colors ?? layout.colors)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, fonts, language],
  )
  const pickedColors = colors ?? picked.colors

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => (pressedBackdropRef.current = event.target === event.currentTarget)}
      onClick={(event) => {
        if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
      }}
      className="m-auto max-h-[calc(100vh-2rem)] w-[min(62rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgb(16_24_40/0.32)] backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {t('Ready layouts')}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-2">{t('Made of shapes, words and colors, so you can change every part. Pick one and try its colors.')}</p>
          </div>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={onClose}
            className="-me-2 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div role="tablist" aria-label={t('Kind of layout')} className="flex gap-1 px-6 pb-3">
          {[{ value: 'all' as const, label: t('All'), description: t('Every ready layout.') }, ...LAYOUT_KINDS].map((choice) => (
            <Tooltip key={choice.value} title={choice.label} description={choice.description}>
              <button
                type="button"
                role="tab"
                aria-selected={kind === choice.value}
                onClick={() => setKind(choice.value)}
                className={`h-8 rounded-lg px-3 text-[13px] font-medium transition-colors ${kind === choice.value ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
              >
                {choice.label}
              </button>
            </Tooltip>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 md:flex-row">
          <div role="listbox" aria-label={t('Layouts')} className="grid flex-1 grid-cols-2 content-start gap-3 sm:grid-cols-3">
            {shown.map((layout) => (
              <Tooltip key={layout.id} title={layout.name} description={layout.use} className="flex">
                <button
                  type="button"
                  role="option"
                  aria-selected={layout.id === picked.id}
                  aria-label={layout.name}
                  onClick={() => setPicked(layout)}
                  onDoubleClick={() => onUse(layout, colors ?? layout.colors)}
                  className={`flex w-full flex-col items-center gap-2 rounded-card border p-3 transition ${
                    layout.id === picked.id ? 'border-accent bg-accent-soft/60 ring-2 ring-accent/25' : 'border-line bg-surface hover:border-accent/35 hover:shadow-card'
                  }`}
                >
                  <div className="flex h-[150px] items-center justify-center">
                    <DesignPreview doc={previews.get(layout.id)!} maxWidth={140} maxHeight={150} label={t('Preview of {name}', { name: layout.name })} />
                  </div>
                  <span className="text-[13px] font-medium text-ink">{layout.name}</span>
                </button>
              </Tooltip>
            ))}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-3 md:w-[300px]">
            <div className="flex h-[340px] items-center justify-center">
              <DesignPreview doc={previews.get(picked.id)!} maxWidth={280} maxHeight={340} label={t('Larger preview of {name}', { name: picked.name })} />
            </div>
            <div className="w-full text-center">
              <p className="text-[14px] font-semibold text-ink">{picked.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-2">{picked.use}</p>
            </div>
            <div role="radiogroup" aria-label={t('Colors')} className="flex flex-wrap justify-center gap-1.5">
              {LAYOUT_COLORS.map((set) => (
                <Tooltip key={set.id} title={set.name} description={t('Try these colors on the layouts. You can change any color later too.')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pickedColors === set.id}
                    aria-label={set.name}
                    onClick={() => setColors(set.id)}
                    className={`flex h-8 w-9 overflow-hidden rounded-lg border transition ${pickedColors === set.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:scale-105'}`}
                  >
                    {[set.page, set.main, set.accent].map((color, i) => (
                      <span key={i} className="h-full flex-1" style={{ background: color }} />
                    ))}
                  </button>
                </Tooltip>
              ))}
            </div>
            <p className="text-center text-[12px] text-ink-3">{t('Colors: {name}', { name: layoutColors(pickedColors).name })}</p>
            <Button
              variant="primary"
              className="h-10 w-full px-5"
              onClick={() => onUse(picked, pickedColors)}
              tip={{ title: t('Use this layout'), description: t('Starts a new design with this layout. Click any word to change it, and drag anything to move it.') }}
            >
              {t('Use this layout')}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
