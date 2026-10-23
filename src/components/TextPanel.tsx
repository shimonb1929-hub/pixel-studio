import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown, CircleHelp, Columns2, Italic, List, ListOrdered, Plus, Search, WrapText, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Gradient } from '../editor/gradient.ts'
import type { TextStyle } from '../editor/types.ts'
import type { FontCategory, FontInfo } from '../text/fontCatalog.ts'
import { allFonts, fontInfo, fontName, fontStack, isOwnFont, loadFont, nearestWeight, ownFonts } from '../text/fonts.ts'
import { addOwnFont, FontFileError, removeOwnFont } from '../text/ownFonts.ts'
import { useFontsVersion } from '../hooks/useFontsVersion.ts'
import { FONT_PURPOSES, type FontPurpose } from '../text/fontPurposes.ts'
import type { ListKind, TextAlign, TextDirection } from '../text/layout.ts'
import { FillKindSwitch, GradientEditor } from './GradientEditor.tsx'
import { PhotoControls, type ShapePhotoControls } from './ShapePanel.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Slider } from './ui.tsx'
import { live, msg, t } from '../i18n/i18n.ts'

const MIN_SIZE = 4
const MAX_SIZE = 2000
const sizeToPosition = (size: number) => Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE)
const positionToSize = (position: number) => Math.round(MIN_SIZE * (MAX_SIZE / MIN_SIZE) ** position)

const MIN_SPACING = -0.1
const MAX_SPACING = 0.5
const MIN_LINE = 0.7
const MAX_LINE = 3

const WEIGHT_NAMES: Record<number, string> = live({
  100: msg('Thin'),
  200: msg('Extra light'),
  300: msg('Light'),
  400: msg('Regular'),
  500: msg('Medium'),
  600: msg('Semi bold'),
  700: msg('Bold'),
  800: msg('Extra bold'),
  900: msg('Black'),
  1000: msg('Extra black'),
})

type FontLetters = 'any' | 'hebrew' | 'yiddish'
type FontFor = 'all' | FontPurpose

const LETTERS: { value: FontLetters; label: string; description: string }[] = live([
  { value: 'any', label: msg('Any'), description: msg('Fonts for every language.') },
  { value: 'hebrew', label: msg('Hebrew'), description: msg('Fonts with Hebrew letters.') },
  { value: 'yiddish', label: msg('Yiddish'), description: msg('Fonts with all the Yiddish letters (װ ױ ײ) and vowel points.') },
])

const KINDS: { value: FontCategory; label: string; description: string }[] = live([
  { value: 'sans', label: msg('Clean'), description: msg('Simple, modern letters without little feet (sans serif).') },
  { value: 'serif', label: msg('Classic'), description: msg('Letters with little feet, like in books and newspapers (serif).') },
  { value: 'display', label: msg('Bold & fun'), description: msg('Eye-catching letters for headlines and posters.') },
  { value: 'handwriting', label: msg('Handwritten'), description: msg('Letters that look written by hand.') },
  { value: 'mono', label: msg('Typewriter'), description: msg('Every letter the same width, like code or a typewriter.') },
])

function hasLetters(font: FontInfo, letters: FontLetters): boolean {
  if (letters === 'hebrew') return font.hebrew
  if (letters === 'yiddish') return font.yiddish
  return true
}

// Words that find a font: its name, its kind and what it's good for, in English and in the
// language the app is shown in, so "wedding", "kids" or "Torah" find fonts too.
function searchWords(font: FontInfo): string {
  const kind = KINDS.find((k) => k.value === font.category)
  const parts = [font.name, kind?.label ?? '', kind?.description ?? '', font.category]
  for (const purpose of FONT_PURPOSES) {
    if (purpose.fonts.includes(font.id)) parts.push(purpose.label, purpose.description, purpose.value)
  }
  if (font.hebrew) parts.push('hebrew', t('Hebrew'))
  if (font.yiddish) parts.push('yiddish', t('Yiddish'))
  return parts.join(' ').toLowerCase()
}

// The fonts picked lately on this computer, newest first.
const RECENT_KEY = 'pixel-studio-recent-fonts'
const RECENT_COUNT = 6

function readRecent(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && !!fontInfo(id)).slice(0, RECENT_COUNT) : []
  } catch {
    return []
  }
}

function saveRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((other) => other !== id)].slice(0, RECENT_COUNT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Without storage the list is just not kept.
  }
  return next
}

// One font in the list, shown in its own letters once it has loaded: your own words when there
// are some, so you see what they will look like before you pick. Pointing at it shows it on the
// page too.
function FontOption({
  font,
  sample,
  selected,
  onPick,
  onPreview,
  observe,
}: {
  font: FontInfo
  sample: string
  selected: boolean
  onPick: () => void
  onPreview: () => void
  observe: (el: Element | null, id: string) => void
}) {
  const own = isOwnFont(font.id)
  return (
    <div
      ref={(el) => observe(el, font.id)}
      role="option"
      aria-selected={selected}
      aria-label={font.name}
      tabIndex={0}
      onClick={onPick}
      onPointerEnter={onPreview}
      onFocus={onPreview}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPick()
        }
      }}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
        selected ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-subtle'
      }`}
    >
      {sample ? (
        <span className="flex min-w-0 flex-col">
          <span dir="auto" className="truncate text-[17px] leading-tight" style={{ fontFamily: fontStack(font.id), fontWeight: nearestWeight(font.id, 400) }}>
            {sample}
          </span>
          <span className={`truncate text-[11px] ${selected ? 'text-accent' : 'text-ink-2'}`}>{font.name}</span>
        </span>
      ) : (
        <span className="min-w-0 truncate text-[17px] leading-tight" style={{ fontFamily: fontStack(font.id), fontWeight: nearestWeight(font.id, 400) }}>
          {font.name}
          {font.hebrew && <span className="ms-2 text-ink-2">אבג</span>}
        </span>
      )}
      {font.yiddish && <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-2">{t('Yiddish')}</span>}
      {own && (
        <Tooltip title={t('Remove from your fonts')} description={t('Takes this font off your list. Designs that already use it keep it.')}>
          <button
            type="button"
            aria-label={t('Remove {font} from your fonts', { font: font.name })}
            onClick={(event) => {
              event.stopPropagation()
              void removeOwnFont(font.id)
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface hover:text-ink"
          >
            <X size={13} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

function Chip({ label, description, checked, onClick }: { label: string; description: string; checked: boolean; onClick: () => void }) {
  return (
    <Tooltip title={label} description={description}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onClick}
        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          checked ? 'bg-accent text-white' : 'bg-subtle text-ink-2 hover:text-ink'
        }`}
      >
        {label}
      </button>
    </Tooltip>
  )
}

function FontPicker({
  value,
  sample,
  hasRtl,
  onPick,
  onPreview,
}: {
  value: string
  sample: string
  hasRtl: boolean
  onPick: (id: string) => void
  onPreview: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [letters, setLetters] = useState<FontLetters>('any')
  const [purpose, setPurpose] = useState<FontFor>('all')
  const [recent, setRecent] = useState<string[]>([])
  // A font file being added, and what went wrong with the last one.
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // The list changes when fonts of your own come or go.
  const fontsVersion = useFontsVersion()
  const listRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sampleRef = useRef(sample)
  useEffect(() => {
    sampleRef.current = sample
  }, [sample])
  const previewRef = useRef(onPreview)
  useEffect(() => {
    previewRef.current = onPreview
  }, [onPreview])

  // Fonts load only when they scroll into sight in the list.
  useEffect(() => {
    if (!open) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = (entry.target as HTMLElement).dataset.font
          const font = id && fontInfo(id)
          if (font) void loadFont({ font: font.id, weight: nearestWeight(font.id, 400), italic: false, size: 17 }, `${font.name}${font.hebrew ? 'אבג' : ''}${sampleRef.current}`)
          observer.unobserve(entry.target)
        }
      },
      { root: listRef.current, rootMargin: t('120px') },
    )
    observerRef.current = observer
    return () => observer.disconnect()
  }, [open])

  // A new search or choice starts at the top of the list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [query, letters, purpose])

  // The font in use is in sight when the list opens.
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const chosen = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (list && chosen) list.scrollTop = Math.max(0, chosen.offsetTop - list.offsetTop - list.clientHeight / 2 + chosen.offsetHeight / 2)
  }, [open])

  // Nothing stays shown on the page once the list closes.
  useEffect(() => {
    if (!open) previewRef.current(null)
  }, [open])

  const observe = (el: Element | null, id: string) => {
    if (!el) return
    ;(el as HTMLElement).dataset.font = id
    observerRef.current?.observe(el)
  }

  const pick = (id: string) => {
    onPreview(null)
    onPick(id)
    setRecent(saveRecent(id))
    setOpen(false)
  }

  // A search looks through every font; otherwise the list shows what the buttons above ask for,
  // in groups by kind (or in the order of the purpose's own list).
  const sections = useMemo((): { title: string; fonts: FontInfo[] }[] => {
    const words = query.trim().toLowerCase()
    if (words) {
      const found = allFonts().filter((font) => searchWords(font).includes(words))
      // Fonts that can write the text come first.
      if (hasRtl) found.sort((a, b) => Number(b.hebrew) - Number(a.hebrew))
      return [{ title: '', fonts: found }]
    }
    if (purpose !== 'all') {
      const info = FONT_PURPOSES.find((p) => p.value === purpose)
      const fonts = (info?.fonts ?? []).flatMap((id) => {
        const font = fontInfo(id)
        return font && hasLetters(font, letters) ? [font] : []
      })
      return [{ title: '', fonts }]
    }
    return [
      { title: t('Your fonts'), fonts: ownFonts().filter((font) => hasLetters(font, letters)) },
      ...KINDS.map((kind) => ({
        title: kind.label,
        fonts: allFonts().filter((font) => !isOwnFont(font.id) && font.category === kind.value && hasLetters(font, letters)),
      })),
    ].filter((section) => section.fonts.length > 0)
    // fontsVersion: fonts of your own came or went.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, letters, purpose, hasRtl, fontsVersion])

  // Adds a font file from the computer and uses it right away.
  const addFile = async (file: File | undefined) => {
    if (!file) return
    setAdding(true)
    setProblem('')
    try {
      const font = await addOwnFont(file)
      if (letters !== 'any' && !hasLetters(font, letters)) setLetters('any')
      setPurpose('all')
      setQuery('')
      pick(font.id)
    } catch (error) {
      setProblem(error instanceof FontFileError ? error.message : t('This font couldn’t be added. Try another file.'))
    } finally {
      setAdding(false)
    }
  }

  const count = sections.reduce((sum, section) => sum + section.fonts.length, 0)

  // Up and down arrows move through the list.
  const onListKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const at = options.indexOf(document.activeElement as HTMLElement)
    const next = options[Math.min(options.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Tooltip title={t("Font")} description={t("The style of the letters. Fonts marked with Hebrew letters (אבג) can write Hebrew; Yiddish ones have every Yiddish letter too.")}>
        <button
          type="button"
          aria-label={t('Font: {font}', { font: fontName(value) })}
          aria-expanded={open}
          onClick={() => {
            if (!open) {
              setLetters(hasRtl ? 'hebrew' : 'any')
              setRecent(readRecent())
            }
            setOpen(!open)
          }}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-start text-[16px] text-ink transition-colors hover:border-ink-3"
        >
          <span className="min-w-0 truncate" style={{ fontFamily: fontStack(value) }}>
            {fontName(value)}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </Tooltip>
      {open && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-line p-2">
          <label className="flex h-8 items-center gap-2 rounded-lg bg-subtle px-2 text-ink-2">
            <Search size={14} aria-hidden />
            <input
              aria-label={t("Find a font")}
              placeholder={t("Find a font, or try “wedding”")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          {!query.trim() && (
            <>
              <div role="radiogroup" aria-label={t("Letters")} className="flex gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
                {LETTERS.map((l) => (
                  <Tooltip key={l.value} title={l.label} description={l.description} className="flex flex-1">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={letters === l.value}
                      onClick={() => setLetters(l.value)}
                      className={`flex h-7 flex-1 items-center justify-center rounded-lg px-1.5 text-[11px] font-medium transition-colors ${
                        letters === l.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {l.label}
                    </button>
                  </Tooltip>
                ))}
              </div>
              <div role="radiogroup" aria-label={t("What it’s for")} className="flex flex-wrap gap-1">
                <Chip label={t('All')} description={t('Every font, in groups by kind.')} checked={purpose === 'all'} onClick={() => setPurpose('all')} />
                {FONT_PURPOSES.map((p) => (
                  <Chip key={p.value} label={p.label} description={p.description} checked={purpose === p.value} onClick={() => setPurpose(p.value)} />
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <Tooltip
                  title={t('Add your own font')}
                  description={t('Use a font file from your computer (.ttf, .otf, .woff or .woff2). It stays in your list for next time, and goes inside your designs and SVG downloads so they look right on any computer. Use only fonts you are allowed to use.')}
                  className="flex self-start"
                >
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => fileRef.current?.click()}
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-60"
                  >
                    <Plus size={14} aria-hidden />
                    {adding ? t('Adding your font…') : t('Add your own font')}
                  </button>
                </Tooltip>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                  aria-label={t('Font file')}
                  className="hidden"
                  onChange={(event) => {
                    void addFile(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                {problem && (
                  <p role="alert" className="rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-2">
                    {problem}
                  </p>
                )}
              </div>
              {recent.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="me-0.5 text-[11px] text-ink-2">{t('Used lately:')}</span>
                  {recent.map((id) => (
                    <Tooltip key={id} title={fontName(id)} description={t('A font you picked lately. Click to use it again.')}>
                      <button
                        type="button"
                        aria-label={t('Use {font} again', { font: fontName(id) })}
                        onClick={() => pick(id)}
                        onPointerEnter={() => onPreview(id)}
                        onPointerLeave={() => onPreview(null)}
                        className="max-w-28 truncate rounded-md border border-line px-1.5 py-0.5 text-[12px] text-ink hover:bg-subtle"
                        style={{ fontFamily: fontStack(id) }}
                      >
                        {fontName(id)}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}
            </>
          )}
          <div
            ref={listRef}
            role="listbox"
            aria-label={t("Fonts")}
            onKeyDown={onListKey}
            onPointerLeave={() => onPreview(null)}
            className="flex max-h-80 flex-col gap-0.5 overflow-y-auto"
          >
            {count === 0 ? (
              <p className="px-2 py-3 text-[12px] text-ink-2">{t('No font found. Try another word, or clear the search.')}</p>
            ) : (
              sections.map((section) => (
                <div key={section.title} role="group" aria-label={section.title || undefined} className="flex flex-col gap-0.5">
                  {section.title && (
                    <div className="sticky top-0 z-10 bg-surface px-2 pb-1 pt-2 text-[11px] font-semibold text-ink-2">
                      {section.title} <span className="font-normal text-ink-3">{section.fonts.length}</span>
                    </div>
                  )}
                  {section.fonts.map((font) => (
                    <FontOption
                      key={font.id}
                      font={font}
                      sample={sample}
                      selected={font.id === value}
                      observe={observe}
                      onPreview={() => onPreview(font.id)}
                      onPick={() => pick(font.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
          <p className="px-1 text-[11px] text-ink-3">{t('Point at a font to see it on your page. Click to keep it.')}</p>
        </div>
      )}
    </div>
  )
}

function ChoiceRow<T extends string>({
  label,
  value,
  choices,
  onChange,
  keepTyping,
}: {
  label: string
  // Clicking leaves the cursor in the text being typed, so typing just goes on.
  keepTyping?: boolean
  value: T
  // Each choice shows its icon, its `shows` words, or else its name.
  choices: { value: T; label: string; icon?: LucideIcon; shows?: string; description: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
      {choices.map((choice) => (
        <Tooltip key={choice.value} title={choice.label} description={choice.description} className="flex flex-1">
          <button
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            aria-label={choice.label}
            onClick={() => onChange(choice.value)}
            onMouseDown={keepTyping ? (event) => event.preventDefault() : undefined}
            className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-medium transition-colors ${
              value === choice.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {choice.icon ? <choice.icon size={15} strokeWidth={1.9} /> : (choice.shows ?? choice.label)}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

const ALIGNS: { value: Exclude<TextAlign, 'auto'>; label: string; icon: LucideIcon; description: string }[] = live([
  { value: 'left', label: msg('Line up left'), icon: AlignLeft, description: msg('Every line starts at the left edge.') },
  { value: 'center', label: msg('Center'), icon: AlignCenter, description: msg('Every line is centered.') },
  { value: 'right', label: msg('Line up right'), icon: AlignRight, description: msg('Every line ends at the right edge. Hebrew and Yiddish do this by themselves.') },
  { value: 'justify', label: msg('Even edges'), icon: AlignJustify, description: msg('Lines stretch to reach both edges, like in a newspaper. Works in a box that wraps its lines.') },
])

const DIRECTIONS: { value: TextDirection; label: string; description: string }[] = live([
  { value: 'auto', label: msg('Auto'), description: msg('Each paragraph reads the way its first letter does: Hebrew and Yiddish right to left, English left to right.') },
  { value: 'rtl', label: msg('Right to left'), description: msg('For Hebrew and Yiddish, even when a line starts with an English word or a number.') },
  { value: 'ltr', label: msg('Left to right'), description: msg('For English, even when a line starts with a Hebrew word.') },
])

type ListChoice = 'none' | ListKind

// Letters show the alphabet the text is written in: א ב ג for Hebrew and Yiddish, a b c for English.
function listChoices(rtl: boolean): { value: ListChoice; label: string; icon?: LucideIcon; shows?: string; description: string }[] {
  return [
    { value: 'none', label: t('No list'), shows: t('None'), description: t('Plain paragraphs, with nothing before them.') },
    { value: 'bullet', label: t('Dots'), icon: List, description: t('A dot before each paragraph. Press Enter to start the next point.') },
    { value: 'number', label: t('Numbers'), icon: ListOrdered, description: t('1, 2, 3 before each paragraph. They count by themselves when you add or take away a point.') },
    {
      value: 'letter',
      label: t('Letters'),
      shows: rtl ? 'א ב ג' : 'a b c',
      description: t('Letters before each paragraph: א, ב, ג for Hebrew and Yiddish, a, b, c for English.'),
    },
  ]
}

export interface TextPanelProps {
  // "New text" while choosing how the next text looks, or the text's name.
  title: string
  style: TextStyle
  wrap: boolean
  // The text has Hebrew or Yiddish letters.
  hasRtl: boolean
  // The first words of the picked text, shown in each font of the list ('' for new text).
  sample: string
  // How the lines actually line up, when no alignment was chosen.
  resolvedAlign: 'left' | 'center' | 'right'
  onFont: (id: string) => void
  // Shows a font on the page while it is pointed at in the list (null: show the text as it is).
  onPreviewFont: (id: string | null) => void
  onStyle: (patch: Partial<TextStyle>, label: string, mergeKey?: string) => void
  onWrap: (wrap: boolean) => void
  // Letters in one color or a gradient; the Color panel colors the gradient's chosen stop.
  onFillKind: (kind: 'color' | 'gradient') => void
  // Puts a photo inside the letters. Only for one text on the design.
  onChoosePhoto?: () => void
  // Set when there's a photo inside the letters.
  photo?: ShapePhotoControls | null
  onGradient: (gradient: Gradient, label: string, mergeKey?: string) => void
  gradientStop: number
  onGradientStop: (index: number) => void
  // While typing: whether the font, boldness, slant and color change just the picked words or all
  // of the text. Null when not typing.
  scope?: 'words' | 'all' | null
  // Where the text sits when it runs on from box to box: this box's place and how many there are.
  flow?: { box: number; boxes: number } | null
  // Adds a box for the text to continue in. Missing while typing or with several things picked.
  onContinue?: () => void
}

// How text looks: font, size, boldness, lining up, which way it reads and spacing.
export function TextPanel(props: TextPanelProps) {
  const { style } = props
  // The spacing sliders (and reading direction, for text without Hebrew) wait under "More", so
  // the panel shows only what most text needs.
  const [more, setMore] = useState(false)
  const font = fontInfo(style.font)
  const weights = font?.weights ?? [style.weight]
  const weightIndex = Math.max(0, weights.indexOf(nearestWeight(style.font, style.weight)))
  const alignShown = style.align === 'justify' ? 'justify' : style.align === 'auto' ? props.resolvedAlign : style.align

  return (
    <section aria-label={t("Text")} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip title={t("Text")} description={t("How the text looks. Changes show right away; the Color panel below colors the letters.")}>
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            <span dir="auto" className="truncate">
              {props.title}
            </span>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-3">
        {props.scope && (
          <p role="note" aria-live="polite" className={`rounded-lg px-2.5 py-2 text-[12px] leading-snug ${props.scope === 'words' ? 'bg-accent-soft text-accent' : 'bg-subtle text-ink-2'}`}>
            {props.scope === 'words'
              ? t('Font, boldness, slant and color now change only the words you picked.')
              : t('Changes go to all the text. To change just some words, pick them with the mouse first.')}
          </p>
        )}
        <FontPicker value={style.font} sample={props.sample} hasRtl={props.hasRtl} onPick={props.onFont} onPreview={props.onPreviewFont} />
        {props.hasRtl && font && !font.hebrew && (
          <p role="note" className="rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-2">
            {t('{font} has no Hebrew letters, so they show in a matching Hebrew font. Pick a font marked אבג to choose their look.', { font: font.name })}
          </p>
        )}

        <FillKindSwitch
          label={t('Letter color')}
          kind={props.photo ? 'photo' : style.gradient ? 'gradient' : 'color'}
          colorHelp={t('All the letters in one color. Choose it in the Color panel below.')}
          gradientHelp={t('Colors that fade smoothly across all the letters. Drag the round dots on the text to turn it.')}
          onChange={props.onFillKind}
          photo={props.onChoosePhoto || props.photo ? { help: t('A photo of yours shows through the letters. You can also drop a picture file right onto the text.'), onChoose: props.photo ? () => {} : (props.onChoosePhoto ?? (() => {})) } : undefined}
        />
        {props.photo && <PhotoControls photo={props.photo} inside="text" />}
        {style.gradient && !props.photo && (
          <GradientEditor gradient={style.gradient} stop={Math.min(props.gradientStop, style.gradient.stops.length - 1)} onStop={props.onGradientStop} onChange={props.onGradient} />
        )}

        <div className="flex items-end gap-2">
          <Slider
            className="flex-1"
            label={t("Size")}
            help={t("How big the letters are, in pixels. You can also pull a corner of the text on your design.")}
            value={sizeToPosition(style.size)}
            display={`${Math.round(style.size)} px`}
            onChange={(position) => props.onStyle({ size: positionToSize(position) }, t('Text size'), 'text-size')}
          />
          <input
            type="number"
            aria-label={t("Text size in pixels")}
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={Math.round(style.size)}
            onChange={(event) => {
              const size = Number(event.target.value)
              if (size >= 1 && size <= 10000) props.onStyle({ size }, t('Text size'), 'text-size')
            }}
            className="h-8 w-16 rounded-lg border border-line bg-white px-2 text-end text-[13px] tabular-nums text-ink outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-end gap-2">
          {weights.length > 1 ? (
            <Slider
              className="flex-1"
              label={t("Boldness")}
              help={t("How thick the letters are, from thin to heavy.")}
              value={weights.length > 1 ? weightIndex / (weights.length - 1) : 0}
              step={1 / Math.max(1, weights.length - 1)}
              display={WEIGHT_NAMES[weights[weightIndex]] ?? String(weights[weightIndex])}
              onChange={(position) => props.onStyle({ weight: weights[Math.round(position * (weights.length - 1))] }, t('Boldness'), 'text-weight')}
            />
          ) : (
            <p className="flex-1 text-[12px] text-ink-2">{t('This font comes in one boldness.')}</p>
          )}
          <Tooltip title={t("Italic")} description={t("Slanted letters, for a word that should stand out a little.")}>
            <button
              type="button"
              aria-label={t("Italic")}
              aria-pressed={style.italic}
              onClick={() => props.onStyle({ italic: !style.italic }, style.italic ? t('Not italic') : t('Italic'))}
              className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
                style.italic ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <Italic size={16} />
            </button>
          </Tooltip>
        </div>

        <ChoiceRow label={t("Line up")} value={alignShown} choices={ALIGNS} onChange={(align) => props.onStyle({ align }, t('Line up text'))} />
        <ChoiceRow
          keepTyping
          label={t('List')}
          value={style.list ?? 'none'}
          choices={listChoices(props.hasRtl)}
          onChange={(list) => props.onStyle({ list: list === 'none' ? null : list }, list === 'none' ? t('No list') : t('Make a list'))}
        />
        {props.hasRtl && <ChoiceRow label={t("Reading direction")} value={style.direction} choices={DIRECTIONS} onChange={(direction) => props.onStyle({ direction, align: style.align === 'left' || style.align === 'right' ? 'auto' : style.align }, t('Reading direction'))} />}

        {props.flow ? (
          <p role="note" className="rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-2">
            {t('Box {box} of {boxes}. The text runs on from one box to the next: what doesn’t fit here continues in the next box.', { box: props.flow.box, boxes: props.flow.boxes })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {!props.flow && (
          <Tooltip
            title={t("Wrap in a box")}
            description={t("On: lines wrap at the box's width; drag the box's side handles to change it. Off: the box fits the text, and lines break only where you press Enter.")}
            className="flex"
          >
            <button
              type="button"
              aria-label={t("Wrap in a box")}
              aria-pressed={props.wrap}
              onClick={() => props.onWrap(!props.wrap)}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
                props.wrap ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'
              }`}
            >
              <WrapText size={15} />
              {t('Wrap in a box')}
            </button>
          </Tooltip>
          )}
          {props.onContinue && (
            <Tooltip
              title={t('Continue in another box')}
              description={t('Adds an empty box next to this one. Words that don’t fit here run on into it, like a story in a newspaper that goes on in the next column. Move and size each box as you like.')}
              className="flex"
            >
              <button
                type="button"
                aria-label={t('Continue in another box')}
                onClick={props.onContinue}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
              >
                <Columns2 size={15} />
                {t('Continue in another box')}
              </button>
            </Tooltip>
          )}
        </div>

        <Tooltip title={t('More')} description={t('Shows the spacing between letters and lines, and the reading direction.')} className="flex self-start">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore(!more)}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
          >
            <ChevronDown size={15} className={`transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden />
            {t('More')}
          </button>
        </Tooltip>
        {more && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            {!props.hasRtl && <ChoiceRow label={t("Reading direction")} value={style.direction} choices={DIRECTIONS} onChange={(direction) => props.onStyle({ direction, align: style.align === 'left' || style.align === 'right' ? 'auto' : style.align }, t('Reading direction'))} />}
            <Slider
              label={t("Letter spacing")}
              help={t("Space between the letters. Headlines in capitals often look best a little wider.")}
              value={(style.letterSpacing - MIN_SPACING) / (MAX_SPACING - MIN_SPACING)}
              origin={-MIN_SPACING / (MAX_SPACING - MIN_SPACING)}
              display={`${style.letterSpacing > 0 ? '+' : ''}${Math.round(style.letterSpacing * 100)}%`}
              onChange={(position) =>
                props.onStyle({ letterSpacing: Math.round((MIN_SPACING + position * (MAX_SPACING - MIN_SPACING)) * 100) / 100 }, t('Letter spacing'), 'text-spacing')
              }
            />
            <Slider
              label={t("Line spacing")}
              help={t("Space between lines, as a multiple of the size.")}
              value={(style.lineHeight - MIN_LINE) / (MAX_LINE - MIN_LINE)}
              display={`${style.lineHeight.toFixed(2)}×`}
              onChange={(position) => props.onStyle({ lineHeight: Math.round((MIN_LINE + position * (MAX_LINE - MIN_LINE)) * 20) / 20 }, t('Line spacing'), 'text-lines')}
            />
          </div>
        )}
      </div>
    </section>
  )
}
