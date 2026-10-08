import { Search } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { actionBlocker, searchActions, type Action } from '../actions.ts'

interface CommandPaletteProps {
  actions: Action[]
  hasDocument: boolean
  onClose: () => void
}

// "What do you want to do?" — find any action by typing everyday words.
export function CommandPalette({ actions, hasDocument, onClose }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const pressedBackdropRef = useRef(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const results = searchActions(actions, query)
  const active = results[activeIndex]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('input')?.focus()
  }, [])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function run(action: Action | undefined) {
    if (!action || actionBlocker(action, hasDocument) !== null) return
    onClose()
    action.run()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(active)
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search for something to do"
      onClose={onClose}
      onPointerDown={(event) => (pressedBackdropRef.current = event.target === event.currentTarget)}
      onClick={handleBackdropClick}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgb(16_24_40/0.25)] backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="shrink-0 text-ink-3" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={active ? `palette-${active.id}` : undefined}
          aria-label="What do you want to do?"
          placeholder="What do you want to do? Try “save”, “bigger” or “new”"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      <ul id="palette-results" ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(24rem,55vh)] overflow-y-auto p-2">
        {results.map((action, index) => {
          const blocker = actionBlocker(action, hasDocument)
          const enabled = blocker === null
          return (
            <li
              key={action.id}
              id={`palette-${action.id}`}
              role="option"
              aria-selected={index === activeIndex}
              aria-disabled={!enabled || undefined}
              onPointerMove={() => index !== activeIndex && setActiveIndex(index)}
              onClick={() => run(action)}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 ${
                index === activeIndex ? 'bg-accent-soft' : ''
              } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${enabled ? 'text-ink' : 'text-ink-3'}`}>{action.title}</span>
                  <span className="text-[11px] text-ink-3">{action.group}</span>
                </div>
                <p className={`mt-0.5 line-clamp-2 text-xs leading-relaxed ${enabled ? 'text-ink-2' : 'text-[#b54708]'}`}>
                  {blocker ?? action.description}
                </p>
              </div>
              {action.shortcut && (
                <kbd className="shrink-0 rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] text-ink-3">
                  {action.shortcut}
                </kbd>
              )}
            </li>
          )
        })}
        {results.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-ink-2">
            Nothing found for “{query.trim()}”. Try words like “save”, “zoom” or “new”.
          </li>
        )}
      </ul>

      <div className="flex items-center gap-5 border-t border-line px-4 py-2.5 text-[11px] text-ink-3">
        <span>
          <b className="font-medium text-ink-2">Up / Down</b> to choose
        </span>
        <span>
          <b className="font-medium text-ink-2">Enter</b> to do it
        </span>
        <span>
          <b className="font-medium text-ink-2">Esc</b> to close
        </span>
      </div>
    </dialog>
  )
}
