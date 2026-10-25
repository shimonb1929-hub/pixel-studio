import { Ellipsis, ImagePlus, X } from 'lucide-react'
import { Fragment } from 'react'
import type { ToolId } from '../editor/types.ts'
import { TOOLS, type ToolInfo } from '../tools.ts'
import { Tooltip } from './Tooltip.tsx'
import { t } from '../i18n/i18n.ts'
import { shortcut } from '../keys.ts'
import { useRememberedChoice } from '../hooks/useRememberedChoice.ts'

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

const BUTTON =
  'flex h-11 w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-medium leading-none transition-colors'

export function ToolDock({ tool, onToolChange, onAddPhoto }: ToolDockProps) {
  // The few tools nobody needs to make something wait under "More tools", so the column stays short
  // and fits a laptop screen. A tucked-away tool picked by its key or by search still shows while on.
  const [showAll, setShowAll] = useRememberedChoice('pixel-studio-dock-every-tool')
  const shown = TOOLS.filter((info) => showAll || !info.extra || info.id === tool)
  const tucked = TOOLS.filter((info) => info.extra).map((info) => info.name)
  return (
    <nav
      aria-label={t("Tools")}
      // On a short screen (a small laptop) the column would not fit, so the tools stand in two columns
      // instead, still all in view.
      className="flex w-[72px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-card [@media(max-height:820px)]:grid [@media(max-height:820px)]:w-[136px] [@media(max-height:820px)]:grid-cols-2 [@media(max-height:820px)]:content-start"
    >
      {shown.map(({ id, name, label, key, icon: Icon, description, pro, group }, index) => (
        <Fragment key={id}>
          {index > 0 && shown[index - 1].group !== group && <div role="separator" className="my-1 h-px w-8 shrink-0 bg-line [@media(min-height:1000px)]:hidden [@media(max-height:820px)]:hidden" />}
          {(index === 0 || shown[index - 1].group !== group) && (
            <span aria-hidden className="hidden whitespace-nowrap pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3 [@media(min-height:1000px)]:block">
              {groupCaption(group)}
            </span>
          )}
          <Tooltip side="right" title={t('{tool} tool', { tool: name })} shortcut={key} description={description} pro={pro}>
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
              side="right"
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
        side="right"
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
          className={`${BUTTON} mt-1 text-ink-3 hover:bg-subtle hover:text-ink`}
        >
          {showAll ? <X size={20} strokeWidth={1.75} /> : <Ellipsis size={20} strokeWidth={1.75} />}
          {showAll ? t('Fewer') : t('More')}
        </button>
      </Tooltip>
    </nav>
  )
}
