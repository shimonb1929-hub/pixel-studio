import type { ButtonHTMLAttributes, ReactNode } from 'react'
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
