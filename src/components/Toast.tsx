import { CircleAlert, X } from 'lucide-react'

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-xl border border-[#f9dbaf] bg-danger-soft py-3 pl-4 pr-3 text-sm text-[#93370d] shadow-float"
    >
      <CircleAlert size={18} className="mt-px shrink-0 text-danger" />
      <span className="max-w-md">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#b54708] hover:bg-[#fdead7]"
      >
        <X size={15} />
      </button>
    </div>
  )
}
