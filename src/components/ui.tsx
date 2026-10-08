import { useId, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Tooltip, type TipContent } from './Tooltip.tsx'

type Variant = 'primary' | 'secondary' | 'ghost'

// Each variant keeps its resting look when disabled, so hovering doesn't suggest it works.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-hover aria-disabled:hover:bg-accent',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:bg-subtle aria-disabled:hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-subtle hover:text-ink aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-2',
}

const DISABLED = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-45'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: Variant
  // Disabled buttons stay hoverable so their tip can explain what's needed first.
  disabled?: boolean
  tip?: TipContent
  tipSide?: 'right' | 'bottom' | 'top'
  children: ReactNode
}

export function Button({ variant = 'secondary', disabled, tip, tipSide, className = '', onClick, children, ...rest }: ButtonProps) {
  const button = (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${VARIANTS[variant]} ${DISABLED} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
  return tip ? (
    <Tooltip side={tipSide} {...tip}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-subtle px-3 text-sm text-ink outline-none transition ' +
  'placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15'

interface SliderProps {
  label: string
  help: string
  // Slider position, 0–1.
  value: number
  // The value as people read it, like "24 px" or "70%".
  display: string
  // A live explanation of the current value, shown while hovering or dragging.
  note?: string
  onChange: (position: number) => void
  className?: string
}

const KEY_STEP = 0.01

export function Slider({ label, help, value, display, note, onChange, className = '' }: SliderProps) {
  const id = useId()
  const position = Math.min(1, Math.max(0, value))

  // Arrow keys move 1%, or 10% with Shift; the browser's own step would be far too small.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = event.shiftKey ? KEY_STEP * 10 : KEY_STEP
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(Math.min(1, position + step))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(Math.max(0, position - step))
    else return
    event.preventDefault()
  }

  return (
    <Tooltip side="bottom" title={label} description={help} note={note} noteTone="info" keepOpenOnPress className={`flex flex-col gap-1 ${className}`}>
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-2">
        <label htmlFor={id}>{label}</label>
        <span aria-hidden className="tabular-nums text-ink">
          {display}
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(position * 1000)}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value) / 1000)}
        onKeyDown={handleKeyDown}
        className="slider"
        style={{ '--fill': `${position * 100}%` } as CSSProperties}
      />
    </Tooltip>
  )
}
