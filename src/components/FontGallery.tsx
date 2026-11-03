import { Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { FontCategory, FontInfo } from '../text/fontCatalog.ts'
import { FONT_PURPOSES } from '../text/fontPurposes.ts'
import { allFonts, fontInfo, fontStack, loadFont, nearestWeight } from '../text/fonts.ts'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'
import { hasLetters, KINDS, LETTERS, searchWords, type FontFor, type FontLetters } from './fontChoices.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'

// Words shown in every font until you type your own: Hebrew and English, so you see both.
const HEBREW_WORDS = 'שלום עולם · Hello 123'
const LATIN_WORDS = 'Hello world 123'

const MIN_SIZE = 20
const MAX_SIZE = 96

// A big window that shows every font at once, each one writing your own words, side by side
// in a grid, so you can compare them at a glance and click the one you like.
export function FontGallery({
  value,
  sample,
  hasRtl,
  onPick,
  onClose,
}: {
  value: string
  sample: string
  hasRtl: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pressedBackdropRef = useRef(false)
  const titleId = useId()
  const fontsVersion = useFontsVersion()
  const [query, setQuery] = useState('')
  const [letters, setLetters] = useState<FontLetters>(hasRtl ? 'hebrew' : 'any')
  const [kind, setKind] = useState<'all' | FontCategory>('all')
  const [purpose, setPurpose] = useState<FontFor>('all')
  const [words, setWords] = useState(() => sample.trim().slice(0, 80) || (hasRtl ? HEBREW_WORDS : LATIN_WORDS))
  const [size, setSize] = useState(40)
  const shown = words.trim() || HEBREW_WORDS
  const wordsRef = useRef(shown)
  useEffect(() => {
    wordsRef.current = shown
  }, [shown])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  const fonts = useMemo((): FontInfo[] => {
    const search = query.trim().toLowerCase()
    const purposeFonts = purpose === 'all' ? null : new Set(FONT_PURPOSES.find((p) => p.value === purpose)?.fonts ?? [])
    const found = allFonts().filter(
      (font) =>
        hasLetters(font, letters) &&
        (kind === 'all' || font.category === kind) &&
        (!purposeFonts || purposeFonts.has(font.id)) &&
        (!search || searchWords(font).includes(search)),
    )
    return found
    // fontsVersion: fonts of your own came or went.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, letters, kind, purpose, fontsVersion])

  // Fonts load only when they come into sight, so opening the window stays quick.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const font = fontInfo((entry.target as HTMLElement).dataset.font ?? '')
          if (font) void loadFont({ font: font.id, weight: nearestWeight(font.id, 400), italic: false, size: 40 }, `${font.name}${wordsRef.current}`)
          observer.unobserve(entry.target)
        }
      },
      { root: grid, rootMargin: '300px' },
    )
    for (const card of grid.querySelectorAll('[data-font]')) observer.observe(card)
    return () => observer.disconnect()
  }, [fonts, shown])

  // A new choice starts at the top.
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0
  }, [query, letters, kind, purpose])

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
  }

  const chip = (checked: boolean) =>
    `rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${checked ? 'bg-accent text-white' : 'bg-subtle text-ink-2 hover:text-ink'}`

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => (pressedBackdropRef.current = event.target === event.currentTarget)}
      onClick={handleBackdropClick}
      className="m-auto h-[min(54rem,calc(100vh-2rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgb(16_24_40/0.32)] backdrop:backdrop-blur-[2px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-col gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold tracking-tight">
                {t('All fonts')}
              </h2>
              <p className="text-[13px] text-ink-2">{t('Every font writes your words, so you can compare them. Click one to use it.')}</p>
            </div>
            <button
              type="button"
              aria-label={t('Close')}
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-subtle hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-48 flex-[2] flex-col gap-1 text-[11px] font-medium text-ink-2">
              {t('Your words')}
              <input
                data-autofocus
                dir="auto"
                value={words}
                maxLength={80}
                onChange={(event) => setWords(event.target.value)}
                className="h-9 rounded-lg border border-line bg-white px-2.5 text-[15px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-[11px] font-medium text-ink-2">
              {t('Find a font')}
              <span className="flex h-9 items-center gap-2 rounded-lg bg-subtle px-2.5">
                <Search size={14} aria-hidden />
                <input
                  value={query}
                  placeholder={t('Find a font, or try “wedding”')}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                />
              </span>
            </label>
            <Tooltip title={t('Letter size')} description={t('How big the letters are in this window. It does not change your design.')} className="flex w-40 flex-col gap-1">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-2">
                <span className="flex justify-between">
                  {t('Letter size')} <span className="tabular-nums text-ink">{size}</span>
                </span>
                <input type="range" dir="ltr" min={MIN_SIZE} max={MAX_SIZE} value={size} onChange={(event) => setSize(Number(event.target.value))} className="h-9" />
              </label>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div role="radiogroup" aria-label={t('Letters')} className="flex gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
              {LETTERS.map((l) => (
                <Tooltip key={l.value} title={l.label} description={l.description}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={letters === l.value}
                    onClick={() => setLetters(l.value)}
                    className={`h-7 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${letters === l.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {l.label}
                  </button>
                </Tooltip>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <div role="radiogroup" aria-label={t('Kind')} className="flex flex-wrap gap-1">
              <button type="button" role="radio" aria-checked={kind === 'all'} onClick={() => setKind('all')} className={chip(kind === 'all')}>
                {t('Every kind')}
              </button>
              {KINDS.map((k) => (
                <Tooltip key={k.value} title={k.label} description={k.description}>
                  <button type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(k.value)} className={chip(kind === k.value)}>
                    {k.label}
                  </button>
                </Tooltip>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <div role="radiogroup" aria-label={t('What it’s for')} className="flex flex-wrap gap-1">
              <button type="button" role="radio" aria-checked={purpose === 'all'} onClick={() => setPurpose('all')} className={chip(purpose === 'all')}>
                {t('Anything')}
              </button>
              {FONT_PURPOSES.map((p) => (
                <Tooltip key={p.value} title={p.label} description={p.description}>
                  <button type="button" role="radio" aria-checked={purpose === p.value} onClick={() => setPurpose(p.value)} className={chip(purpose === p.value)}>
                    {p.label}
                  </button>
                </Tooltip>
              ))}
            </div>
            <span className="ms-auto text-[12px] text-ink-2" aria-live="polite">
              {t('{count} fonts', { count: fonts.length })}
            </span>
          </div>
        </div>
        <div ref={gridRef} role="listbox" aria-label={t('Fonts')} className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2 overflow-y-auto p-4">
          {fonts.length === 0 ? (
            <p className="col-span-full py-6 text-center text-[13px] text-ink-2">{t('No font found. Try another word, or clear the search.')}</p>
          ) : (
            fonts.map((font) => {
              const selected = font.id === value
              const kindLabel = KINDS.find((k) => k.value === font.category)?.label
              return (
                <div
                  key={font.id}
                  data-font={font.id}
                  role="option"
                  aria-selected={selected}
                  aria-label={font.name}
                  tabIndex={0}
                  onClick={() => onPick(font.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onPick(font.id)
                    }
                  }}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                    selected ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-3 hover:bg-subtle'
                  }`}
                >
                  <span
                    dir="auto"
                    className="block leading-tight text-ink [overflow-wrap:anywhere]"
                    style={{ fontFamily: fontStack(font.id), fontWeight: nearestWeight(font.id, 400), fontSize: size }}
                  >
                    {shown}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-[11px] text-ink-2">
                    <span className={`me-1 text-[12px] font-medium ${selected ? 'text-accent' : 'text-ink'}`}>{font.name}</span>
                    {kindLabel && <span className="rounded bg-subtle px-1.5 py-0.5">{kindLabel}</span>}
                    {font.hebrew && <span className="rounded bg-subtle px-1.5 py-0.5">{t('Hebrew')}</span>}
                    {font.yiddish && <span className="rounded bg-subtle px-1.5 py-0.5">{t('Yiddish')}</span>}
                    {font.niqqud && <span className="rounded bg-subtle px-1.5 py-0.5">{t('Vowel points')}</span>}
                    {font.weights.length > 2 && <span className="rounded bg-subtle px-1.5 py-0.5">{t('{count} thicknesses', { count: font.weights.length })}</span>}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </dialog>
  )
}
