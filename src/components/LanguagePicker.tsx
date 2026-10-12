import { Check, Languages } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { languageInfo, LANGUAGES, setLanguage, t, type Language, useLanguage } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'

// Picks the language of the whole app. Each language is named in its own words, so anyone can
// find theirs even when the app is in a language they don't read.
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const current = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(id: Language) {
    setOpen(false)
    void setLanguage(id)
  }

  return (
    <div ref={rootRef} className="relative">
      <Tooltip title={t('Language')} description={t('Choose the language of Pixel Studio: its buttons, menus and help.')}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${t('Language')}: ${languageInfo(current).name}`}
          onClick={() => setOpen(!open)}
          className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
            open ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:bg-surface hover:text-ink'
          }`}
        >
          <Languages size={16} />
          <span className={compact ? 'hidden xl:inline' : ''}>{languageInfo(current).name}</span>
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          aria-label={t('Language')}
          className="absolute end-0 top-full z-40 mt-2 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-float"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="menuitemradio"
              aria-checked={l.id === current}
              lang={l.id}
              dir={l.rtl ? 'rtl' : 'ltr'}
              onClick={() => choose(l.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink hover:bg-subtle"
            >
              <span>{l.name}</span>
              {l.id === current && <Check size={15} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
