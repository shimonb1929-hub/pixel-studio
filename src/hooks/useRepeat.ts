import { useMemo, useState } from 'react'
import { frameOf } from '../editor/arrange.ts'
import { makeCopies, startingRepeat, type RepeatSettings } from '../editor/repeat.ts'
import type { EditorDocument } from '../editor/types.ts'
import type { RepeatPanelState } from '../components/RepeatPanel.tsx'
import { isRtl, t } from '../i18n/i18n.ts'
import type { Editor } from './useEditor.ts'

// Make copies (pro: Repeat): shows copies of what is picked on the design while the settings
// change. Nothing changes until Apply, which is one undo step; Esc or Cancel leaves the design as
// it was.

interface Session {
  // The design the copies are shown on. Once it changes underneath (undo, another page), the
  // session is over.
  base: EditorDocument
  ids: string[]
  name: string
  side: number
  settings: RepeatSettings
}

export function useRepeat(editor: Editor, onProblem: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const doc = editor.doc
  const live = session && session.base === doc ? session : null

  const make = (d: EditorDocument, s: Session) => makeCopies(d, s.ids, s.settings, t('Copies of {name}', { name: s.name }), isRtl())

  // While only shown, the original stays the picked thing, so its handles stay where they were.
  const shown = useMemo(() => (live && doc ? { ...make(doc, live), activeLayerId: doc.activeLayerId } : null), [live, doc])

  function start(ids: string[]): void {
    const d = editor.getDoc()
    const chosen = d?.layers.filter((l) => ids.includes(l.id) && l.visible) ?? []
    const frame = frameOf(chosen)
    if (!d || !frame) {
      onProblem(t('Pick something on your design first.'))
      return
    }
    // Kept together: called by the group's name; otherwise by the top thing's.
    const top = chosen[chosen.length - 1]
    const name = top.group && chosen.every((l) => l.group?.id === top.group?.id) ? top.group.name : top.name
    setSession({ base: d, ids: chosen.map((l) => l.id), name, side: Math.max(Math.abs(frame.width), Math.abs(frame.height), 1), settings: startingRepeat(frame) })
  }

  // Keeps the copies. True when they were made.
  function apply(): boolean {
    setSession(null)
    if (!live) return false
    editor.change(t('Make copies'), (d) => make(d, live))
    return true
  }

  const panel: RepeatPanelState | null = live
    ? {
        settings: live.settings,
        side: live.side,
        onChange: (settings) => setSession({ ...live, settings }),
        apply: () => void apply(),
        cancel: () => setSession(null),
      }
    : null

  return { pending: !!live, shown, panel, start, apply, cancel: () => setSession(null) }
}
