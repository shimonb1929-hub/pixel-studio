import { useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip.tsx'

export type MenuEntry =
  | { separator: true }
  | {
      separator?: false
      label: string
      description: string
      shortcut?: string
      disabled?: boolean
      onSelect: () => void
    }

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openIndex === null) return
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openIndex])

  return (
    <div ref={barRef} role="menubar" className="flex h-full items-stretch">
      {menus.map((menu, index) => (
        <div key={menu.label} className="relative flex">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIndex === index}
            className={`px-3 text-[13px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 ${
              openIndex === index ? 'bg-zinc-800 text-zinc-50' : ''
            }`}
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            onPointerEnter={() => openIndex !== null && setOpenIndex(index)}
          >
            {menu.label}
          </button>
          {openIndex === index && (
            <div
              role="menu"
              aria-label={menu.label}
              className="absolute left-0 top-full z-40 min-w-60 rounded-b-md border border-zinc-700 bg-zinc-800 py-1 shadow-2xl"
            >
              {menu.items.map((item, itemIndex) =>
                item.separator ? (
                  <div key={`separator-${itemIndex}`} role="separator" className="my-1 border-t border-zinc-700" />
                ) : (
                  <Tooltip
                    key={item.label}
                    side="right"
                    title={item.label.replace('…', '')}
                    description={item.description}
                    className="flex"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      className="group flex w-full items-center justify-between gap-8 whitespace-nowrap px-3 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-accent hover:text-white disabled:text-zinc-500 disabled:hover:bg-transparent"
                      onClick={() => {
                        setOpenIndex(null)
                        item.onSelect()
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="text-xs text-zinc-400 group-enabled:group-hover:text-blue-100">{item.shortcut}</span>}
                    </button>
                  </Tooltip>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
