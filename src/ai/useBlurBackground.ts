import { useDeferredValue, useMemo, useRef, useState } from 'react'
import type { Notice } from '../components/Toast.tsx'
import type { Editor } from '../hooks/useEditor.ts'
import { replaceLayer } from '../editor/layers.ts'
import { layerVersion } from '../editor/pixelVersion.ts'
import type { LayerOverride } from '../editor/render.ts'
import type { Layer, PixelLayer } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import { DEFAULT_BACKGROUND_BLUR, usableSubject } from './blurBackground.ts'
import { blurPreviewScale, findMainThing, renderBlurredBackground } from './blurBackgroundRender.ts'
import { onAiProgress, type FoundMask } from './segment.ts'

// Blur the background, from pressing the button to Apply or Cancel: the AI finds the main thing
// once, then the slider shows the blur live on the design, and Apply keeps it as one undo step.
// Nothing changes until Apply; Esc, another tool or another layer cancels.

export interface BlurBackgroundControls {
  name: string
  // 0 to 1.
  amount: number
  onAmount: (amount: number) => void
  apply: () => void
  cancel: () => void
}

interface Session {
  layerId: string
  // The photo's pixels when it started; if they change, the session ends.
  source: HTMLCanvasElement
  found: FoundMask
  amount: number
}

interface Options {
  editor: Editor
  // The picked layer right now.
  active: Layer | undefined
  // Whether the bar that shows the slider is showing (the Arrange tool).
  showing: boolean
  setNotice: (notice: Notice | null) => void
}

// A number that stands for one photo's pixels, so the AI knows when it's the same photo.
const photoIds = new WeakMap<HTMLCanvasElement, number>()
let nextPhotoId = 1
function photoKey(layer: PixelLayer): string {
  let id = photoIds.get(layer.canvas)
  if (!id) photoIds.set(layer.canvas, (id = nextPhotoId++))
  return `blur:${id}:${layerVersion(layer)}`
}

export function useBlurBackground({ editor, active, showing, setNotice }: Options) {
  const [session, setSession] = useState<Session | null>(null)
  // Set while the AI is looking, so a second press doesn't start it again.
  const finding = useRef<string | null>(null)

  // The session only lasts while its photo is picked, unchanged, with the Arrange bar showing.
  const live =
    session && showing && active?.id === session.layerId && active.kind === 'raster' && active.canvas === session.source ? session : null
  // Once it ends it's gone for good, so coming back to the photo later doesn't bring it back.
  // (Set while rendering, as React allows for state that follows from other state.)
  if (session && !live) setSession(null)

  // The preview may lag a moment behind the slider, so the slider itself never stutters.
  const amount = useDeferredValue(live?.amount ?? 0)
  const preview = useMemo(() => {
    if (!live) return null
    const scale = blurPreviewScale(live.source)
    return { canvas: renderBlurredBackground(live.source, live.found, amount, scale, true), scale }
  }, [live?.source, live?.found, amount]) // eslint-disable-line react-hooks/exhaustive-deps

  const override: LayerOverride | null = (() => {
    if (!live || !preview || active?.kind !== 'raster') return null
    if (preview.scale === 1) return { layerId: active.id, layer: { ...active, canvas: preview.canvas } }
    // A smaller preview is stretched over the photo's place, exactly as a resized photo is.
    const { width, height } = live.source
    const box = active.box ?? { cx: active.x + width / 2, cy: active.y + height / 2, width, height, rotation: 0 }
    return { layerId: active.id, layer: { ...active, canvas: preview.canvas, box } }
  })()

  async function start(layerId: string) {
    const layer = editor.getDoc()?.layers.find((l) => l.id === layerId)
    if (!layer || layer.kind !== 'raster' || finding.current === layerId) return
    finding.current = layerId
    const source = layer.canvas
    setNotice({ message: t('Finding the main thing…'), tone: 'info' })
    const stop = onAiProgress((share) =>
      setNotice({ message: t('Getting the AI ready. This happens only the first time: {percent}%', { percent: Math.round(share * 100) }), tone: 'info' }),
    )
    try {
      const found = await findMainThing(source, photoKey(layer))
      if (!usableSubject(found.mask)) {
        setNotice({ message: t('The AI could not tell what the main thing in this photo is, so there is nothing to keep sharp.'), tone: 'problem' })
        return
      }
      setNotice(null)
      setSession({ layerId, source, found, amount: DEFAULT_BACKGROUND_BLUR })
    } catch {
      setNotice({ message: t("Blur the background couldn't start. Check that you're online, then try again."), tone: 'problem' })
    } finally {
      finding.current = null
      stop()
    }
  }

  // Keeps the blur, at full detail, as one undo step.
  function apply(): boolean {
    if (!live) return false
    setSession(null)
    if (live.amount <= 0) return true
    const out = renderBlurredBackground(live.source, live.found, live.amount)
    editor.change(
      t('Blur the background'),
      (doc) => {
        const now = doc.layers.find((l) => l.id === live.layerId)
        return now && now.kind === 'raster' && now.canvas === live.source ? replaceLayer(doc, { ...now, canvas: out }) : doc
      },
      { bytes: out.width * out.height * 4 },
    )
    setNotice({ message: t('Background blurred. Press Undo if you want it sharp again.'), tone: 'info' })
    return true
  }

  function cancel(): boolean {
    if (!live) return false
    setSession(null)
    return true
  }

  const controls: BlurBackgroundControls | null =
    live && active
      ? {
          name: active.name,
          amount: live.amount,
          onAmount: (value) => setSession((s) => s && { ...s, amount: value }),
          apply,
          cancel,
        }
      : null

  return { start, controls, override, apply, cancel }
}
