import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { deleteDesign, type SavedDesign } from '../editor/library.ts'
import { describeEdited } from '../editor/time.ts'
import { Dialog } from './Dialog.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Button } from './ui.tsx'

// Gray and white squares behind the preview, so see-through parts look see-through.
const CHECKER: CSSProperties = {
  background: 'repeating-conic-gradient(#e8eaee 0% 25%, #ffffff 0% 50%) 50% / 12px 12px',
}

function Preview({ design }: { design: SavedDesign }) {
  const ref = useRef<HTMLImageElement>(null)

  // The picture lives in the browser's storage; it's shown through a short-lived address.
  useEffect(() => {
    const url = URL.createObjectURL(design.thumbnail)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [design.thumbnail])

  return (
    <div className="relative aspect-[16/10] border-b border-line bg-subtle">
      {/* Placed on top of the box, so tall designs can't stretch it. */}
      <div className="absolute inset-2.5 flex items-center justify-center">
        <img ref={ref} alt="" className="max-h-full max-w-full rounded-[3px] shadow-sm" style={CHECKER} />
      </div>
    </div>
  )
}

// One row shows at first, so the ways to start something new stay in sight.
const FIRST_ROW = 4

interface YourDesignsProps {
  designs: SavedDesign[]
  // When the list was read, for "Edited 5 minutes ago".
  now: number
  onOpen: (design: SavedDesign) => Promise<void>
  onChanged: () => void
}

export function YourDesigns({ designs, now, onOpen, onChanged }: YourDesignsProps) {
  const [opening, setOpening] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<SavedDesign | null>(null)
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? designs : designs.slice(0, FIRST_ROW)

  async function open(design: SavedDesign) {
    if (opening) return
    setOpening(design.id)
    try {
      await onOpen(design)
    } finally {
      setOpening(null)
    }
  }

  return (
    <section aria-labelledby="your-designs" className="mt-9">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="your-designs" className="text-[15px] font-semibold tracking-tight text-ink">
          Your designs
        </h2>
        <Tooltip
          side="top"
          title="Kept in this browser"
          description="Everything you make is kept here automatically as you work. To keep a copy somewhere else, or to move a design to another computer, download it as a Project."
        >
          <span className="cursor-help text-xs text-ink-3">Kept in this browser</span>
        </Tooltip>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((design) => (
          <li key={design.id} className="relative">
            <Tooltip
              title={design.name}
              description={`Open it to keep working. ${design.width} × ${design.height} pixels, with all its layers.`}
              className="flex"
            >
              <button
                type="button"
                aria-label={`Open ${design.name}`}
                aria-busy={opening === design.id || undefined}
                onClick={() => void open(design)}
                className="flex w-full flex-col overflow-hidden rounded-card border border-line bg-surface text-left shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-float aria-busy:cursor-wait"
              >
                <Preview design={design} />
                <span className="block px-3 pb-3 pt-2.5">
                  <span className="block truncate pr-1 text-sm font-medium text-ink">{design.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">
                    {opening === design.id ? 'Opening…' : describeEdited(design.updatedAt, now)}
                  </span>
                </span>
              </button>
            </Tooltip>
            <Tooltip side="top" title="Delete" description="Remove this design from this browser. You'll be asked first." className="absolute right-2 top-2">
              <button
                type="button"
                aria-label={`Delete ${design.name}`}
                onClick={() => setDeleting(design)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface/95 text-ink-3 shadow-sm transition-colors hover:border-[#f9dbaf] hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      {designs.length > FIRST_ROW && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? 'Show fewer' : `Show all ${designs.length} designs`}
          </Button>
        </div>
      )}

      {deleting && (
        <Dialog
          title={`Delete “${deleting.name}”?`}
          subtitle="It will be removed from this browser for good. Project files you downloaded are not affected."
          submitLabel="Delete design"
          cancelLabel="Keep it"
          danger
          onSubmit={() => {
            setDeleting(null)
            // The card goes once the browser has really removed the design, not before.
            deleteDesign(deleting.id).then(onChanged, onChanged)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  )
}
