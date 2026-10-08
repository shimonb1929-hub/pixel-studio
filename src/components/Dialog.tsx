import { X } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'

interface DialogProps {
  title: string
  submitLabel: string
  submitDisabled?: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}

export function Dialog({ title, submitLabel, submitDisabled, onSubmit, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-zinc-700 bg-zinc-900 p-0 text-zinc-200 shadow-2xl backdrop:bg-black/60"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-50">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-5 px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
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

// A form row whose label explains the option on hover, with an optional live note underneath.
export function Field({ label, help, htmlFor, children, note }: FieldProps) {
  return (
    <div>
      <Tooltip side="top" title={label} description={help}>
        <label htmlFor={htmlFor} className="mb-1.5 block cursor-help text-xs font-medium text-zinc-300 underline decoration-zinc-600 decoration-dotted underline-offset-4">
          {label}
        </label>
      </Tooltip>
      {children}
      {note && <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{note}</p>}
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
    <div role="radiogroup" aria-label={name} className="flex rounded-md border border-zinc-700 bg-zinc-950 p-0.5">
      {options.map((option) => (
        <Tooltip key={option.value} title={option.label} description={option.description} className="flex flex-1">
          <button
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
              value === option.value ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {option.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

export const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-accent'
