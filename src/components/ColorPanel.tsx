import { CircleHelp, Pipette, Plus, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToHsv, hsvToHex, normalizeHex, SWATCHES, type Hsv } from '../editor/color.ts'
import { shortcut } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

// The design's own colors: kept to use again, and changed everywhere at once.
export interface DesignColors {
  colors: string[]
  // How many things use a color, on every page.
  uses: (hex: string) => number
  onKeep: (hex: string) => void
  onForget: (hex: string) => void
  // The color being changed everywhere right now, as it is now. While it's set, the panel's color
  // is that color, and picking another changes it everywhere.
  changing: string | null
  onStartChange: (hex: string) => void
  onDone: () => void
  onPutBack: () => void
}

interface ColorPanelProps {
  color: string
  recent: string[]
  onChange: (hex: string) => void
  onPickFromDesign: () => void
  design?: DesignColors
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function Swatch({ hex, name, selected, onClick }: { hex: string; name: string; selected: boolean; onClick: () => void }) {
  return (
    <Tooltip title={name} description={t('Click to paint with this color ({code}).', { code: hex.toUpperCase() })}>
      <button
        type="button"
        aria-label={name}
        aria-pressed={selected}
        onClick={onClick}
        className={`h-6 w-6 rounded-lg border border-[rgb(16_24_40/0.1)] transition-transform hover:scale-110 ${
          selected ? 'ring-2 ring-accent ring-offset-1' : ''
        }`}
        style={{ background: hex }}
      />
    </Tooltip>
  )
}

function DesignColorsRow({ color, design, onChange }: { color: string; design: DesignColors; onChange: (hex: string) => void }) {
  const kept = design.colors.some((c) => c.toLowerCase() === color.toLowerCase())
  if (design.changing !== null) {
    const uses = design.uses(design.changing)
    return (
      <div role="group" aria-label={t('Changing a color everywhere')} className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
        <p className="text-[13px] font-medium text-ink">{t('Changing this color everywhere')}</p>
        <p className="mt-0.5 text-xs text-ink-2">
          {uses === 1 ? t('Pick a new color: 1 thing in your design changes as you pick.') : t('Pick a new color: {count} things in your design change as you pick.', { count: uses })}
        </p>
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" className="h-8 px-3" onClick={design.onDone} tip={{ title: t('Done'), description: t('Keep the new color everywhere. Undo can still take it back.') }}>
            {t('Done')}
          </Button>
          <Button variant="ghost" className="h-8 px-3" onClick={design.onPutBack} tip={{ title: t('Put back'), description: t('Bring back the color it was, everywhere.') }}>
            {t('Put back')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <Tooltip title={t("This design's colors")} description={t('Colors you keep here are easy to use again anywhere in this design, on every page. Change one, and it changes everywhere it was used.')}>
          <p className="cursor-help text-[11px] font-medium text-ink-3">{t("This design's colors")}</p>
        </Tooltip>
        {!kept && (
          <Tooltip title={t('Keep this color')} description={t('Adds the color shown above to this design’s colors, so it is one click away later.')}>
            <button
              type="button"
              aria-label={t('Keep this color')}
              onClick={() => design.onKeep(color)}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={12} />
              {t('Keep')}
            </button>
          </Tooltip>
        )}
      </div>
      {design.colors.length > 0 ? (
        <div className="grid grid-cols-9 gap-1.5">
          {design.colors.map((hex) => (
            <Swatch key={hex} hex={hex} name={t("This design's color")} selected={hex.toLowerCase() === color.toLowerCase()} onClick={() => onChange(hex)} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-3">{t('None yet. Press Keep to save the color you are using.')}</p>
      )}
      {kept && (
        <div className="mt-2 flex items-center gap-1">
          <Tooltip
            title={t('Change it everywhere')}
            description={t('Change this color in every place it is used in your design, on every page: shapes, letters, outlines, gradients and the page. You see it change as you pick.')}
          >
            <button
              type="button"
              onClick={() => design.onStartChange(color)}
              className="h-7 rounded-md px-2 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              {t('Change it everywhere…')}
            </button>
          </Tooltip>
          <Tooltip title={t('Stop keeping this color')} description={t('Takes it out of this design’s colors. Nothing in your design changes.')}>
            <button
              type="button"
              aria-label={t('Stop keeping this color')}
              onClick={() => design.onForget(color)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

export function ColorPanel({ color, recent, onChange, onPickFromDesign, design }: ColorPanelProps) {
  // Kept separately from the hex color so the hue doesn't jump when a color is gray or black.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color))
  const [syncedColor, setSyncedColor] = useState(color)
  const [draft, setDraft] = useState<string | null>(null)
  const shadeRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // When the color changes from outside (a swatch, the color picker), follow it.
  if (color !== syncedColor) {
    setSyncedColor(color)
    if (hsvToHex(hsv) !== color) {
      const next = hexToHsv(color)
      setHsv(next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next)
    }
  }

  function update(next: Hsv) {
    setHsv(next)
    const hex = hsvToHex(next)
    setSyncedColor(hex)
    onChange(hex)
  }

  function shadeFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = shadeRef.current!.getBoundingClientRect()
    update({ h: hsv.h, s: clamp01((event.clientX - rect.left) / rect.width), v: clamp01(1 - (event.clientY - rect.top) / rect.height) })
  }

  function hueFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = hueRef.current!.getBoundingClientRect()
    update({ ...hsv, h: clamp01((event.clientX - rect.left) / rect.width) * 360 })
  }

  function shadeKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    update({ h: hsv.h, s: clamp01(hsv.s + move[0]), v: clamp01(hsv.v + move[1]) })
  }

  function hueKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 30 : 5
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') update({ ...hsv, h: Math.max(0, hsv.h - step) })
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') update({ ...hsv, h: Math.min(360, hsv.h + step) })
    else return
    event.preventDefault()
  }

  function commitDraft() {
    if (draft === null) return
    const hex = normalizeHex(draft)
    if (hex) onChange(hex)
    setDraft(null)
  }

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  return (
    <section aria-label={t("Color")} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <Tooltip title={t("Color")} description={t("The color your brush paints with. Pick one below, or take one from your design.")}>
          <h2 className="flex cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            {t('Color')}
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <Tooltip
          title={t("Pick from design")}
          shortcut="I"
          description={t('Take a color from anywhere in your design. With the Brush, you can also hold {alt} and click.', { alt: shortcut('alt') })}
        >
          <button
            type="button"
            aria-label={t("Pick a color from the design")}
            onClick={onPickFromDesign}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
          >
            <Pipette size={15} />
          </button>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 rounded-lg border border-[rgb(16_24_40/0.12)] shadow-sm" style={{ background: color }} aria-hidden />
        <Tooltip
          title={t("Color code")}
          description={t("The color written as a code, like #FF0000 for red. Type or paste a code to use an exact color.")}
          className="flex flex-1"
        >
          <label dir="ltr" className="flex h-9 flex-1 items-center rounded-lg border border-line bg-subtle px-2.5 focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/15">
            <span className="text-sm text-ink-3">#</span>
            <input
              aria-label={t("Color code")}
              spellCheck={false}
              value={draft ?? color.slice(1).toUpperCase()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitDraft()
                if (event.key === 'Escape') setDraft(null)
              }}
              className="w-full bg-transparent ps-1 font-mono text-[13px] uppercase text-ink outline-none"
            />
          </label>
        </Tooltip>
      </div>

      {/* Ready colors first: one click and you have a color. Below them, the square and the strip
          fine-tune it. */}
      <div className="mt-3 grid grid-cols-9 gap-1.5">
        {SWATCHES.map((swatch) => (
          <Swatch key={swatch.hex} hex={swatch.hex} name={swatch.name} selected={swatch.hex === color} onClick={() => onChange(swatch.hex)} />
        ))}
      </div>

      {design && <DesignColorsRow color={color} design={design} onChange={onChange} />}

      <Tooltip
        title={t("Shade")}
        description={t("Drag left for paler, right for more vivid. Drag up for lighter, down for darker.")}
        keepOpenOnPress
        className="mt-4 flex"
      >
        <div
          ref={shadeRef}
          role="slider"
          tabIndex={0}
          aria-label={t("Shade")}
          aria-valuetext={t('{vivid}% vivid, {bright}% bright', { vivid: Math.round(hsv.s * 100), bright: Math.round(hsv.v * 100) })}
          aria-valuenow={Math.round(hsv.s * 100)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            shadeFromPointer(event)
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && shadeFromPointer(event)}
          onKeyDown={shadeKeys}
          className="relative h-24 w-full cursor-crosshair touch-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-accent/25 [@media(max-height:820px)]:h-20"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        >
          <span
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(16_24_40/0.3),0_1px_3px_rgb(16_24_40/0.3)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }}
          />
        </div>
      </Tooltip>

      <Tooltip title={t("Color")} description={t("Slide to choose the color itself: red, orange, yellow, green, blue, purple and back to red.")} keepOpenOnPress className="mt-3 flex">
        <div
          ref={hueRef}
          role="slider"
          tabIndex={0}
          aria-label={t("Color")}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            hueFromPointer(event)
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && hueFromPointer(event)}
          onKeyDown={hueKeys}
          className="relative h-2.5 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(16_24_40/0.3),0_1px_3px_rgb(16_24_40/0.3)]"
            style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }}
          />
        </div>
      </Tooltip>


      {recent.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-ink-3">{t('Recently used')}</p>
          <div className="grid grid-cols-9 gap-1.5">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} name={t("Recent color")} selected={hex === color} onClick={() => onChange(hex)} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
