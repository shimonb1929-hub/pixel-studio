import { useState } from 'react'
import { Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'
import { t } from '../i18n/i18n.ts'

interface RenameDialogProps {
  name: string
  onRename: (name: string) => void
  onClose: () => void
}

export function RenameDialog({ name, onRename, onClose }: RenameDialogProps) {
  const [draft, setDraft] = useState(name)
  const trimmed = draft.trim()

  return (
    <Dialog
      title={t("Rename design")}
      subtitle={t("Give your design a name you'll recognize later.")}
      submitLabel={t("Rename")}
      submitDisabled={!trimmed}
      onSubmit={() => onRename(trimmed)}
      onClose={onClose}
    >
      <Field
        label={t("Name")}
        htmlFor="rename-design"
        help={t("What your design is called. You'll see it under Your designs on the start screen, and it becomes the file name when you download it.")}
        note={trimmed ? undefined : <span className="text-danger">{t('Type a name.')}</span>}
      >
        <input
          id="rename-design"
          data-autofocus
          className={inputClass}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </Field>
    </Dialog>
  )
}
