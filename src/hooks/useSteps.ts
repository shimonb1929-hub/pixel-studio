import { useMemo, useState } from 'react'
import { addSteps, stepPair } from '../editor/blend.ts'
import type { EditorDocument } from '../editor/types.ts'
import type { StepsPanelState } from '../components/StepsPanel.tsx'
import { t } from '../i18n/i18n.ts'
import type { Editor } from './useEditor.ts'

// Steps between two shapes (pro: Blend): shows the steps on the design while their number changes.
// Nothing changes until Apply, which is one undo step; Esc or Cancel leaves the design as it was.

interface Session {
  // The design the steps are shown on. Once it changes underneath (undo, another page), the
  // session is over.
  base: EditorDocument
  pair: [string, string]
  names: [string, string]
  steps: number
}

const START_STEPS = 6

export function useSteps(editor: Editor, onProblem: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const doc = editor.doc
  const live = session && session.base === doc ? session : null

  const make = (d: EditorDocument, s: Session) => addSteps(d, s.pair, s.steps, t('Step'), t('Steps between {first} and {second}', { first: s.names[0], second: s.names[1] }))

  // While only shown, the picked shapes stay picked, so their handles stay where they were.
  const shown = useMemo(() => (live && doc ? { ...make(doc, live), activeLayerId: doc.activeLayerId } : null), [live, doc])

  function start(ids: string[]): void {
    const d = editor.getDoc()
    const pair = d && stepPair(d, ids)
    if (!d || !pair) {
      onProblem(t('Pick two shapes first: hold Shift and click both.'))
      return
    }
    const names = pair.map((id) => d.layers.find((l) => l.id === id)?.name ?? '') as [string, string]
    setSession({ base: d, pair, names, steps: START_STEPS })
  }

  // Keeps the steps. True when they were made.
  function apply(): boolean {
    setSession(null)
    if (!live) return false
    editor.change(t('Steps between'), (d) => make(d, live))
    return true
  }

  const panel: StepsPanelState | null = live
    ? {
        steps: live.steps,
        onChange: (steps) => setSession({ ...live, steps }),
        apply: () => void apply(),
        cancel: () => setSession(null),
      }
    : null

  return { pending: !!live, shown, panel, start, apply, cancel: () => setSession(null) }
}
