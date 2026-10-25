import { useMemo, useState } from 'react'
import { faceFront, fitToCorners, frontStart, photoCorners, type CornerMode } from '../editor/cornerPhoto.ts'
import { isConvex, type Quad } from '../editor/corners.ts'
import { replaceLayer } from '../editor/layers.ts'
import type { LayerOverride } from '../editor/render.ts'
import { boxedLayer, previewCopy } from '../editor/smartPhoto.ts'
import type { TransformBox } from '../editor/transform.ts'
import type { PixelLayer, Point } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import type { Editor } from './useEditor.ts'

// Move the corners (pro: Distort, Perspective, Perspective Crop): four dots on the picked photo.
// "Fit to a place" moves the photo's own corners, so it sits on a sign, a screen or the side of a
// box as if it were really there. "Face front" puts the dots on the corners of something
// photographed at a slant (a page, a sign, a painting) and makes it flat and square. Either way you
// see it while you drag, and nothing changes until Apply, which is one undo step.

// Previews are made from a smaller copy, so the photo follows the hand even on a big photo.
const PREVIEW_SIDE = 1200
// The small picture of the Face front result in the card.
const THUMB_SIDE = 280

type Boxed = PixelLayer & { box: TransformBox }

interface Session {
  // The photo as it was when this started. If it changes underneath (undo, another page), it's over.
  layer: PixelLayer
  boxed: Boxed
  preview: HTMLCanvasElement
  thumb: HTMLCanvasElement
  mode: CornerMode
  // The dots, on the design, for each kind, so switching back and forth keeps what was done.
  dots: Record<CornerMode, Quad>
}

export interface CornersPanelState {
  name: string
  mode: CornerMode
  onMode: (mode: CornerMode) => void
  // The Face front result, small, to see before applying.
  result: HTMLCanvasElement | null
  changed: boolean
  reset: () => void
  apply: () => void
  cancel: () => void
}

export interface CornerDots {
  dots: Quad
  mode: CornerMode
  // Moves one dot; a move that would fold the shape over is ignored.
  onMove: (index: number, to: Point) => void
}

const same = (a: Quad, b: Quad) => a.every((p, i) => Math.abs(p.x - b[i].x) < 0.01 && Math.abs(p.y - b[i].y) < 0.01)

export function useCorners(editor: Editor, onProblem: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const doc = editor.doc
  const live = session && doc?.layers.find((l) => l.id === session.layer.id) === session.layer ? session : null

  function start(layerId: string): void {
    const layer = editor.getDoc()?.layers.find((l) => l.id === layerId)
    const boxed = layer?.kind === 'raster' ? boxedLayer(layer) : null
    if (layer?.kind !== 'raster' || !boxed) {
      onProblem(t('Pick a photo first: click it on your design.'))
      return
    }
    setSession({
      layer,
      boxed,
      preview: previewCopy(boxed.canvas, PREVIEW_SIDE),
      thumb: previewCopy(boxed.canvas, THUMB_SIDE * 2),
      mode: 'fit',
      dots: { fit: photoCorners(boxed), front: frontStart(boxed) },
    })
  }

  const changed = !!live && !same(live.dots[live.mode], live.mode === 'fit' ? photoCorners(live.boxed) : frontStart(live.boxed))

  function apply(): void {
    if (live && changed) {
      const { boxed, mode, dots } = live
      const next = mode === 'fit' ? fitToCorners(boxed, dots.fit) : faceFront(boxed, dots.front)
      editor.change(mode === 'fit' ? t('Fit to a place') : t('Face front'), (d) => replaceLayer(d, next), { bytes: next.canvas.width * next.canvas.height * 4 })
    }
    setSession(null)
  }

  // Fit to a place shows the photo bent into place on the design; Face front leaves the photo as it
  // is (the dots go on it) and shows the result small in the card.
  const override = useMemo((): LayerOverride | null => {
    if (!live || live.mode !== 'fit' || same(live.dots.fit, photoCorners(live.boxed))) return null
    return { layerId: live.layer.id, layer: fitToCorners(live.boxed, live.dots.fit, live.preview) }
  }, [live])

  const result = useMemo(() => {
    if (!live || live.mode !== 'front') return null
    const flat = faceFront(live.boxed, live.dots.front, live.thumb).canvas
    return flat
  }, [live])

  const dots: CornerDots | null = live
    ? {
        dots: live.dots[live.mode],
        mode: live.mode,
        onMove: (index, to) => {
          const next = [...live.dots[live.mode]] as Quad
          next[index] = to
          if (!isConvex(next)) return
          setSession({ ...live, dots: { ...live.dots, [live.mode]: next } })
        },
      }
    : null

  const panel: CornersPanelState | null = live
    ? {
        name: live.layer.name,
        mode: live.mode,
        onMode: (mode) => setSession({ ...live, mode }),
        result,
        changed,
        reset: () => setSession({ ...live, dots: { ...live.dots, [live.mode]: live.mode === 'fit' ? photoCorners(live.boxed) : frontStart(live.boxed) } }),
        apply,
        cancel: () => setSession(null),
      }
    : null

  return {
    start,
    panel,
    dots,
    override,
    // True while moved corners wait to be applied.
    pending: !!live,
    apply,
    cancel: () => setSession(null),
  }
}
