import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { saveDesign, StorageError } from '../editor/library.ts'
import { pixelVersion } from '../editor/pixelVersion.ts'
import { designThumbnail, encodeProject } from '../editor/project.ts'
import type { EditorDocument } from '../editor/types.ts'
import type { Editor } from './useEditor.ts'

// 'unsaved' means there are changes waiting to be saved in a moment.
export type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'failed'

export const SAVE_DELAY_MS = 1000
export const MAX_SAVE_WAIT_MS = 8000

// Saves a moment after the last change, but never later than a few seconds after the first
// unsaved one, so a long drawing session without pauses is still kept along the way.
export function saveDelay(firstUnsavedAt: number, now: number): number {
  return Math.max(0, Math.min(SAVE_DELAY_MS, firstUnsavedAt + MAX_SAVE_WAIT_MS - now))
}

// What the design looked like when it was last saved (or opened): the design itself, and the
// pixel version of each layer, since painting changes layers without changing the design object.
interface Snapshot {
  doc: EditorDocument
  versions: number[]
}

function snapshot(doc: EditorDocument): Snapshot {
  return { doc, versions: doc.layers.map((layer) => pixelVersion(layer.canvas)) }
}

function sameAs(doc: EditorDocument, kept: Snapshot | null): boolean {
  return kept !== null && kept.doc === doc && doc.layers.every((layer, i) => pixelVersion(layer.canvas) === kept.versions[i])
}

// True if only the chosen layer differs, which on its own isn't a reason to start keeping a design.
function onlyLayerChoiceChanged(doc: EditorDocument, kept: Snapshot): boolean {
  const before = kept.doc
  return (
    doc.layers === before.layers &&
    doc.selection === before.selection &&
    doc.name === before.name &&
    doc.width === before.width &&
    doc.height === before.height &&
    doc.layers.every((layer, i) => pixelVersion(layer.canvas) === kept.versions[i])
  )
}

export interface Autosave {
  // Null while there is nothing to keep yet: a new design nobody has changed.
  status: SaveStatus | null
  // Why the last save didn't work, in plain words.
  problem: string | null
  // Starts keeping a design that was just shown. `stored` means it is already kept in the browser.
  start: (doc: EditorDocument, stored: boolean) => void
  // Saves any changes right away. Resolves to false if they couldn't be kept.
  flush: () => Promise<boolean>
  // Stops keeping the design (it was closed).
  stop: () => void
}

export function useAutosave(editor: Editor): Autosave {
  const [status, setStatus] = useState<SaveStatus | null>(null)
  const statusRef = useRef(status)
  useLayoutEffect(() => {
    statusRef.current = status
  })
  const [problem, setProblem] = useState<string | null>(null)
  const editorRef = useRef(editor)
  useLayoutEffect(() => {
    editorRef.current = editor
  })
  const activeIdRef = useRef<string | null>(null)
  const keptRef = useRef<Snapshot | null>(null)
  const savingRef = useRef<Promise<boolean> | null>(null)
  const timerRef = useRef<number | null>(null)
  const firstUnsavedAtRef = useRef<number | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function current(): EditorDocument | null {
    const doc = editorRef.current.getDoc()
    return doc && doc.id === activeIdRef.current ? doc : null
  }

  function schedule() {
    const now = Date.now()
    firstUnsavedAtRef.current ??= now
    clearTimer()
    timerRef.current = window.setTimeout(() => void save(), saveDelay(firstUnsavedAtRef.current, now))
  }

  // Saves the design as it is right now. Resolves to whether that worked.
  async function save(): Promise<boolean> {
    clearTimer()
    // One save at a time, so an older version can never be written after a newer one.
    while (savingRef.current) await savingRef.current
    const doc = current()
    if (!doc || sameAs(doc, keptRef.current)) return true
    const saving = snapshot(doc)
    firstUnsavedAtRef.current = null
    setStatus('saving')
    const job = (async () => {
      try {
        const [project, thumbnail] = await Promise.all([encodeProject(doc), designThumbnail(doc)])
        await saveDesign({ id: doc.id, name: doc.name, width: doc.width, height: doc.height, updatedAt: Date.now(), thumbnail }, project)
        return true
      } catch (error) {
        setProblem(error instanceof StorageError ? error.message : "Your latest changes couldn't be kept in this browser.")
        return false
      }
    })()
    savingRef.current = job
    const ok = await job
    savingRef.current = null
    // The design may have been closed or switched while saving.
    if (activeIdRef.current !== doc.id) return ok
    if (!ok) {
      setStatus('failed')
      return false
    }
    keptRef.current = saving
    setProblem(null)
    const now = current()
    if (now && !sameAs(now, saving)) {
      setStatus('unsaved')
      if (timerRef.current === null) schedule()
    } else {
      setStatus('saved')
    }
    return true
  }

  async function flush(): Promise<boolean> {
    // Keep going until what is on screen is what is saved, in case changes arrive meanwhile.
    for (let attempt = 0; attempt < 5; attempt++) {
      const doc = current()
      if (!doc || sameAs(doc, keptRef.current)) return true
      if (!(await save())) return false
    }
    return false
  }

  // Every change to the design (or its pixels) schedules a save.
  useEffect(() => {
    const doc = current()
    if (!doc || !keptRef.current || sameAs(doc, keptRef.current)) return
    // A design nobody has changed yet isn't kept just because another layer was picked.
    if (statusRef.current === null && onlyLayerChoiceChanged(doc, keptRef.current)) {
      keptRef.current = snapshot(doc)
      return
    }
    setStatus((s) => (s === 'saving' ? s : 'unsaved'))
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.doc, editor.revision])

  // Switching to another tab or closing the window saves right away, without waiting.
  useEffect(() => {
    const saveNow = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', saveNow)
    window.addEventListener('pagehide', saveNow)
    return () => {
      document.removeEventListener('visibilitychange', saveNow)
      window.removeEventListener('pagehide', saveNow)
      clearTimer()
    }
    // flush only reads refs, so the first one stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status,
    problem,

    start(doc, stored) {
      clearTimer()
      activeIdRef.current = doc.id
      keptRef.current = snapshot(doc)
      firstUnsavedAtRef.current = null
      setStatus(stored ? 'saved' : null)
      setProblem(null)
    },

    flush,

    stop() {
      clearTimer()
      activeIdRef.current = null
      keptRef.current = null
      firstUnsavedAtRef.current = null
      setStatus(null)
      setProblem(null)
    },
  }
}
