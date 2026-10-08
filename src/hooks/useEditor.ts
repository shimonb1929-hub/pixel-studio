import { useRef, useState } from 'react'
import { History } from '../editor/history.ts'
import { selectLayer } from '../editor/layers.ts'
import { restoreRegion, type StrokeResult } from '../editor/stroke.ts'
import type { EditorDocument, Layer } from '../editor/types.ts'

interface LayerState {
  layers: Layer[]
  activeLayerId: string
}

// What one undo step remembers: either pixels that changed on a layer, or the layer stack.
type Change =
  | { kind: 'pixels'; layerId: string; x: number; y: number; before: HTMLCanvasElement; after: HTMLCanvasElement }
  | { kind: 'layers'; before: LayerState; after: LayerState }

function mergeChanges(earlier: Change, later: Change): Change {
  return earlier.kind === 'layers' && later.kind === 'layers' ? { kind: 'layers', before: earlier.before, after: later.after } : later
}

function layerState(doc: EditorDocument): LayerState {
  return { layers: doc.layers, activeLayerId: doc.activeLayerId }
}

export interface ChangeOptions {
  // Quick repeated changes with the same key become one undo step (like dragging a slider).
  mergeKey?: string
  // Memory the change keeps alive, such as a deleted layer's pixels.
  bytes?: number
}

export interface Editor {
  doc: EditorDocument | null
  // Goes up whenever pixels change, so views know to redraw.
  revision: number
  undoLabel: string | null
  redoLabel: string | null
  isDirty: boolean
  load: (doc: EditorDocument) => void
  close: () => void
  change: (label: string, update: (doc: EditorDocument) => EditorDocument, options?: ChangeOptions) => void
  select: (layerId: string) => void
  commitStroke: (label: string, layerId: string, result: StrokeResult) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
}

export function useEditor(): Editor {
  const [doc, setDocState] = useState<EditorDocument | null>(null)
  const [revision, setRevision] = useState(0)
  const [history] = useState(() => new History<Change>(mergeChanges))
  // Handlers can run several changes in a row before React re-renders, so they read this.
  const docRef = useRef<EditorDocument | null>(null)
  const [, setHistoryVersion] = useState(0)
  const refresh = () => setHistoryVersion((v) => v + 1)

  function setDoc(next: EditorDocument | null) {
    docRef.current = next
    setDocState(next)
  }

  function apply(change: Change, side: 'before' | 'after') {
    const current = docRef.current
    if (!current) return
    if (change.kind === 'pixels') {
      const layer = current.layers.find((l) => l.id === change.layerId)
      if (layer) restoreRegion(layer.canvas, change[side], change.x, change.y)
      setRevision((r) => r + 1)
    } else {
      const state = change[side]
      setDoc({ ...current, layers: state.layers, activeLayerId: state.activeLayerId })
    }
  }

  return {
    doc,
    revision,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    isDirty: doc !== null && history.isDirty,

    load(next) {
      history.clear()
      setDoc(next)
      setRevision((r) => r + 1)
      refresh()
    },

    close() {
      history.clear()
      setDoc(null)
      refresh()
    },

    change(label, update, options = {}) {
      const current = docRef.current
      if (!current) return
      const next = update(current)
      if (next === current) return
      history.push({
        label,
        change: { kind: 'layers', before: layerState(current), after: layerState(next) },
        bytes: options.bytes ?? 0,
        mergeKey: options.mergeKey,
      })
      setDoc(next)
      refresh()
    },

    // Choosing a layer isn't something you'd want to undo, so it skips history.
    select(layerId) {
      const current = docRef.current
      if (current) setDoc(selectLayer(current, layerId))
    },

    commitStroke(label, layerId, result) {
      history.push({
        label,
        change: { kind: 'pixels', layerId, x: result.x, y: result.y, before: result.before, after: result.after },
        bytes: result.before.width * result.before.height * 4 * 2,
      })
      setRevision((r) => r + 1)
      refresh()
    },

    undo() {
      const entry = history.undo()
      if (entry) apply(entry.change, 'before')
      refresh()
    },

    redo() {
      const entry = history.redo()
      if (entry) apply(entry.change, 'after')
      refresh()
    },

    markSaved() {
      history.markSaved()
      refresh()
    },
  }
}
