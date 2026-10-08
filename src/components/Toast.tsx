import { CircleAlert, CircleCheck, X } from 'lucide-react'

export interface Notice {
  message: string
  // Problems stay until dismissed; confirmations like "Copied" fade away on their own.
  tone: 'problem' | 'info'
}

const TONES = {
  problem: { box: 'border-[#f9dbaf] bg-danger-soft text-[#93370d]', icon: 'text-danger', close: 'text-[#b54708] hover:bg-[#fdead7]' },
  info: { box: 'border-[#c7d5ff] bg-accent-soft text-[#1d3fb8]', icon: 'text-accent', close: 'text-accent hover:bg-[#dce5ff]' },
}

export function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const tone = TONES[notice.tone]
  const Icon = notice.tone === 'problem' ? CircleAlert : CircleCheck
  return (
    <div
      role={notice.tone === 'problem' ? 'alert' : 'status'}
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-xl border py-3 pl-4 pr-3 text-sm shadow-float ${tone.box}`}
    >
      <Icon size={18} className={`mt-px shrink-0 ${tone.icon}`} />
      <span className="max-w-md">{notice.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone.close}`}
      >
        <X size={15} />
      </button>
    </div>
  )
}
