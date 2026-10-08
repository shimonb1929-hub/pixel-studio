import { CircleHelp, Pipette } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToHsv, hsvToHex, normalizeHex, SWATCHES, type Hsv } from '../editor/color.ts'
import { shortcut } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'

interface ColorPanelProps {
  color: string
  recent: string[]
  onChange: (hex: string) => void
  onPickFromDesign: () => void
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function Swatch({ hex, name, selected, onClick }: { hex: string; name: string; selected: boolean; onClick: () => void }) {
  return (
    <Tooltip title={name} description={`Click to paint with this color (${hex.toUpperCase()}).`}>
      <button
        type="button"
        aria-label={name}
        aria-pressed={selected}
        onClick={onClick}
        className={`h-6 w-6 rounded-md border border-[rgb(16_24_40/0.12)] transition-transform hover:scale-110 ${
          selected ? 'ring-2 ring-accent ring-offset-1' : ''
        }`}
        style={{ background: hex }}
      />
    </Tooltip>
  )
}

export function ColorPanel({ color, recent, onChange, onPickFromDesign }: ColorPanelProps) {
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
    <section aria-label="Color" className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <Tooltip title="Color" description="The color your brush paints with. Pick one below, or take one from your design.">
          <h2 className="flex cursor-help items-center gap-1.5 text-[13px] font-semibold text-ink">
            Color
            <CircleHelp size={14} className="text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
        <Tooltip
          title="Pick from design"
          shortcut="I"
          description={`Take a color from anywhere in your design. With the Brush, you can also hold ${shortcut('alt')} and click.`}
        >
          <button
            type="button"
            aria-label="Pick a color from the design"
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
          title="Color code"
          description="The color written as a code, like #FF0000 for red. Type or paste a code to use an exact color."
          className="flex flex-1"
        >
          <label className="flex h-9 flex-1 items-center rounded-lg border border-line bg-subtle px-2.5 focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/15">
            <span className="text-sm text-ink-3">#</span>
            <input
              aria-label="Color code"
              spellCheck={false}
              value={draft ?? color.slice(1).toUpperCase()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitDraft()
                if (event.key === 'Escape') setDraft(null)
              }}
              className="w-full bg-transparent pl-1 font-mono text-[13px] uppercase text-ink outline-none"
            />
          </label>
        </Tooltip>
      </div>

      <Tooltip
        title="Shade"
        description="Drag left for paler, right for more vivid. Drag up for lighter, down for darker."
        keepOpenOnPress
        className="mt-3 flex"
      >
        <div
          ref={shadeRef}
          role="slider"
          tabIndex={0}
          aria-label="Shade"
          aria-valuetext={`${Math.round(hsv.s * 100)}% vivid, ${Math.round(hsv.v * 100)}% bright`}
          aria-valuenow={Math.round(hsv.s * 100)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            shadeFromPointer(event)
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && shadeFromPointer(event)}
          onKeyDown={shadeKeys}
          className="relative h-28 w-full cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-accent/25 [@media(max-height:820px)]:h-20"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        >
          <span
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(16_24_40/0.3),0_1px_3px_rgb(16_24_40/0.3)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }}
          />
        </div>
      </Tooltip>

      <Tooltip title="Color" description="Slide to choose the color itself: red, orange, yellow, green, blue, purple and back to red." keepOpenOnPress className="mt-3 flex">
        <div
          ref={hueRef}
          role="slider"
          tabIndex={0}
          aria-label="Color"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            hueFromPointer(event)
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && hueFromPointer(event)}
          onKeyDown={hueKeys}
          className="relative h-3 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(16_24_40/0.3),0_1px_3px_rgb(16_24_40/0.3)]"
            style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }}
          />
        </div>
      </Tooltip>

      <div className="mt-4 grid grid-cols-9 gap-1.5">
        {SWATCHES.map((swatch) => (
          <Swatch key={swatch.hex} hex={swatch.hex} name={swatch.name} selected={swatch.hex === color} onClick={() => onChange(swatch.hex)} />
        ))}
      </div>

      {recent.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-ink-3">Recently used</p>
          <div className="grid grid-cols-9 gap-1.5">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} name="Recent color" selected={hex === color} onClick={() => onChange(hex)} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
