import { useMemo, useState } from 'react'
import { countFound, type FindOptions } from '../editor/findReplace.ts'
import { pageCount } from '../editor/pages.ts'
import type { EditorDocument } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import { Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'

interface FindDialogProps {
  doc: EditorDocument
  onChange: (find: string, replacement: string, options: FindOptions) => void
  onClose: () => void
}

function Check({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium text-ink">{label}</span>
        <span className="block text-ink-2">{help}</span>
      </span>
    </label>
  )
}

// Find and change words (pro: Find/Change): finds words in every text and table on every page, says
// how many there are and where, and changes them all at once.
export function FindDialog({ doc, onChange, onClose }: FindDialogProps) {
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState<FindOptions>({ matchCase: false, wholeWords: false })
  const found = useMemo(() => countFound(doc, find, options), [doc, find, options])
  const several = pageCount(doc) > 1

  let note = t('Type the words to look for.')
  if (find) {
    if (found.count === 0) note = t('Not found in any text or table.')
    else if (!several) note = found.count === 1 ? t('Found once.') : t('Found {count} times.', { count: found.count })
    else {
      const pages = found.pages.map((p) => p + 1).join(', ')
      note = found.count === 1 ? t('Found once, on page {pages}.', { pages }) : t('Found {count} times, on pages {pages}.', { count: found.count, pages })
    }
  }

  return (
    <Dialog
      title={t('Find and change words')}
      subtitle={t('Changes words in every text and table, on every page, at once. Words keep their font and color.')}
      submitLabel={found.count > 1 ? t('Change all {count}', { count: found.count }) : t('Change')}
      submitDisabled={found.count === 0}
      onSubmit={() => onChange(find, replacement, options)}
      onClose={onClose}
    >
      <Field label={t('Find')} help={t('The words to look for. Hebrew, Yiddish and English all work.')} note={note}>
        <input data-autofocus dir="auto" aria-label={t('Find')} className={inputClass} value={find} onChange={(e) => setFind(e.target.value)} />
      </Field>
      <Field label={t('Change to')} help={t('What to put in their place. Leave it empty to take the words out.')}>
        <input dir="auto" aria-label={t('Change to')} className={inputClass} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      </Field>
      <div className="space-y-2.5 px-0.5">
        <Check
          label={t('Whole words only')}
          help={t('“art” finds “art”, but not the “art” inside “party”.')}
          checked={options.wholeWords}
          onChange={(wholeWords) => setOptions({ ...options, wholeWords })}
        />
        <Check
          label={t('Same capital letters')}
          help={t('“Rose” finds “Rose”, but not “rose”.')}
          checked={options.matchCase}
          onChange={(matchCase) => setOptions({ ...options, matchCase })}
        />
      </div>
    </Dialog>
  )
}
