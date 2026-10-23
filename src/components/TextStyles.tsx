import { Check, Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { SavedTextStyle } from '../editor/types.ts'
import { fontStack } from '../text/fonts.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

export interface TextStylesProps {
  styles: SavedTextStyle[]
  // The style the text uses, if any, and whether it was changed since.
  current: string | null
  differs: boolean
  // "picked" changes the picked text; "new" sets how the next new text looks.
  target: 'picked' | 'new'
  onApply: (id: string) => void
  onSave: () => void
  onUpdate: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}

// The design's text styles, like "Title" and "Details": one click gives a text that look, and
// changing a style changes every text that uses it.
export function TextStyles({ styles, current, differs, target, onApply, onSave, onUpdate, onRename, onRemove }: TextStylesProps) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const used = styles.find((s) => s.id === current)

  function finishRename() {
    if (renaming && renaming.name.trim()) onRename(renaming.id, renaming.name.trim())
    setRenaming(null)
  }

  return (
    <div role="group" aria-label={t('Text styles')} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Tooltip
          title={t('Text styles')}
          description={t('Looks you keep for this design, like one for titles and one for details. Click one to give the text that look. Change a style, and every text that uses it changes too, on every page.')}
        >
          <p className="cursor-help text-[12px] font-medium text-ink-2">{t('Text styles')}</p>
        </Tooltip>
        <Tooltip
          title={t('Save as a style')}
          description={target === 'picked' ? t('Keeps how this text looks as a style, so other texts can look the same with one click.') : t('Keeps how new text will look as a style, so texts can look the same with one click.')}
        >
          <button
            type="button"
            aria-label={t('Save as a style')}
            onClick={onSave}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            <Plus size={12} />
            {t('Save as a style')}
          </button>
        </Tooltip>
      </div>
      {styles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {styles.map((saved) =>
            renaming?.id === saved.id ? (
              <input
                key={saved.id}
                aria-label={t('Style name')}
                autoFocus
                value={renaming.name}
                maxLength={60}
                onChange={(event) => setRenaming({ id: saved.id, name: event.target.value })}
                onBlur={finishRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') finishRename()
                  if (event.key === 'Escape') setRenaming(null)
                  event.stopPropagation()
                }}
                className="h-8 w-28 rounded-lg border border-accent bg-surface px-2 text-[13px] text-ink outline-none ring-4 ring-accent/15"
              />
            ) : (
              <Tooltip
                key={saved.id}
                title={saved.name}
                description={target === 'picked' ? t('Click to give the picked text this look.') : t('Click to make new text look like this.')}
              >
                <button
                  type="button"
                  aria-pressed={saved.id === current}
                  onClick={() => onApply(saved.id)}
                  className={`h-8 max-w-[9rem] truncate rounded-lg border px-2.5 text-[13px] text-ink transition-colors ${
                    saved.id === current ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-subtle'
                  }`}
                  style={{ fontFamily: fontStack(saved.style.font), fontWeight: saved.style.weight, fontStyle: saved.style.italic ? 'italic' : 'normal' }}
                >
                  <span dir="auto">{saved.name}</span>
                </button>
              </Tooltip>
            ),
          )}
        </div>
      )}
      {used && differs && (
        <div role="note" className="rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-2">
          <p>{t('This text looks a little different from “{name}” now.', { name: used.name })}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Tooltip title={t('Update the style')} description={t('Make “{name}” look like this text. Every text that uses it changes too, on every page.', { name: used.name })}>
              <button type="button" onClick={onUpdate} className="flex h-7 items-center gap-1 rounded-md bg-surface px-2 font-medium text-accent shadow-sm hover:bg-accent-soft">
                <Check size={13} />
                {t('Update the style')}
              </button>
            </Tooltip>
            <Tooltip title={t('Back to the style')} description={t('Give this text the look of “{name}” again.', { name: used.name })}>
              <button type="button" onClick={() => onApply(used.id)} className="flex h-7 items-center rounded-md px-2 font-medium text-ink-2 hover:bg-surface hover:text-ink">
                {t('Back to the style')}
              </button>
            </Tooltip>
          </div>
        </div>
      )}
      {used && !renaming && (
        <div className="flex gap-1">
          <Tooltip title={t('Rename style')} description={t('Give “{name}” another name.', { name: used.name })}>
            <button
              type="button"
              aria-label={t('Rename style')}
              onClick={() => setRenaming({ id: used.id, name: used.name })}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-subtle hover:text-ink"
            >
              <Pencil size={12} />
              {t('Rename')}
            </button>
          </Tooltip>
          <Tooltip title={t('Remove style')} description={t('Takes “{name}” out of the styles. Texts that use it keep how they look.', { name: used.name })}>
            <button
              type="button"
              aria-label={t('Remove style')}
              onClick={() => onRemove(used.id)}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-subtle hover:text-ink"
            >
              <X size={12} />
              {t('Remove')}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
