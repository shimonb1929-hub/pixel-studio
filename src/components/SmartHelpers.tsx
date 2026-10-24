import { Eye, Palette } from 'lucide-react'
import { useEffect } from 'react'
import type { PaletteColor } from '../editor/palette.ts'
import type { Readability, ReadableFix } from '../editor/readable.ts'
import { fixDescription, fixName, type SmartPreview } from '../hooks/useSmartDesign.ts'
import { isTypingTarget } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

// The design helpers on screen: the colors of the photos in the Color panel, a quiet note in the
// Text panel when words are hard to read, and the bar that shows a preview with Apply and Cancel.

const SWATCH = 'h-6 w-6 rounded-lg border border-[rgb(16_24_40/0.1)]'

// "Colors from your photos": click one to use it, or give the whole design these colors.
export function PhotoColors({ colors, fromPicked, current, onPick, onMatch }: { colors: PaletteColor[]; fromPicked: boolean; current: string; onPick: (hex: string) => void; onMatch: () => void }) {
  if (colors.length === 0) return null
  return (
    <div className="mt-3" data-testid="photo-colors">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Tooltip
          title={fromPicked ? t('Colors from this photo') : t('Colors from your photos')}
          description={t('The main colors of your photos, found by themselves (pro: color theme). Click one to use it.')}
        >
          <p className="cursor-help text-[11px] font-medium text-ink-3">{fromPicked ? t('Colors from this photo') : t('Colors from your photos')}</p>
        </Tooltip>
        <Tooltip
          title={t('Match design to photo')}
          description={t('Give the shapes and words on the page the main colors of your photos, with words kept easy to read (pro: recolor to color theme). You see it first; press Apply to keep it.')}
        >
          <button type="button" onClick={onMatch} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-soft">
            <Palette size={12} aria-hidden />
            {t('Match design')}
          </button>
        </Tooltip>
      </div>
      <div className="grid grid-cols-9 gap-1.5">
        {colors.map((c) => (
          <Tooltip key={c.hex} title={t('Photo color')} description={t('Click to use this color from your photo ({code}).', { code: c.hex.toUpperCase() })}>
            <button
              type="button"
              aria-label={t('Photo color {code}', { code: c.hex.toUpperCase() })}
              aria-pressed={c.hex === current}
              onClick={() => onPick(c.hex)}
              className={`${SWATCH} transition-transform hover:scale-110 ${c.hex === current ? 'ring-2 ring-accent ring-offset-1' : ''}`}
              style={{ background: c.hex }}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// A quiet note when the picked words are hard to read where they are, with fixes. Pointing at a
// fix shows it on the design; a click keeps it.
export function ReadableNote({ check, fixes, onFix, onHover }: { check: Readability; fixes: ReadableFix[]; onFix: (fix: ReadableFix) => void; onHover: (fix: ReadableFix | null) => void }) {
  return (
    <div role="note" aria-label={t('Hard to read here')} className="rounded-lg bg-subtle px-2.5 py-2">
      <Tooltip
        title={t('Hard to read here')}
        description={t('The words don’t stand out enough from what is behind them (pro: contrast {ratio} to 1; {needed} or more reads easily).', {
          ratio: check.ratio.toFixed(1),
          needed: check.needed.toFixed(1),
        })}
      >
        <p className="flex cursor-help items-center gap-1.5 text-[12px] font-medium text-ink">
          <Eye size={13} className="shrink-0 text-ink-3" aria-hidden />
          {t('Hard to read here')}
        </p>
      </Tooltip>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{t('Point at a fix to see it, click to keep it.')}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" onPointerLeave={() => onHover(null)}>
        {fixes.map((fix) => (
          <Tooltip key={`${fix.kind}-${fix.kind === 'shadow' ? '' : fix.color}`} title={fixName(fix)} description={fixDescription(fix)}>
            <button
              type="button"
              onClick={() => onFix(fix)}
              onPointerEnter={() => onHover(fix)}
              onFocus={() => onHover(fix)}
              onBlur={() => onHover(null)}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-[12px] font-medium text-ink shadow-sm transition-colors hover:bg-subtle"
            >
              {fix.kind !== 'shadow' && <span className="h-3.5 w-3.5 shrink-0 rounded border border-[rgb(16_24_40/0.15)]" style={{ background: fix.color }} aria-hidden />}
              {fixName(fix)}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// Over the design while a helper's result is shown: what will change, Apply (Enter) and Cancel (Esc).
export function SmartPreviewBar({ preview, onApply, onCancel }: { preview: SmartPreview; onApply: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.key !== 'Escape' && event.key !== 'Enter') return
      // Before the app's own keys, so Esc doesn't also let go of what is picked.
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Enter') onApply()
      else onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onApply, onCancel])

  return (
    <div
      role="dialog"
      aria-label={preview.title}
      className="absolute inset-x-3 top-3 z-30 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface/95 px-3.5 py-2 shadow-card backdrop-blur"
    >
      <div className="min-w-0 max-w-[460px]">
        <p className="text-[13px] font-semibold text-ink">{preview.title}</p>
        <p className="text-xs leading-[18px] text-ink-2">{preview.description}</p>
      </div>
      {preview.colors && (
        <div className="flex gap-1" aria-hidden>
          {preview.colors.map((hex) => (
            <span key={hex} className="h-4 w-4 rounded-md border border-[rgb(16_24_40/0.12)]" style={{ background: hex }} />
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Button variant="ghost" className="h-8 shrink-0 px-3 text-[13px]" onClick={onCancel} tip={{ title: t('Cancel'), shortcut: 'Esc', description: t('Put it back the way it was.') }}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" className="h-8 shrink-0 px-3.5 text-[13px]" onClick={onApply} tip={{ title: t('Apply'), shortcut: 'Enter', description: t('Keep this change. You can undo it.') }}>
          {t('Apply')}
        </Button>
      </div>
    </div>
  )
}
