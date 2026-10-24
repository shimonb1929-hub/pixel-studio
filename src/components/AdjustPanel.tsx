import { ChevronDown, CircleHelp, Palette, RotateCcw, SunMedium } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ADJUSTMENT_NAMES,
  COLOR_RANGE_HUES,
  COLOR_RANGES,
  describeAdjustment,
  hasColorChanges,
  hasCurve,
  isNeutral,
  LOOKS,
  matchingLook,
  NO_ADJUSTMENTS,
  TWO_WAY,
  type AdjustmentKey,
  type Adjustments,
  type ColorChange,
  type ColorRange,
} from '../editor/adjust.ts'
import { CurveEditor } from './CurveEditor.tsx'
import { Tooltip } from './Tooltip.tsx'
import { live, msg, t } from '../i18n/i18n.ts'
import { Button, Slider } from './ui.tsx'

// What each slider does, when to use it and how, in a sentence or two.
const HELP: Record<AdjustmentKey, string> = live({
  brightness: msg('Makes it lighter or darker. Pure black and pure white stay as they are.'),
  contrast: msg('The difference between the light and dark parts. More makes it punchy; less makes it soft and flat.'),
  highlights: msg('Changes only the bright parts. When the sky or a window is too bright, move it left to bring back their detail.'),
  shadows: msg('Changes only the dark parts. When faces or things in the shade are too dark, move it right to see them.'),
  whites: msg('How bright the very brightest parts are. Move it right to make a dull photo shine, or left if whites look harsh.'),
  blacks: msg('How deep the very darkest parts are. Move it left for rich, deep blacks, or right for a soft, faded look.'),
  saturation: msg('How strong the colors are. All the way to the left is black and white.'),
  vibrance: msg('Makes dull colors livelier but leaves colors that are already strong nearly alone. Good for a natural look.'),
  warmth: msg('To the right is warmer and more golden, like sunshine. To the left is cooler and more blue.'),
  tint: msg('Fixes a green or pink cast, for example from indoor lights. Move it right for more pink, left for more green.'),
  sharpen: msg('Makes edges and small details crisper.'),
  clarity: msg('Makes texture and detail stand out, without making edges rough. Move it left for a soft glow.'),
  blur: msg('Makes it soft and out of focus.'),
  denoise: msg('Takes away the fine colored specks a photo gets in low light or at night, and keeps edges sharp (pro: Reduce Noise). Use only as much as you need: too much makes skin and leaves look smooth, like plastic.'),
  vignette: msg('Darkens the corners and edges, which draws the eye to the middle. Move it left for light corners instead.'),
  grain: msg('Adds fine, even specks, like a photo printed from film. A little makes a picture feel real.'),
})

// The sliders always shown, and those under "More", for each group.
const GROUPS: { id: string; title: string; keys: AdjustmentKey[]; more: AdjustmentKey[] }[] = live([
  { id: 'light', title: msg('Lighting'), keys: ['brightness', 'contrast', 'highlights', 'shadows'], more: ['whites', 'blacks'] },
  { id: 'color', title: msg('Color'), keys: ['saturation', 'warmth'], more: ['vibrance', 'tint'] },
  { id: 'detail', title: msg('Detail'), keys: ['denoise', 'sharpen', 'clarity', 'blur'], more: [] },
  { id: 'finish', title: msg('Finishing touches'), keys: ['vignette', 'grain'], more: [] },
])

const COLOR_NAMES: Record<ColorRange, string> = live({
  red: msg('Red'),
  orange: msg('Orange'),
  yellow: msg('Yellow'),
  green: msg('Green'),
  aqua: msg('Aqua'),
  blue: msg('Blue'),
  purple: msg('Purple'),
  pink: msg('Pink'),
})

const NO_COLOR_CHANGE: ColorChange = { hue: 0, strength: 0, light: 0 }

const PREVIEW_WIDTH = 66
const PREVIEW_HEIGHT = 50

// A look's small picture, fitted into its tile over gray-and-white squares.
export function LookPreview({ source }: { source: HTMLCanvasElement | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = PREVIEW_WIDTH * dpr
    canvas.height = PREVIEW_HEIGHT * dpr
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!source) return
    const scale = Math.min(canvas.width / source.width, canvas.height / source.height)
    const w = source.width * scale
    const h = source.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2
    const square = 4 * dpr
    for (let row = 0; row * square < h; row++) {
      for (let col = 0; col * square < w; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#e8eaee' : '#ffffff'
        ctx.fillRect(x + col * square, y + row * square, Math.min(square, w - col * square), Math.min(square, h - row * square))
      }
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, x, y, w, h)
  }, [source])

  return <canvas ref={ref} aria-hidden className="block rounded-md" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }} />
}

function signed(value: number, twoWay = true): string {
  const amount = Math.round(value * 100)
  if (!twoWay || amount === 0) return String(amount)
  return amount > 0 ? `+${amount}` : `−${-amount}`
}

// A slider for a value from -1 to 1 (or 0 to 1), in steps of one point on the -100 to +100 scale.
function AmountSlider(props: { label: string; help: string; value: number; twoWay?: boolean; note: string; part?: string; onChange: (value: number) => void }) {
  const twoWay = props.twoWay ?? true
  const slider = (
    <Slider
      label={props.label}
      help={props.help}
      value={twoWay ? (props.value + 1) / 2 : props.value}
      origin={twoWay ? 0.5 : 0}
      step={twoWay ? 0.005 : 0.01}
      display={signed(props.value, twoWay)}
      note={props.note}
      onChange={(position) => props.onChange(Math.round((twoWay ? position * 2 - 1 : position) * 100) / 100)}
    />
  )
  return props.part ? <div data-part={props.part}>{slider}</div> : slider
}

// A "More" switch that shows a few extra controls under a group.
function More({ open, onToggle, label, help, children }: { open: boolean; onToggle: () => void; label: string; help?: string; children: ReactNode }) {
  const button = (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex items-center gap-1 rounded-md py-0.5 text-[11px] font-medium text-ink-2 hover:text-ink"
    >
      {label}
      <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  )
  return (
    <div>
      {help ? (
        <Tooltip title={label} description={help} side="bottom" className="flex">
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {open && <div className="mt-2 flex flex-col gap-2.5">{children}</div>}
    </div>
  )
}

// Change one color: pick a color family, then change its shade, strength and lightness.
function OneColor({ settings, onChange }: { settings: Adjustments; onChange: (settings: Adjustments) => void }) {
  const [range, setRange] = useState<ColorRange>(() => COLOR_RANGES.find((r) => settings.colors?.[r]) ?? 'blue')
  const change = settings.colors?.[range] ?? NO_COLOR_CHANGE
  const set = (patch: Partial<ColorChange>) => onChange({ ...settings, colors: { ...settings.colors, [range]: { ...change, ...patch } } })
  const index = COLOR_RANGES.indexOf(range)
  const toward = COLOR_NAMES[COLOR_RANGES[(index + (change.hue > 0 ? 1 : COLOR_RANGES.length - 1)) % COLOR_RANGES.length]]
  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label={t('Which color')} className="flex justify-between gap-1">
        {COLOR_RANGES.map((r) => {
          const changed = !!settings.colors?.[r] && Object.values(settings.colors[r]!).some((v) => v !== 0)
          return (
            <Tooltip key={r} title={COLOR_NAMES[r]} description={t('Change only the {color} parts of the photo.', { color: COLOR_NAMES[r] })} side="bottom">
              <button
                type="button"
                role="radio"
                aria-checked={range === r}
                aria-label={COLOR_NAMES[r]}
                onClick={() => setRange(r)}
                className={`relative h-6 w-6 rounded-full border-2 transition-transform ${range === r ? 'scale-110 border-ink' : 'border-surface hover:scale-110'}`}
                style={{ background: `hsl(${COLOR_RANGE_HUES[r]} 80% 52%)`, boxShadow: '0 0 0 1px var(--color-line)' }}
              >
                {changed && <span aria-hidden className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink" />}
              </button>
            </Tooltip>
          )
        })}
      </div>
      <AmountSlider
        label={t('Shift color')}
        help={t('Turns this color toward its neighbors, for example blue toward purple or toward aqua.')}
        value={change.hue}
        note={change.hue === 0 ? t('No change.') : t('Turns toward {color}.', { color: toward })}
        onChange={(hue) => set({ hue })}
      />
      <AmountSlider
        label={t('How colorful')}
        help={t('How strong just this color is. All the way left takes this color away and leaves the rest.')}
        value={change.strength}
        note={describeAdjustment('saturation', change.strength)}
        onChange={(strength) => set({ strength })}
      />
      <AmountSlider
        label={t('How light')}
        help={t('Makes just this color lighter or darker. In black and white, it lightens or darkens the parts that had this color.')}
        value={change.light}
        note={describeAdjustment('brightness', change.light)}
        onChange={(light) => set({ light })}
      />
    </div>
  )
}

interface AdjustPanelProps {
  settings: Adjustments
  // Small pictures of each look, in the same order as LOOKS.
  thumbnails: ThumbnailList
  // How many pixels have each tone, for the light curve.
  histogram: Uint32Array | null
  // Why nothing can be adjusted right now, if that's the case.
  blocked: string | null
  onChange: (settings: Adjustments) => void
  onAutoLight: () => void
  onAutoColor: () => void
  // "Match another photo": the photos to pick from, ready to show.
  match?: ReactNode
  // Opens a part of the panel and brings it into view, when asked for from the menu or search.
  focus?: { part: 'match' | 'denoise'; at: number } | null
}

type ThumbnailList = HTMLCanvasElement[] | null

export function AdjustPanel({ settings, thumbnails, histogram, blocked, onChange, onAutoLight, onAutoColor, match, focus }: AdjustPanelProps) {
  const current = matchingLook(settings)
  // Which "More" parts people opened or closed; untouched ones open by themselves when something
  // in them is changed.
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const hiddenChanged: Record<string, boolean> = {
    light: settings.whites !== 0 || settings.blacks !== 0,
    color: settings.vibrance !== 0 || settings.tint !== 0,
    curve: hasCurve(settings),
    oneColor: hasColorChanges(settings),
  }
  // Asking for "Match colors" from the menu opens its part, until it's closed again.
  const focusKey = focus && `focus${focus.at}`
  const isOpen = (id: string) => (id === 'match' && focus?.part === 'match' && !opened[focusKey!]) || (opened[id] ?? hiddenChanged[id] ?? false)
  const toggle = (id: string) => setOpened({ ...opened, [id]: !isOpen(id), ...(focusKey && id === 'match' ? { [focusKey]: true } : {}) })
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focus) return
    const id = requestAnimationFrame(() => {
      const part = panel.current?.querySelector<HTMLElement>(`[data-part="${focus.part}"]`)
      part?.scrollIntoView({ block: 'nearest' })
      part?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [focus])

  const slider = (key: AdjustmentKey) => (
    <AmountSlider
      key={key}
      part={key}
      label={ADJUSTMENT_NAMES[key]}
      help={HELP[key]}
      value={settings[key]}
      twoWay={TWO_WAY[key]}
      note={describeAdjustment(key, settings[key])}
      onChange={(value) => onChange({ ...settings, [key]: value })}
    />
  )

  return (
    <section ref={panel} aria-label={t("Adjust")} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <Tooltip
          title={t("Adjust")}
          description={t("Change the colors and light of the selected layer, or of the selected part. Try a ready-made look, then fine-tune it with the sliders. Nothing changes for good until you press Apply.")}
        >
          <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            {t('Adjust')}
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <Button
          variant="ghost"
          className="h-7 px-2 text-[12px]"
          disabled={isNeutral(settings)}
          onClick={() => onChange(NO_ADJUSTMENTS)}
          tip={{
            title: t('Reset'),
            description: t('Put every slider back to the middle, as it was.'),
            note: isNeutral(settings) ? t('Nothing has changed yet.') : undefined,
          }}
        >
          <RotateCcw size={13} />
          {t('Reset')}
        </Button>
      </div>

      {blocked ? (
        <p className="text-[13px] leading-snug text-ink-2">{blocked}</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            <Button
              className="h-8 w-full px-2 text-[12px]"
              onClick={onAutoLight}
              tip={{
                title: t('Fix light'),
                description: t('Looks at your photo and sets the light for you: brightness, dark parts, bright parts, whites and blacks. You see it at once, and can change any slider after.'),
              }}
            >
              <SunMedium size={14} aria-hidden />
              {t('Fix light')}
            </Button>
            <Button
              className="h-8 w-full px-2 text-[12px]"
              onClick={onAutoColor}
              tip={{
                title: t('Fix colors'),
                description: t('Takes away a yellow, blue, green or pink cast, so whites look white. It sets Warmth and Green or pink for you; change them after if you like.'),
              }}
            >
              <Palette size={14} aria-hidden />
              {t('Fix colors')}
            </Button>
          </div>
          {match && (
            <div data-part="match" className="-mt-2 mb-4">
              <More
                open={isOpen('match')}
                onToggle={() => toggle('match')}
                label={t('Match another photo')}
                help={t('Pick another photo on your design, and this one takes on its light and colors, so photos side by side look like they belong together (pro: Match Color). It sets the light curves for you; change anything after.')}
              >
                {match}
              </More>
            </div>
          )}

          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t('Looks')}</h3>
          <div role="radiogroup" aria-label={t("Looks")} className="grid grid-cols-3 gap-1.5">
            {LOOKS.map((look, i) => (
              <Tooltip key={look.id} title={look.name} description={look.description} className="flex">
                <button
                  type="button"
                  role="radio"
                  aria-checked={current?.id === look.id}
                  aria-label={look.name}
                  onClick={() => onChange(look.settings)}
                  className={`flex w-full flex-col items-center justify-start gap-1 rounded-lg p-1 pb-1.5 transition-colors ${
                    current?.id === look.id ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                  }`}
                >
                  <LookPreview source={thumbnails?.[i]} />
                  <span className="text-center text-[11px] font-medium leading-tight">{look.name}</span>
                </button>
              </Tooltip>
            ))}
          </div>

          {GROUPS.map((group) => (
            <div key={group.id} className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group.title}</h3>
              <div className="flex flex-col gap-2.5">
                {group.keys.map(slider)}
                {group.id === 'light' && (
                  <>
                    <More open={isOpen('light')} onToggle={() => toggle('light')} label={t('Whites and blacks')}>
                      {group.more.map(slider)}
                    </More>
                    <More
                      open={isOpen('curve')}
                      onToggle={() => toggle('curve')}
                      label={t('Light curve')}
                      help={t('Exact control of light. The line goes from the darkest parts (left) to the brightest (right). Drag it up to make those parts lighter, or down to make them darker. Click the line to add a point; drag a point out of the box to remove it.')}
                    >
                      <CurveEditor curves={settings.curve} histogram={histogram} onChange={(curve) => onChange({ ...settings, curve })} />
                    </More>
                  </>
                )}
                {group.id === 'color' && (
                  <>
                    <More open={isOpen('color')} onToggle={() => toggle('color')} label={t('Gentle boost and green or pink')}>
                      {group.more.map(slider)}
                    </More>
                    <More
                      open={isOpen('oneColor')}
                      onToggle={() => toggle('oneColor')}
                      label={t('Change one color')}
                      help={t('Pick a color, then change only that color in the photo: its shade, how strong it is and how light it is. For example, make the sky a deeper blue or the grass less yellow.')}
                    >
                      <OneColor settings={settings} onChange={onChange} />
                    </More>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
