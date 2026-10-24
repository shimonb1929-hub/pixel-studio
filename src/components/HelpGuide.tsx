import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { actionBlocker, NEEDS_DOCUMENT_HINT, type Action } from '../actions.ts'
import type { ToolId } from '../editor/types.ts'
import { GOALS, type Goal } from '../help.ts'
import { t } from '../i18n/i18n.ts'
import { ALT_LABEL, shortcut } from '../keys.ts'
import { PRO_NAMES } from '../proNames.ts'
import { TOOLS, type ToolInfo } from '../tools.ts'
import { Button } from './ui.tsx'

type Tab = 'goals' | 'tools' | 'words'

interface HelpGuideProps {
  actions: Action[]
  hasDocument: boolean
  onPickTool: (tool: ToolId) => void
  onClose: () => void
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

// Every typed word has to be found somewhere in the item, in any language or as the pro word.
function matches(query: string, texts: string[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const all = normalize(texts.join(' '))
  return words.every((word) => all.includes(word))
}

const goalHow = (goal: Goal) => t(goal.how, { alt: ALT_LABEL, undo: shortcut('mod', 'Z') })

// The plain word and the pro word for everything that has one, tools first.
function wordList(): { plain: string; english: string; pro: string }[] {
  const tools = TOOLS.map((tool) => ({ plain: tool.name, english: tool.id, pro: tool.pro }))
  const others = Object.entries(PRO_NAMES)
    .filter(([english, pro]) => english.toLowerCase() !== pro.toLowerCase())
    .map(([english, pro]) => ({ plain: t(english), english, pro }))
    // A tool's own name is already in the list.
    .filter((word) => !tools.some((tool) => tool.plain === word.plain))
  return [...tools, ...others]
}

// "Help": what each tool does, when to use it and how, and which tool does what you have in mind.
// For people who never used a design program, and for those who know the professional ones by
// their own words.
export function HelpGuide({ actions, hasDocument, onPickTool, onClose }: HelpGuideProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedBackdropRef = useRef(false)
  const [tab, setTab] = useState<Tab>('goals')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('input')?.focus()
  }, [])

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
  }

  function pickTool(tool: ToolId) {
    onClose()
    onPickTool(tool)
  }

  const searching = query.trim() !== ''
  const goals = GOALS.filter((goal) => !searching || matches(query, [t(goal.goal), goalHow(goal), goal.goal, goal.pro, ...goal.keywords]))
  const tools = TOOLS.filter(
    (tool) => !searching || matches(query, [tool.name, tool.label, tool.description, tool.when, tool.pro, ...tool.keywords]),
  )
  const words = wordList().filter((word) => !searching || matches(query, [word.plain, word.english, word.pro]))
  const nothing = goals.length + tools.length + words.length === 0

  const showGoals = searching ? goals.length > 0 : tab === 'goals'
  const showTools = searching ? tools.length > 0 : tab === 'tools'
  const showWords = searching ? words.length > 0 : tab === 'words'

  function goalButton(goal: Goal) {
    const action = goal.action ? actions.find((a) => a.id === goal.action) : undefined
    const blocker = action ? actionBlocker(action, hasDocument) : hasDocument ? null : t(NEEDS_DOCUMENT_HINT)
    return (
      <Button
        className="h-8 shrink-0 px-3 text-[13px]"
        disabled={blocker !== null}
        tip={{ title: t('Show me'), description: action ? action.description : t('Picks the tool for you, so you can try it right away.'), note: blocker ?? undefined, pro: false }}
        onClick={() => {
          if (action) {
            onClose()
            action.run()
          } else if (goal.tool) pickTool(goal.tool)
        }}
      >
        {t('Show me')}
      </Button>
    )
  }

  function toolCard(tool: ToolInfo) {
    const Icon = tool.icon
    const rows: [string, string][] = [
      [t('What it does'), tool.description],
      [t('When to use it'), tool.when],
      [t('How'), tool.hint],
    ]
    return (
      <li key={tool.id} className="rounded-xl border border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon size={18} strokeWidth={1.75} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">{tool.name}</h3>
            <p className="text-[11px] text-ink-3">{t('Other programs call this {name}.', { name: tool.pro })}</p>
          </div>
          <Button
            className="h-8 shrink-0 px-3 text-[13px]"
            disabled={!hasDocument}
            tip={{ title: t('Use this tool'), shortcut: tool.key, description: t('Picks the tool for you, so you can try it right away.'), note: hasDocument ? undefined : t(NEEDS_DOCUMENT_HINT), pro: false }}
            onClick={() => pickTool(tool.id)}
          >
            {t('Use this tool')}
          </Button>
        </div>
        <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-xs leading-relaxed sm:grid-cols-[8rem_1fr]">
          {rows.map(([label, text]) => (
            <div key={label} className="contents">
              <dt className="font-medium text-ink-2">{label}</dt>
              <dd className="text-ink">{text}</dd>
            </div>
          ))}
        </dl>
      </li>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'goals', label: t('I want to…') },
    { id: 'tools', label: t('Every tool') },
    { id: 'words', label: t('Pro words') },
  ]
  const heading = 'mb-2 mt-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3'

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('Help')}
      onClose={onClose}
      onPointerDown={(event) => (pressedBackdropRef.current = event.target === event.currentTarget)}
      onClick={handleBackdropClick}
      className="m-auto flex h-[min(44rem,calc(100vh-2rem))] w-[min(46rem,calc(100vw-2rem))] flex-col rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgb(16_24_40/0.25)] backdrop:backdrop-blur-[2px] [&:not([open])]:hidden"
    >
      <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t('Help')}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{t('Find the right tool, and see when and how to use it.')}</p>
        </div>
        <button
          type="button"
          aria-label={t('Close')}
          onClick={onClose}
          className="-me-2 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6">
        <label className="flex h-11 items-center gap-3 rounded-xl border border-line bg-subtle px-3 focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/15">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            type="search"
            aria-label={t('Search help')}
            placeholder={t('What do you want to do? Try “lighter”, “round photo” or “Pen tool”')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        {!searching && (
          <div role="tablist" aria-label={t('Help')} className="mt-3 flex gap-1 rounded-[10px] border border-line bg-subtle p-1">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${tab === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {nothing && (
          <p className="px-1 py-10 text-center text-sm text-ink-2">
            {t('Nothing found for “{query}”. Try other words, like “color”, “photo” or “text”.', { query: query.trim() })}
          </p>
        )}

        {showGoals && (
          <section aria-label={t('I want to…')}>
            {searching && <h3 className={heading}>{t('I want to…')}</h3>}
            <ul className="flex flex-col gap-1">
              {goals.map((goal) => (
                <li key={goal.id} className="flex items-start gap-4 rounded-xl px-3 py-2.5 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-ink">{t(goal.goal)}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{goalHow(goal)}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{t('Other programs call this {name}.', { name: goal.pro })}</p>
                  </div>
                  {goalButton(goal)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {showTools && (
          <section aria-label={t('Every tool')} className={searching && showGoals ? 'mt-5' : ''}>
            {searching && <h3 className={heading}>{t('Every tool')}</h3>}
            <ul className="flex flex-col gap-2">{tools.map(toolCard)}</ul>
          </section>
        )}

        {showWords && (
          <section aria-label={t('Pro words')} className={searching && (showGoals || showTools) ? 'mt-5' : ''}>
            {searching ? (
              <h3 className={heading}>{t('Pro words')}</h3>
            ) : (
              <p className="mb-2 px-1 text-xs leading-relaxed text-ink-2">
                {t('Know Photoshop, Illustrator or InDesign? Here is what their words are called here.')}
              </p>
            )}
            <table className="w-full text-[13px]">
              <thead className="sr-only">
                <tr>
                  <th>{t('Here')}</th>
                  <th>{t('Other programs')}</th>
                </tr>
              </thead>
              <tbody>
                {words.map((word) => (
                  <tr key={word.english} className="border-b border-line last:border-0">
                    <td className="py-2 pe-4 ps-1 font-medium text-ink">{word.plain}</td>
                    <td className="py-2 text-end text-ink-2">
                      <span dir="ltr">{word.pro}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </dialog>
  )
}
