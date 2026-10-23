import { Ellipsis, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { drawLayer } from '../editor/compose.ts'
import { getContext2d } from '../editor/document.ts'
import { allPages, pageIndex } from '../editor/pages.ts'
import type { DesignPage, EditorDocument } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

const THUMB_HEIGHT = 36
const THUMB_MAX_WIDTH = 56

// A small picture of one page, drawn again a moment after it changes.
function PageThumb({ doc, page, revision }: { doc: EditorDocument; page: DesignPage; revision: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(THUMB_HEIGHT / doc.height, THUMB_MAX_WIDTH / doc.width)
  const width = Math.max(1, Math.round(doc.width * scale))
  const height = Math.max(1, Math.round(doc.height * scale))

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = getContext2d(canvas)
      ctx.fillStyle = page.background ?? '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingQuality = 'high'
      const s = canvas.width / doc.width
      ctx.setTransform(s, 0, 0, s, 0, 0)
      for (const layer of page.layers) {
        if (!layer.visible || layer.opacity <= 0) continue
        ctx.globalAlpha = layer.opacity
        drawLayer(ctx, doc, layer)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [doc, page, revision, width, height])

  return <canvas ref={ref} aria-hidden className="block rounded-[3px]" style={{ width, height }} />
}

interface PagesBarProps {
  doc: EditorDocument
  revision: number
  onGoTo: (index: number) => void
  onAdd: () => void
  onCopy: () => void
  onMove: (direction: 1 | -1) => void
  onDelete: () => void
  // Puts the picked thing on every page, or back on this page only.
  everyPage: { label: string; disabled: boolean; run: () => void }
  pageNumbers: { disabled: boolean; run: () => void }
}

// The pages of the design, in a row at the bottom. With one page it's just a button to add more.
export function PagesBar({ doc, revision, onGoTo, onAdd, onCopy, onMove, onDelete, everyPage, pageNumbers }: PagesBarProps) {
  const pages = allPages(doc)
  const current = pageIndex(doc)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const several = pages.length > 1
  const items: { label: string; run: () => void; disabled?: boolean }[] = [
    { label: t('Copy this page'), run: onCopy },
    { label: t('Move page earlier'), run: () => onMove(-1), disabled: current === 0 },
    { label: t('Move page later'), run: () => onMove(1), disabled: current === pages.length - 1 },
    { label: everyPage.label, run: everyPage.run, disabled: everyPage.disabled },
    { label: t('Add page numbers'), run: pageNumbers.run, disabled: pageNumbers.disabled },
    { label: t('Delete this page'), run: onDelete },
  ]

  return (
    <nav
      aria-label={t('Pages')}
      className="absolute bottom-3 end-3 z-10 flex max-w-[40%] items-center gap-1 rounded-xl border border-line bg-surface/95 p-1 shadow-card backdrop-blur"
    >
      {several && (
        <ol className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {pages.map((page, i) => (
            <li key={page.id} className="shrink-0">
              <Tooltip side="top" title={t('Page {number}', { number: i + 1 })} description={t('Click to work on this page. Page Up and Page Down go to the page before or after.')}>
                <button
                  type="button"
                  aria-label={t('Page {number}', { number: i + 1 })}
                  aria-current={i === current ? 'page' : undefined}
                  onClick={() => onGoTo(i)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg px-1 pb-0.5 pt-1 text-[11px] tabular-nums transition-colors ${
                    i === current ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-subtle'
                  }`}
                >
                  <span className={`rounded-[4px] ${i === current ? 'ring-2 ring-accent' : 'ring-1 ring-line'}`}>
                    <PageThumb doc={doc} page={page} revision={i === current ? revision : 0} />
                  </span>
                  {i + 1}
                </button>
              </Tooltip>
            </li>
          ))}
        </ol>
      )}
      <Tooltip
        side="top"
        title={t('Add page')}
        description={t('Add an empty page after this one, the same size, for booklets, menus and cards. A PDF download has every page.')}
      >
        <button
          type="button"
          aria-label={t('Add page')}
          onClick={onAdd}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
        >
          <Plus size={16} />
          {!several && t('Page')}
        </button>
      </Tooltip>
      {several && (
        <div ref={menuRef} className="relative shrink-0">
          <Tooltip side="top" title={t('Page options')} description={t('Copy, move or delete the page you are working on.')}>
            <button
              type="button"
              aria-label={t('Page options')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
            >
              <Ellipsis size={16} />
            </button>
          </Tooltip>
          {menuOpen && (
            <div role="menu" className="absolute bottom-10 end-0 w-56 rounded-xl border border-line bg-surface p-1 shadow-float">
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  aria-disabled={item.disabled || undefined}
                  onClick={() => {
                    if (item.disabled) return
                    setMenuOpen(false)
                    item.run()
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-start text-[13px] text-ink hover:bg-subtle aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
