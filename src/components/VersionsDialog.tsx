import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { listVersions, VERSION_EVERY_MS, type DesignVersion } from '../editor/library.ts'
import { describeVersion } from '../editor/time.ts'
import { t } from '../i18n/i18n.ts'
import { Dialog } from './Dialog.tsx'

// Gray and white squares behind the preview, so see-through parts look see-through.
const CHECKER: CSSProperties = {
  background: 'repeating-conic-gradient(#e8eaee 0% 25%, #ffffff 0% 50%) 50% / 12px 12px',
}

// The design's own picture of a version, from the browser's storage.
function Thumbnail({ version, className }: { version: DesignVersion; className: string }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(version.thumbnail)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [version.thumbnail])
  return <img ref={ref} alt="" className={className} style={CHECKER} />
}

interface VersionsDialogProps {
  designId: string
  onRestore: (version: DesignVersion) => void
  onClose: () => void
}

// Earlier versions: how the design looked along the way. Picking one shows it big; going back to
// it keeps how the design is now as a version too, so nothing is ever lost.
export function VersionsDialog({ designId, onRestore, onClose }: VersionsDialogProps) {
  const [versions, setVersions] = useState<DesignVersion[] | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    listVersions(designId).then(
      (found) => {
        if (!live) return
        setVersions(found)
        setChosen(found[0]?.key ?? null)
      },
      () => live && setVersions([]),
    )
    return () => {
      live = false
    }
  }, [designId])

  const picked = versions?.find((v) => v.key === chosen) ?? null
  const minutes = VERSION_EVERY_MS / 60_000
  return (
    <Dialog
      title={t('Earlier versions')}
      subtitle={t('Every {minutes} minutes of work, how the design looked is kept. Pick one to see it.', { minutes })}
      submitLabel={t('Go back to this')}
      cancelLabel={t('Close')}
      submitDisabled={!picked}
      onSubmit={() => picked && onRestore(picked)}
      onClose={onClose}
    >
      {versions === null ? (
        <p className="text-sm text-ink-2">{t('Looking…')}</p>
      ) : versions.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">{t('No earlier versions yet. They are kept as you work on the design.')}</p>
      ) : (
        <>
          <div className="flex h-48 items-center justify-center rounded-xl border border-line bg-subtle p-3">
            {picked && <Thumbnail version={picked} className="max-h-full max-w-full rounded-[3px] shadow-sm" />}
          </div>
          <div role="radiogroup" aria-label={t('Earlier versions')} className="max-h-56 space-y-1 overflow-y-auto">
            {versions.map((version) => (
              <button
                key={version.key}
                type="button"
                role="radio"
                aria-checked={version.key === chosen}
                onClick={() => setChosen(version.key)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start text-sm text-ink transition-colors hover:bg-subtle aria-checked:bg-accent-soft aria-checked:font-medium"
              >
                <span className="flex h-9 w-12 shrink-0 items-center justify-center">
                  <Thumbnail version={version} className="max-h-full max-w-full rounded-[2px]" />
                </span>
                <span dir="auto">{describeVersion(version.savedAt, now)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-ink-2">{t('Going back keeps how the design is now as a version too, so you can always return to it.')}</p>
        </>
      )}
    </Dialog>
  )
}
