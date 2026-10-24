import { useMemo, useState, type ReactNode } from 'react'
import { hasCurve, type Adjustments } from '../editor/adjust.ts'
import { matchColors } from '../editor/matchColors.ts'
import { photosToMatch, picturePixels } from '../editor/matchSources.ts'
import type { EditorDocument, Layer } from '../editor/types.ts'
import { MatchColors, type MatchChoice } from './MatchColors.tsx'

interface MatchState {
  doc: EditorDocument | null
  // The layer being adjusted.
  layer: Layer | undefined
  // A small copy of its pixels as they are, before adjusting.
  sample: Uint8ClampedArray | null
  settings: Adjustments
  onChange: (settings: Adjustments) => void
}

// Everything "Match another photo" needs, ready to show in the Adjust panel.
export function useMatchColors({ doc, layer, sample, settings, onChange }: MatchState): ReactNode {
  const [picked, setPicked] = useState<{ layerId: string; choice: MatchChoice } | null>(null)
  const photos = useMemo(
    () => (doc && layer ? photosToMatch(doc, layer.id) : []),
    // Only the layers and the design's size matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.layers, doc?.width, doc?.height, layer],
  )
  // A choice holds while its photo is still there and the curves it made haven't been reset.
  const holds = !!picked && picked.layerId === layer?.id && (hasCurve(settings) || picked.choice.amount === 0) && photos.some((p) => p.id === picked.choice.id)
  const choice = holds ? picked!.choice : null
  const onMatch = (next: MatchChoice) => {
    const photo = photos.find((p) => p.id === next.id)
    if (!photo || !sample || !layer) return
    setPicked({ layerId: layer.id, choice: next })
    onChange({ ...settings, ...matchColors(sample, picturePixels(photo.picture), next.amount) })
  }
  return <MatchColors photos={photos} choice={choice} onMatch={onMatch} />
}
