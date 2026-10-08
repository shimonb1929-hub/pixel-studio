import { Download, Menu as MenuIcon, Redo2, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { actionBlocker, NEEDS_DOCUMENT_HINT, type Action, type ActionGroup } from '../actions.ts'
import { shortcut } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'

const MENU_GROUPS: ActionGroup[] = ['Design', 'Edit', 'Layers', 'View']

function MainMenu({ actions, hasDocument }: { actions: Action[]; hasDocument: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Tooltip title="Menu" description="Everything you can do, in one list. You can also type what you want in the search box.">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
            open ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:bg-surface hover:text-ink'
          }`}
        >
          <MenuIcon size={16} />
          Menu
        </button>
      </Tooltip>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute left-0 top-full z-40 mt-2 max-h-[calc(100vh-5rem)] w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-float"
        >
          {MENU_GROUPS.map((group, groupIndex) => (
            <div key={group} role="group" aria-label={group}>
              {groupIndex > 0 && <div role="separator" className="mx-1 my-1.5 border-t border-line" />}
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group}</div>
              {actions
                .filter((action) => action.group === group)
                .map((action) => {
                  const blocker = actionBlocker(action, hasDocument)
                  const enabled = blocker === null
                  return (
                    <Tooltip
                      key={action.id}
                      side="right"
                      title={action.title.replace('…', '')}
                      description={action.description}
                      note={blocker ?? undefined}
                      className="flex"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        aria-disabled={!enabled || undefined}
                        onClick={() => {
                          if (!enabled) return
                          close(false)
                          action.run()
                        }}
                        className="flex w-full items-center justify-between gap-6 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] text-ink outline-none hover:bg-subtle focus-visible:bg-subtle aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent"
                      >
                        <span>{action.title}</span>
                        {action.shortcut && <span className="text-xs text-ink-3">{action.shortcut}</span>}
                      </button>
                    </Tooltip>
                  )
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TopBarProps {
  actions: Action[]
  documentName: string | null
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
  onSearch: () => void
  onDownload: () => void
}

export function TopBar({ actions, documentName, undoLabel, redoLabel, onUndo, onRedo, onSearch, onDownload }: TopBarProps) {
  const hasDocument = documentName !== null
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-3 px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="whitespace-nowrap px-2 text-[15px] font-semibold tracking-tight text-ink">Pixel Studio</span>
        <MainMenu actions={actions} hasDocument={hasDocument} />
        <div className="ml-1 flex items-center">
          <Button
            variant="ghost"
            aria-label="Undo"
            className="h-9 w-9"
            disabled={!undoLabel}
            onClick={onUndo}
            tip={{
              title: undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo',
              shortcut: shortcut('mod', 'Z'),
              description: 'Take back your last change. Press again to keep going back.',
              note: undoLabel ? undefined : hasDocument ? 'Nothing to undo yet.' : NEEDS_DOCUMENT_HINT,
            }}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            variant="ghost"
            aria-label="Redo"
            className="h-9 w-9"
            disabled={!redoLabel}
            onClick={onRedo}
            tip={{
              title: redoLabel ? `Redo ${redoLabel.toLowerCase()}` : 'Redo',
              shortcut: shortcut('mod', 'shift', 'Z'),
              description: 'Bring back a change you just undid.',
              note: redoLabel ? undefined : hasDocument ? 'Nothing to redo. Redo works right after you undo.' : NEEDS_DOCUMENT_HINT,
            }}
          >
            <Redo2 size={17} />
          </Button>
        </div>
      </div>

      <Tooltip
        title="Search"
        shortcut={shortcut('mod', 'K')}
        description="Type what you want to do in your own words, like “save”, “bigger” or “new”, and pick it from the list."
        className="flex"
      >
        <button
          type="button"
          onClick={onSearch}
          className="flex h-9 w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink-3 shadow-sm transition-colors hover:border-[#cdd2db] hover:text-ink-2"
        >
          <Search size={16} className="shrink-0" />
          <span className="flex-1 truncate text-left">What do you want to do?</span>
          <kbd className="hidden rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:block">
            {shortcut('mod', 'K')}
          </kbd>
        </button>
      </Tooltip>

      <div className="flex min-w-0 items-center justify-end gap-3">
        {documentName && <span className="hidden truncate text-[13px] text-ink-2 lg:block">{documentName}</span>}
        <Button
          variant="primary"
          className="h-9 px-4"
          disabled={!hasDocument}
          onClick={onDownload}
          tip={{
            title: 'Download',
            shortcut: shortcut('mod', 'S'),
            description: 'Save your design to your computer as a PNG or JPG picture you can share or print.',
            note: hasDocument ? undefined : NEEDS_DOCUMENT_HINT,
          }}
        >
          <Download size={16} />
          Download
        </Button>
      </div>
    </header>
  )
}
