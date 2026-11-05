import { Ellipsis, ImagePlus, X } from 'lucide-react'
import { Fragment, useRef } from 'react'
import type { ToolId } from '../editor/types.ts'
import { TOOLS, type ToolInfo } from '../tools.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { shortcut } from '../keys.ts'
import { useRememberedChoice } from '../hooks/useRememberedChoice.ts'
import { PHONE_SCREEN, useMediaQuery } from '../hooks/useMediaQuery.ts'
import { useElementSize } from '../hooks/useElementSize.ts'

interface ToolDockProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
  // Adding a photo is not a tool, but it is what people look for next to Shapes and Text.
  onAddPhoto: (() => void) | null
}

// What each group of tools is for, in one word. Shown above the group when the screen is tall
// enough; on shorter screens a thin line keeps the groups apart.
function groupCaption(group: ToolInfo['group']): string {
  switch (group) {
    case 'arrange':
      return t('Pick')
    case 'add':
      return t('Add')
    case 'paint':
      return t('Paint')
    case 'adjust':
      return t('Fix photo')
    case 'view':
      return t('View')
  }
}

// How the tools stand beside the design, picked by how much room there is, so every tool is in
// view without scrolling: one column with a word over each group, one column with thin lines
// between groups, or two or three columns side by side on a short screen.
type DockLayout = 'captions' | 'column' | 'two' | 'three'
const ROW = 46 // a button and the gap under it
const CAPTION = 28
const LINE = 9
const PADDING = 14

function dockLayout(height: number, buttons: number, groups: number): DockLayout {
  if (height === 0 || height >= PADDING + buttons * ROW + groups * CAPTION) return 'captions'
  if (height >= PADDING + buttons * ROW + (groups - 1) * LINE) return 'column'
  if (height >= PADDING + Math.ceil(buttons / 2) * ROW) return 'two'
  return 'three'
}

const LAYOUT_CLASS: Record<DockLayout, string> = {
  captions: 'md:w-[72px] md:flex-col',
  column: 'md:w-[72px] md:flex-col',
  two: 'md:grid md:w-[136px] md:grid-cols-2 md:content-start',
  three: 'md:grid md:w-[200px] md:grid-cols-3 md:content-start',
}

const BUTTON =
  'flex h-11 w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-medium leading-none transition-colors'

export function ToolDock({ tool, onToolChange, onAddPhoto }: ToolDockProps) {
  // The few tools nobody needs to make something wait under "More tools", so the column stays short
  // and fits a laptop screen. A tucked-away tool picked by its key or by search still shows while on.
  const [showAll, setShowAll] = useRememberedChoice('pixel-studio-dock-every-tool')
  const shown = TOOLS.filter((info) => showAll || !info.extra || info.id === tool)
  const tucked = TOOLS.filter((info) => info.extra).map((info) => info.name)
  // In the row along the bottom of a phone, tips open above the buttons.
  const phone = useMediaQuery(PHONE_SCREEN)
  const side = phone ? 'top' : 'right'
  const navRef = useRef<HTMLElement>(null)
  const { height } = useElementSize(navRef)
  const buttons = shown.length + (onAddPhoto ? 1 : 0) + 1
  const groups = new Set(shown.map((info) => info.group)).size
  const layout = phone ? 'column' : dockLayout(height, buttons, groups)
  return (
    <nav
      ref={navRef}
      aria-label={t("Tools")}
      data-layout={layout}
      // On a phone the tools sit in a row along the bottom, under your thumb; slide it to see them all.
      // Wider screens have the tools at the side, in as many columns as it takes for all of them to
      // fit the height of the window. Only on a very short window does it scroll, gently.
      className={`flex w-full shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-card border border-line bg-surface p-1.5 shadow-card md:overflow-x-hidden md:overflow-y-auto ${LAYOUT_CLASS[layout]}`}
    >
      {shown.map(({ id, name, label, key, icon: Icon, description, pro, group }, index) => (
        <Fragment key={id}>
          {index > 0 && shown[index - 1].group !== group && layout === 'column' && <div role="separator" className="mx-1 h-8 w-px shrink-0 bg-line md:mx-0 md:my-1 md:h-px md:w-8" />}
          {layout === 'captions' && (index === 0 || shown[index - 1].group !== group) && (
            <span aria-hidden className="hidden whitespace-nowrap pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3 md:block">
              {groupCaption(group)}
            </span>
          )}
          <Tooltip side={side} title={t('{tool} tool', { tool: name })} shortcut={key} description={description} pro={pro}>
            <button
              type="button"
              aria-label={t('{tool} tool', { tool: name })}
              aria-pressed={tool === id}
              onClick={() => onToolChange(id)}
              className={`${BUTTON} ${tool === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </button>
          </Tooltip>
          {id === 'text' && onAddPhoto && (
            <Tooltip
              side={side}
              title={t('Add a photo')}
              shortcut={shortcut('mod', 'shift', 'O')}
              description={t('Pick a photo or picture from your computer to put on the page. It keeps all its quality, however often you resize it.')}
              pro="Place"
            >
              <button
                type="button"
                aria-label={t('Add a photo')}
                onClick={onAddPhoto}
                className={`${BUTTON} text-ink-2 hover:bg-subtle hover:text-ink`}
              >
                <ImagePlus size={20} strokeWidth={1.75} />
                {t('Photo')}
              </button>
            </Tooltip>
          )}
        </Fragment>
      ))}
      <Tooltip
        side={side}
        title={showAll ? t('Fewer tools') : t('More tools')}
        description={
          showAll
            ? t('Tuck away the tools that are rarely needed. Their keys and the search box still reach them.')
            : t('Show the tools that are rarely needed: {tools}.', { tools: tucked.join(', ') })
        }
      >
        <button
          type="button"
          aria-label={showAll ? t('Fewer tools') : t('More tools')}
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
          className={`${BUTTON} text-ink-3 hover:bg-subtle hover:text-ink ${layout === 'captions' || layout === 'column' ? 'md:mt-1' : ''}`}
        >
          {showAll ? <X size={20} strokeWidth={1.75} /> : <Ellipsis size={20} strokeWidth={1.75} />}
          {showAll ? t('Fewer') : t('More')}
        </button>
      </Tooltip>
    </nav>
  )
}
