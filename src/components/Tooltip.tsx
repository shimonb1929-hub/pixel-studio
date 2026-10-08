import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface TipContent {
  title: string
  description?: string
  shortcut?: string
}

interface TooltipProps extends TipContent {
  side?: 'right' | 'bottom' | 'top'
  children: ReactNode
  className?: string
}

const SHOW_DELAY = 350
// After one tip closes, the next one opens right away so moving along a toolbar feels instant.
const WARM_WINDOW = 600
let lastHiddenAt = 0

const GAP = 8
const EDGE = 8

export function Tooltip({ title, description, shortcut, side = 'bottom', children, className }: TooltipProps) {
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
    if (side === 'right') {
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
            className="pointer-events-none fixed z-50 max-w-72 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-left shadow-xl"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[13px] font-semibold text-zinc-50">{title}</span>
              {shortcut && <kbd className="font-sans text-[11px] text-zinc-400">{shortcut}</kbd>}
            </div>
            {description && <p className="mt-1 text-xs leading-relaxed text-zinc-300">{description}</p>}
          </div>,
          container,
        )}
    </span>
  )
}
