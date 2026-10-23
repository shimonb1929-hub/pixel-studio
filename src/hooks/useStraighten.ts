import { useMemo, useState } from 'react'
import { replaceLayer } from '../editor/layers.ts'
import type { LayerOverride } from '../editor/render.ts'
import { boxedLayer, photoTilt, previewCopy, straightenLayer } from '../editor/smartPhoto.ts'
import { MAX_TILT } from '../editor/straighten.ts'
import { levelingTurn } from '../editor/straightenBox.ts'
import type { PixelLayer } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import type { Editor } from './useEditor.ts'

// Straighten (pro: Auto Straighten): finds how far the picked photo leans and shows it turned level,
// with a slider to fine-tune the turn. Nothing changes until Apply, which is one undo step; Esc or
// Cancel leaves the photo as it was.

// Previews turn a smaller copy, so the slider follows the hand even on a big photo.
const PREVIEW_SIDE = 1600

interface Session {
  // The photo as it was when Straighten started. If it changes underneath (undo, another page),
  // the session is over.
  layer: PixelLayer
  // The turn that makes its lines level, or null when no clear lines were found.
  found: number | null
  degrees: number
  preview: HTMLCanvasElement
}

export interface StraightenPanelState {
  name: string
  // The turn found, in degrees, or null when no clear lines were found.
  found: number | null
  degrees: number
  maxDegrees: number
  onDegrees: (degrees: number) => void
  apply: () => void
  cancel: () => void
}

export function useStraighten(editor: Editor, onProblem: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const doc = editor.doc
  // Still the same photo, on the design that's open now.
  const live = session && doc?.layers.find((l) => l.id === session.layer.id) === session.layer ? session : null

  // Looks for the photo's lines (in the background), then shows it turned level.
  async function start(layerId: string): Promise<void> {
    const d = editor.getDoc()
    const layer = d?.layers.find((l) => l.id === layerId)
    if (!d || !layer) return
    const boxed = layer.kind === 'raster' ? boxedLayer(layer) : null
    if (layer.kind !== 'raster' || !boxed) {
      onProblem(t('Pick a photo first: click it on your design.'))
      return
    }
    // A locked photo (an opened one starts locked) can still be straightened: it's asked for on purpose.
    const tilt = await photoTilt(layer)
    // Only if the photo is still there, unchanged, by the time the lines are found.
    if (editor.getDoc()?.layers.find((l) => l.id === layerId) !== layer) return
    const found = tilt ? Math.round(levelingTurn(boxed.box, tilt.angle) * 10) / 10 : null
    setSession({ layer, found: found === 0 ? 0 : found, degrees: found ?? 0, preview: previewCopy(boxed.canvas, PREVIEW_SIDE) })
  }

  function apply(): void {
    const d = editor.getDoc()
    if (!live || !d) return setSession(null)
    if (live.degrees !== 0) {
      const next = straightenLayer(live.layer, live.degrees, d)
      editor.change(t('Straighten'), (doc) => replaceLayer(doc, next), { bytes: next.canvas !== live.layer.canvas ? next.canvas.width * next.canvas.height * 4 : 0 })
    }
    setSession(null)
  }

  const override = useMemo((): LayerOverride | null => {
    if (!live || live.degrees === 0 || !doc) return null
    return { layerId: live.layer.id, layer: straightenLayer(live.layer, live.degrees, doc, live.preview) }
  }, [live, doc])

  const panel: StraightenPanelState | null = live
    ? {
        name: live.layer.name,
        found: live.found,
        degrees: live.degrees,
        maxDegrees: MAX_TILT,
        onDegrees: (degrees) => setSession({ ...live, degrees: Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.round(degrees * 10) / 10)) }),
        apply,
        cancel: () => setSession(null),
      }
    : null

  return {
    start,
    panel,
    override,
    // True while a turn waits to be applied.
    pending: !!live,
    apply,
    cancel: () => setSession(null),
  }
}
