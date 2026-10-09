import { useState } from 'react'
import { Dialog, Field } from './Dialog.tsx'
import { inputClass } from './ui.tsx'

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
      title="Rename design"
      subtitle="Give your design a name you'll recognize later."
      submitLabel="Rename"
      submitDisabled={!trimmed}
      onSubmit={() => onRename(trimmed)}
      onClose={onClose}
    >
      <Field
        label="Name"
        htmlFor="rename-design"
        help="What your design is called. You'll see it under Your designs on the start screen, and it becomes the file name when you download it."
        note={trimmed ? undefined : <span className="text-danger">Type a name.</span>}
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
