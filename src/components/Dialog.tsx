import { CircleHelp, X } from 'lucide-react'
import { useEffect, useId, useRef, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'

interface DialogProps {
  title: string
  subtitle?: string
  submitLabel: string
  cancelLabel?: string
  // For actions that throw work away: the main button turns red.
  danger?: boolean
  submitDisabled?: boolean
  onSubmit: () => void
  onClose: () => void
  children?: ReactNode
}

export function Dialog({ title, subtitle, submitLabel, cancelLabel = 'Cancel', danger, submitDisabled, onSubmit, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdropRef = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!submitDisabled) onSubmit()
  }

  // A click that starts and ends on the dialog element itself is a click on the dimmed
  // backdrop. Checking the start too keeps a text selection dragged outside from closing it.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressedBackdropRef.current && event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => (pressedBackdropRef.current = event.target === event.currentTarget)}
      onClick={handleBackdropClick}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgb(16_24_40/0.32)] backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children && <div className="space-y-5 px-6 py-4">{children}</div>}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="ghost" className="h-9 px-4" onClick={onClose} data-autofocus={danger ? true : undefined}>
            {cancelLabel}
          </Button>
          <button
            type="submit"
            aria-disabled={submitDisabled || undefined}
            className={`h-9 rounded-lg px-5 text-sm font-medium text-white shadow-sm transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-45 ${
              danger ? 'bg-danger hover:bg-[#a52a08]' : 'bg-accent hover:bg-accent-hover aria-disabled:hover:bg-accent'
            }`}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

interface FieldProps {
  label: string
  help: string
  htmlFor?: string
  children: ReactNode
  note?: ReactNode
}

// A form row. Hovering the label (or its question mark) explains the option, and the note
// underneath describes the current choice and updates as it changes.
export function Field({ label, help, htmlFor, children, note }: FieldProps) {
  return (
    <div>
      <Tooltip side="top" title={label} description={help}>
        <label htmlFor={htmlFor} className="mb-2 flex cursor-help items-center gap-1.5 text-[13px] font-medium text-ink">
          {label}
          <CircleHelp size={14} className="text-ink-3" aria-hidden />
        </label>
      </Tooltip>
      {children}
      {note && <p className="mt-2 text-xs leading-relaxed text-ink-2">{note}</p>}
    </div>
  )
}

interface ChoiceOption<T extends string> {
  value: T
  label: string
  description: string
}

interface ChoiceGroupProps<T extends string> {
  name: string
  value: T
  options: ChoiceOption<T>[]
  onChange: (value: T) => void
}

export function ChoiceGroup<T extends string>({ name, value, options, onChange }: ChoiceGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1 rounded-[10px] border border-line bg-subtle p-1">
      {options.map((option) => (
        <Tooltip key={option.value} title={option.label} description={option.description} className="flex flex-1">
          <button
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
              value === option.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
