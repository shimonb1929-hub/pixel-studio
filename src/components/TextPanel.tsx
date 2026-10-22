import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown, CircleHelp, Italic, Search, WrapText, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TextStyle } from '../editor/types.ts'
import type { FontCategory, FontInfo } from '../text/fontCatalog.ts'
import { allFonts, fontInfo, fontName, fontStack, loadFont, nearestWeight } from '../text/fonts.ts'
import type { TextAlign, TextDirection } from '../text/layout.ts'
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

type FontFilter = 'all' | 'hebrew' | 'yiddish' | FontCategory

const FILTERS: { value: FontFilter; label: string; description: string }[] = live([
  { value: 'all', label: msg('All'), description: msg('Every font.') },
  { value: 'hebrew', label: msg('Hebrew'), description: msg('Fonts with Hebrew letters.') },
  { value: 'yiddish', label: msg('Yiddish'), description: msg('Fonts with all the Yiddish letters (װ ױ ײ) and vowel points.') },
  { value: 'sans', label: msg('Clean'), description: msg('Simple, modern letters without little feet (sans serif).') },
  { value: 'serif', label: msg('Classic'), description: msg('Letters with little feet, like in books and newspapers (serif).') },
  { value: 'display', label: msg('Bold & fun'), description: msg('Eye-catching letters for headlines and posters.') },
  { value: 'handwriting', label: msg('Handwritten'), description: msg('Letters that look written by hand.') },
  { value: 'mono', label: msg('Typewriter'), description: msg('Every letter the same width, like code or a typewriter.') },
])

function matchesFilter(font: FontInfo, filter: FontFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'hebrew') return font.hebrew
  if (filter === 'yiddish') return font.yiddish
  return font.category === filter
}

// One font in the list, shown in its own letters once it has loaded: your own words when there
// are some, so you see what they will look like before you pick.
function FontOption({ font, sample, selected, onPick, observe }: { font: FontInfo; sample: string; selected: boolean; onPick: () => void; observe: (el: Element | null, id: string) => void }) {
  return (
    <div
      ref={(el) => observe(el, font.id)}
      role="option"
      aria-selected={selected}
      aria-label={font.name}
      tabIndex={0}
      onClick={onPick}
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
    </div>
  )
}

function FontPicker({ value, sample, hasRtl, onPick }: { value: string; sample: string; hasRtl: boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FontFilter>('all')
  const listRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sampleRef = useRef(sample)
  useEffect(() => {
    sampleRef.current = sample
  }, [sample])

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

  const observe = (el: Element | null, id: string) => {
    if (!el) return
    ;(el as HTMLElement).dataset.font = id
    observerRef.current?.observe(el)
  }

  const fonts = useMemo(() => {
    const words = query.trim().toLowerCase()
    return allFonts().filter((font) => matchesFilter(font, filter) && (!words || font.name.toLowerCase().includes(words)))
  }, [query, filter])

  return (
    <div className="flex flex-col gap-2">
      <Tooltip title={t("Font")} description={t("The style of the letters. Fonts marked with Hebrew letters (אבג) can write Hebrew; Yiddish ones have every Yiddish letter too.")}>
        <button
          type="button"
          aria-label={t('Font: {font}', { font: fontName(value) })}
          aria-expanded={open}
          onClick={() => {
            if (!open) setFilter(hasRtl ? 'hebrew' : 'all')
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
        <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
          <label className="flex h-8 items-center gap-2 rounded-lg bg-subtle px-2 text-ink-2">
            <Search size={14} aria-hidden />
            <input
              aria-label={t("Find a font")}
              placeholder={t("Find a font")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <div role="radiogroup" aria-label={t("Kind of font")} className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Tooltip key={f.value} title={f.label} description={f.description}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filter === f.value ? 'bg-accent text-white' : 'bg-subtle text-ink-2 hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <div ref={listRef} role="listbox" aria-label={t("Fonts")} className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {fonts.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-ink-2">{t('No font by that name. Try another word, or pick All.')}</p>
            ) : (
              fonts.map((font) => (
                <FontOption
                  key={font.id}
                  font={font}
                  sample={sample}
                  selected={font.id === value}
                  observe={observe}
                  onPick={() => {
                    onPick(font.id)
                    setOpen(false)
                  }}
                />
              ))
            )}
          </div>
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
}: {
  label: string
  value: T
  choices: { value: T; label: string; icon?: LucideIcon; description: string }[]
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
            className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-medium transition-colors ${
              value === choice.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {choice.icon ? <choice.icon size={15} strokeWidth={1.9} /> : choice.label}
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
  onStyle: (patch: Partial<TextStyle>, label: string, mergeKey?: string) => void
  onWrap: (wrap: boolean) => void
}

// How text looks: font, size, boldness, lining up, which way it reads and spacing.
export function TextPanel(props: TextPanelProps) {
  const { style } = props
  const font = fontInfo(style.font)
  const weights = font?.weights ?? [style.weight]
  const weightIndex = Math.max(0, weights.indexOf(nearestWeight(style.font, style.weight)))
  const alignShown = style.align === 'justify' ? 'justify' : style.align === 'auto' ? props.resolvedAlign : style.align

  return (
    <section aria-label={t("Text")} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip title={t("Text")} description={t("How the text looks. Changes show right away; the Color panel above colors the letters.")}>
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            <span dir="auto" className="truncate">
              {props.title}
            </span>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-3">
        <FontPicker value={style.font} sample={props.sample} hasRtl={props.hasRtl} onPick={props.onFont} />
        {props.hasRtl && font && !font.hebrew && (
          <p role="note" className="rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-2">
            {font.name} has no Hebrew letters, so they show in a matching Hebrew font. Pick a font marked אבג to choose their look.
          </p>
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
        <ChoiceRow label={t("Reading direction")} value={style.direction} choices={DIRECTIONS} onChange={(direction) => props.onStyle({ direction, align: style.align === 'left' || style.align === 'right' ? 'auto' : style.align }, t('Reading direction'))} />

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
      </div>
    </section>
  )
}
