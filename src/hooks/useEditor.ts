import { useRef, useState } from 'react'
import { coverRect, getContext2d } from '../editor/document.ts'
import type { Rect } from '../editor/geometry.ts'
import { History } from '../editor/history.ts'
import { selectLayer, updateLayer } from '../editor/layers.ts'
import { copyRegion, restoreRegion, type StrokeResult } from '../editor/stroke.ts'
import type { EditorDocument, Layer } from '../editor/types.ts'

// Everything about a design except its pixels, which change in place and are kept separately.
type DocState = Pick<EditorDocument, 'width' | 'height' | 'layers' | 'activeLayerId' | 'selection'>

// What one undo step remembers: pixels that changed on a layer, the design's structure, or a
// few of those together (like growing a layer and then painting on it).
type Change =
  | { kind: 'pixels'; layerId: string; x: number; y: number; before: HTMLCanvasElement; after: HTMLCanvasElement }
  | { kind: 'structure'; before: DocState; after: DocState }
  | { kind: 'compound'; changes: Change[] }

function mergeChanges(earlier: Change, later: Change): Change {
  return earlier.kind === 'structure' && later.kind === 'structure' ? { kind: 'structure', before: earlier.before, after: later.after } : later
}

function docState({ width, height, layers, activeLayerId, selection }: EditorDocument): DocState {
  return { width, height, layers, activeLayerId, selection }
}

function regionBytes(region: HTMLCanvasElement): number {
  return region.width * region.height * 4
}

export interface ChangeOptions {
  // Quick repeated changes with the same key become one undo step (like dragging a slider).
  mergeKey?: string
  // Memory the change keeps alive, such as a deleted layer's pixels.
  bytes?: number
}

export interface Editor {
  doc: EditorDocument | null
  // The design right now, including changes made earlier in the same event, before React re-renders.
  getDoc: () => EditorDocument | null
  // Goes up whenever pixels change, so views know to redraw.
  revision: number
  undoLabel: string | null
  redoLabel: string | null
  isDirty: boolean
  load: (doc: EditorDocument) => void
  close: () => void
  change: (label: string, update: (doc: EditorDocument) => EditorDocument, options?: ChangeOptions) => void
  select: (layerId: string) => void
  // A finished brush stroke. `grown` is the layer it was painted on, if it had to be enlarged first.
  commitStroke: (label: string, layerId: string, result: StrokeResult, grown?: Layer) => void
  // Changes pixels of a layer inside `area` (design coordinates), growing the layer if needed.
  paint: (label: string, layerId: string, area: Rect, draw: (ctx: CanvasRenderingContext2D, layer: Layer) => void) => void
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
    if (change.kind === 'compound') {
      const steps = side === 'before' ? [...change.changes].reverse() : change.changes
      for (const step of steps) apply(step, side)
      return
    }
    const current = docRef.current
    if (!current) return
    if (change.kind === 'pixels') {
      const layer = current.layers.find((l) => l.id === change.layerId)
      if (layer) restoreRegion(layer.canvas, change[side], change.x, change.y)
      setRevision((r) => r + 1)
    } else {
      setDoc({ ...current, ...change[side] })
    }
  }

  // Swaps a layer for its enlarged copy and returns the undo step for it, if it changed.
  function growLayer(layerId: string, grown: Layer): Change | null {
    const current = docRef.current
    const layer = current?.layers.find((l) => l.id === layerId)
    if (!current || !layer || layer === grown) return null
    const next = updateLayer(current, layerId, { canvas: grown.canvas, x: grown.x, y: grown.y })
    setDoc(next)
    return { kind: 'structure', before: docState(current), after: docState(next) }
  }

  return {
    doc,
    getDoc: () => docRef.current,
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
        change: { kind: 'structure', before: docState(current), after: docState(next) },
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

    commitStroke(label, layerId, result, grown) {
      const pixels: Change = { kind: 'pixels', layerId, x: result.x, y: result.y, before: result.before, after: result.after }
      const growth = grown ? growLayer(layerId, grown) : null
      history.push({
        label,
        change: growth ? { kind: 'compound', changes: [growth, pixels] } : pixels,
        bytes: regionBytes(result.before) * 2 + (growth && grown ? regionBytes(grown.canvas) : 0),
      })
      setRevision((r) => r + 1)
      refresh()
    },

    paint(label, layerId, area, draw) {
      const current = docRef.current
      const original = current?.layers.find((l) => l.id === layerId)
      if (!current || !original) return
      const layer = coverRect(original, area)
      const growth = growLayer(layerId, layer)
      // Only the part of the layer inside the area can change, so only that part is kept for undo.
      const local = {
        x: Math.max(0, Math.floor(area.x - layer.x)),
        y: Math.max(0, Math.floor(area.y - layer.y)),
        width: 0,
        height: 0,
      }
      local.width = Math.min(layer.canvas.width, Math.ceil(area.x + area.width - layer.x)) - local.x
      local.height = Math.min(layer.canvas.height, Math.ceil(area.y + area.height - layer.y)) - local.y
      if (local.width <= 0 || local.height <= 0) return
      const before = copyRegion(layer.canvas, local)
      const ctx = getContext2d(layer.canvas)
      ctx.save()
      draw(ctx, layer)
      ctx.restore()
      const after = copyRegion(layer.canvas, local)
      const pixels: Change = { kind: 'pixels', layerId, x: local.x, y: local.y, before, after }
      history.push({
        label,
        change: growth ? { kind: 'compound', changes: [growth, pixels] } : pixels,
        bytes: regionBytes(before) * 2 + (growth ? regionBytes(layer.canvas) : 0),
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
