import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { actionBlocker, type Action } from '../actions.ts'
import { t } from '../i18n/i18n.ts'
import { Tooltip } from './Tooltip.tsx'

// The short menu that opens where you right-click (or long-press): the everyday things you can do
// with what you clicked, so nobody has to hunt through the main Menu for them. Every item comes
// from the one list of actions, so it has the same name, hover tip and shortcut as in the Menu.

interface ContextMenuProps {
  // Where it opens, in screen pixels.
  x: number
  y: number
  // The items, in small sections divided by a line.
  sections: Action[][]
  hasDocument: boolean
  onClose: () => void
}

const EDGE = 8

export function ContextMenu({ x, y, sections, hasDocument, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  // Kept inside the window: it opens up or to the left when there's no room below or to the right.
  const [place, setPlace] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    const left = x + width + EDGE > window.innerWidth ? Math.max(EDGE, x - width) : x
    const top = y + height + EDGE > window.innerHeight ? Math.max(EDGE, window.innerHeight - height - EDGE) : y
    setPlace({ left, top })
    menu.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled])')?.focus()
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const close = () => onClose()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('wheel', close)
    }
  }, [onClose])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  const shown = sections.filter((section) => section.length > 0)
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('Things you can do')}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: place.left, top: place.top }}
      className="fixed z-50 flex max-h-[calc(100vh-1rem)] w-64 flex-col overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-float"
    >
      {shown.map((section, sectionIndex) => (
        <div key={sectionIndex} role="group">
          {sectionIndex > 0 && <div role="separator" className="mx-1 my-1 border-t border-line" />}
          {section.map((action) => {
            const blocker = actionBlocker(action, hasDocument)
            const enabled = blocker === null
            return (
              <Tooltip key={action.id} side="right" title={action.title.replace('…', '')} description={action.description} note={blocker ?? undefined} className="flex">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={!enabled || undefined}
                  onClick={() => {
                    if (!enabled) return
                    onClose()
                    action.run()
                  }}
                  className="flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-start text-[13px] text-ink outline-none hover:bg-subtle focus-visible:bg-subtle aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent"
                >
                  <span>{action.title}</span>
                  {action.shortcut && (
                    <span dir="ltr" className="text-xs text-ink-3">
                      {action.shortcut}
                    </span>
                  )}
                </button>
              </Tooltip>
            )
          })}
        </div>
      ))}
    </div>
  )
}
