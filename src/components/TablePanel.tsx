import { CircleHelp, Columns3, Grid3x3, Minus, Plus, Rows3, SquareSlash, type LucideIcon } from 'lucide-react'
import type { TableLines, TableLayer } from '../editor/types.ts'
import { Tooltip } from './Tooltip.tsx'
import { Slider } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

// The parts of a table the Color panel can color.
export type TablePart = 'words' | 'heading' | 'stripes' | 'lines' | 'background'

interface TablePanelProps {
  table: TableLayer
  // The cell being typed in, if any: rows and columns are added next to it.
  cell: { row: number; column: number } | null
  colorPart: TablePart
  onColorPart: (part: TablePart) => void
  onAddRow: () => void
  onRemoveRow: () => void
  onAddColumn: () => void
  onRemoveColumn: () => void
  onHeading: (on: boolean) => void
  onStripes: (on: boolean) => void
  onLines: (kind: TableLines['kind']) => void
  onLineWidth: (width: number) => void
  onPadding: (padding: number) => void
  onRtl: (rtl: boolean) => void
  // Takes the background color away, so the page shows through.
  onNoBackground: () => void
}

// Diagonal line through an empty swatch: "nothing here".
const NONE_SWATCH = 'linear-gradient(to top right, transparent calc(50% - 1px), #c4320a calc(50% - 1px), #c4320a calc(50% + 1px), transparent calc(50% + 1px)), #ffffff'

function PartSwatch({ label, color, active, onClick, description }: { label: string; color: string | null; active: boolean; onClick: () => void; description: string }) {
  return (
    <Tooltip title={label} description={description} className="flex">
      <button
        type="button"
        aria-label={t('{part} color', { part: label })}
        aria-pressed={active}
        onClick={onClick}
        onMouseDown={(event) => event.preventDefault()}
        className={`flex h-9 items-center gap-2 rounded-lg border px-2 text-[12px] font-medium transition-colors ${
          active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle hover:text-ink'
        }`}
      >
        <span className="h-5 w-5 rounded-md border border-[rgb(16_24_40/0.15)]" style={{ background: color ?? NONE_SWATCH }} aria-hidden />
        {label}
      </button>
    </Tooltip>
  )
}

// A count with buttons to add one or take one away.
function Counter({ label, count, help, addLabel, removeLabel, onAdd, onRemove }: { label: string; count: string; help: string; addLabel: string; removeLabel: string; onAdd: () => void; onRemove: () => void }) {
  const button = 'flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-2">
      <Tooltip title={label} description={help}>
        <span className="cursor-help text-[12px] font-medium text-ink-2">{count}</span>
      </Tooltip>
      <div className="flex items-center gap-0.5">
        <Tooltip title={removeLabel} description={help}>
          <button type="button" aria-label={removeLabel} onMouseDown={(event) => event.preventDefault()} onClick={onRemove} className={button}>
            <Minus size={15} />
          </button>
        </Tooltip>
        <Tooltip title={addLabel} description={help}>
          <button type="button" aria-label={addLabel} onMouseDown={(event) => event.preventDefault()} onClick={onAdd} className={button}>
            <Plus size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

function Toggle({ label, description, on, icon: Icon, onChange }: { label: string; description: string; on: boolean; icon: LucideIcon; onChange: (on: boolean) => void }) {
  return (
    <Tooltip title={label} description={description} className="flex">
      <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange(!on)}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
      >
        <Icon size={15} />
        {label}
      </button>
    </Tooltip>
  )
}

const LINES: { value: TableLines['kind']; label: () => string; description: () => string }[] = [
  { value: 'all', label: () => t('All lines'), description: () => t('Lines around every cell, like a timetable.') },
  { value: 'rows', label: () => t('Between rows'), description: () => t('Only lines between the rows, like a menu or a price list.') },
  { value: 'none', label: () => t('No lines'), description: () => t('No lines at all; the words line up in clean columns.') },
]

const MAX_LINE = 12

// How a table looks and how many rows and columns it has. The Text panel sets how its words look.
export function TablePanel(props: TablePanelProps) {
  const { table } = props
  const rows = table.cells.length
  const columns = table.columnWidths.length
  const lines = table.lines
  return (
    <section aria-label={t('Table')} className="shrink-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tooltip
          title={t('Table (rows and columns)')}
          description={t('For menus, price lists and timetables. Click a cell to type in it; Tab goes to the next cell, and Tab in the last cell adds a row. The Text panel sets how the words look.')}
        >
          <h2 className="flex min-w-0 cursor-help items-center gap-1.5 text-[14px] font-semibold text-ink">
            <bdi className="truncate">{table.name}</bdi>
            <CircleHelp size={14} className="shrink-0 text-ink-3" aria-hidden />
          </h2>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-3">
        <Counter
          label={t('Rows')}
          count={t('{count} rows', { count: rows })}
          help={props.cell ? t('Add a row under the one you are typing in, or take that row away.') : t('Add a row at the bottom, or take the bottom one away.')}
          addLabel={t('Add a row')}
          removeLabel={t('Remove a row')}
          onAdd={props.onAddRow}
          onRemove={props.onRemoveRow}
        />
        <Counter
          label={t('Columns')}
          count={t('{count} columns', { count: columns })}
          help={props.cell ? t('Add a column after the one you are typing in, or take that column away.') : t('Add a column at the end, or take the last one away.')}
          addLabel={t('Add a column')}
          removeLabel={t('Remove a column')}
          onAdd={props.onAddColumn}
          onRemove={props.onRemoveColumn}
        />

        <div className="flex flex-wrap gap-1">
          <Toggle label={t('Heading row')} description={t('The top row is a heading: bold words on a colored row.')} on={table.header !== null} icon={Rows3} onChange={props.onHeading} />
          <Toggle label={t('Stripes')} description={t('Every other row gets a soft color, so long lists are easy to read across.')} on={table.stripes !== null} icon={Grid3x3} onChange={props.onStripes} />
          <Toggle
            label={t('Right to left')}
            description={t('The first column is on the right, the way Hebrew and Yiddish tables read.')}
            on={table.rtl}
            icon={Columns3}
            onChange={props.onRtl}
          />
        </div>

        <div role="radiogroup" aria-label={t('Lines')} className="flex gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5">
          {LINES.map((choice) => (
            <Tooltip key={choice.value} title={choice.label()} description={choice.description()} className="flex flex-1">
              <button
                type="button"
                role="radio"
                aria-checked={lines.kind === choice.value}
                aria-label={choice.label()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.onLines(choice.value)}
                className={`flex h-8 flex-1 items-center justify-center rounded-lg px-1.5 text-[11px] font-medium transition-colors ${
                  lines.kind === choice.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {choice.label()}
              </button>
            </Tooltip>
          ))}
        </div>
        {lines.kind !== 'none' && (
          <Slider
            label={t('Line thickness')}
            help={t('How thick the lines between the cells are.')}
            value={Math.sqrt(lines.width / MAX_LINE)}
            display={`${Math.round(lines.width * 10) / 10} px`}
            onChange={(position) => props.onLineWidth(Math.max(0.5, Math.round(position * position * MAX_LINE * 2) / 2))}
          />
        )}
        <Slider
          label={t('Space in cells')}
          help={t('How much room there is between the words and the edges of their cell.')}
          value={Math.min(1, table.padding / (table.style.size * 2))}
          display={`${Math.round(table.padding)} px`}
          onChange={(position) => props.onPadding(Math.round(position * table.style.size * 2))}
        />

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-2">{t('Colors: pick a part, then a color below')}</p>
          <div className="flex flex-wrap gap-1.5">
            <PartSwatch label={t('Words')} color={table.style.color} active={props.colorPart === 'words'} onClick={() => props.onColorPart('words')} description={t('The color of the words in every cell.')} />
            {table.header !== null && (
              <PartSwatch label={t('Heading')} color={table.header} active={props.colorPart === 'heading'} onClick={() => props.onColorPart('heading')} description={t('The color of the heading row.')} />
            )}
            {table.stripes !== null && (
              <PartSwatch label={t('Stripes')} color={table.stripes} active={props.colorPart === 'stripes'} onClick={() => props.onColorPart('stripes')} description={t('The color of every other row.')} />
            )}
            {lines.kind !== 'none' && (
              <PartSwatch label={t('Lines')} color={lines.color} active={props.colorPart === 'lines'} onClick={() => props.onColorPart('lines')} description={t('The color of the lines between the cells.')} />
            )}
            <PartSwatch label={t('Background')} color={table.background} active={props.colorPart === 'background'} onClick={() => props.onColorPart('background')} description={t('The color under all the cells. Leave it empty to see the page through the table.')} />
          </div>
          {props.colorPart === 'background' && table.background !== null && (
            <Tooltip title={t('No background color')} description={t('Takes the color away from under the cells, so the page shows through.')} className="mt-1.5 flex self-start">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={props.onNoBackground}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
              >
                <SquareSlash size={15} />
                {t('No background color')}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </section>
  )
}

