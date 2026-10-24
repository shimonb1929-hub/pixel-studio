import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n.ts'
import { proNameOf } from '../proNames.ts'

export interface TipContent {
  title: string
  description?: string
  shortcut?: string
  // Highlighted line: why something can't be used yet, or what the current value means.
  note?: string
  noteTone?: 'warning' | 'info'
  // What Photoshop, Illustrator or InDesign call it. Found from the title when left out (see
  // src/proNames.ts); false when the title's usual pro word doesn't fit here.
  pro?: string | false
}

interface TooltipProps extends TipContent {
  side?: 'right' | 'bottom' | 'top'
  children: ReactNode
  className?: string
  // Keep the tip open while pressing, so a slider's live explanation stays visible as you drag.
  keepOpenOnPress?: boolean
}

const SHOW_DELAY = 350
// After one tip closes, the next one opens right away so moving along a toolbar feels instant.
const WARM_WINDOW = 600
let lastHiddenAt = 0

const GAP = 8
const EDGE = 8

export function Tooltip({
  title,
  description,
  shortcut,
  note,
  noteTone = 'warning',
  pro,
  side = 'bottom',
  children,
  className,
  keepOpenOnPress,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)
  // After a click, keep the tip closed until the pointer leaves and comes back.
  const suppressedRef = useRef(false)
  const [open, setOpen] = useState(false)
  // Modal dialogs sit above the rest of the page, so tips inside one must render inside it.
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tip = tipRef.current?.getBoundingClientRect()
    if (!anchor || !tip) return
    let left: number
    let top: number
    if (side === 'right' && document.documentElement.dir === 'rtl') {
      // Right-to-left screens are mirrored, so a tip "beside" opens to the left.
      left = anchor.left - GAP - tip.width
      top = anchor.top + anchor.height / 2 - tip.height / 2
    } else if (side === 'right') {
      left = anchor.right + GAP
      top = anchor.top + anchor.height / 2 - tip.height / 2
    } else {
      left = anchor.left + anchor.width / 2 - tip.width / 2
      top = side === 'bottom' ? anchor.bottom + GAP : anchor.top - GAP - tip.height
    }
    left = Math.min(Math.max(EDGE, left), window.innerWidth - tip.width - EDGE)
    top = Math.min(Math.max(EDGE, top), window.innerHeight - tip.height - EDGE)
    setPosition({ left, top })
  }, [open, side])

  function show() {
    if (suppressedRef.current) return
    window.clearTimeout(timerRef.current)
    const warm = Date.now() - lastHiddenAt < WARM_WINDOW
    setContainer(anchorRef.current?.closest('dialog') ?? document.body)
    timerRef.current = window.setTimeout(() => setOpen(true), warm ? 0 : SHOW_DELAY)
  }

  function hide() {
    window.clearTimeout(timerRef.current)
    if (open) lastHiddenAt = Date.now()
    setOpen(false)
    setPosition(null)
  }

  return (
    <span
      ref={anchorRef}
      className={className ?? 'inline-flex'}
      onPointerEnter={show}
      onPointerLeave={() => {
        suppressedRef.current = false
        hide()
      }}
      onPointerDown={() => {
        if (keepOpenOnPress) return
        suppressedRef.current = true
        hide()
      }}
      onFocus={(event) => event.target.matches(':focus-visible') && show()}
      onBlur={hide}
    >
      {children}
      {open &&
        container &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-72 rounded-[10px] bg-ink px-3 py-2.5 text-start shadow-float"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] font-semibold text-white">{title}</span>
              {shortcut && (
                <kbd dir="ltr" className="rounded bg-white/12 px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/80">
                  {shortcut}
                </kbd>
              )}
            </div>
            {description && <p className="mt-1 text-xs leading-relaxed text-white/75">{description}</p>}
            {note && (
              <p className={`mt-1.5 text-xs font-medium leading-relaxed ${noteTone === 'warning' ? 'text-[#ffc56e]' : 'text-[#a9c1ff]'}`}>
                {note}
              </p>
            )}
            {proLine(title, pro)}
          </div>,
          container,
        )}
    </span>
  )
}

// A quiet last line for people who know the professional programs.
function proLine(title: string, pro: string | false | undefined) {
  const name = pro === false ? undefined : (pro ?? proNameOf(title))
  if (!name) return null
  return <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[11px] leading-relaxed text-white/55">{t('Other programs call this {name}.', { name })}</p>
}
