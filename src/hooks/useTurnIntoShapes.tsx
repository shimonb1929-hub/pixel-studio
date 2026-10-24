import { useState, type ReactNode } from 'react'
import { TraceDialog } from '../components/TraceDialog.tsx'
import type { TraceResult } from '../editor/trace.ts'
import { placeTraced, traceGroup, tracedShapes } from '../editor/traceLayers.ts'
import { t } from '../i18n/i18n.ts'
import type { Editor } from './useEditor.ts'

// Turn into shapes (pro: Image Trace): opens the window for a picked photo or drawing, and puts the
// shapes in the design as one undo step when they're kept.
export function useTurnIntoShapes(
  editor: Editor,
  messages: { problem: (message: string) => void; inform: (message: string) => void },
  // Picks the new shapes.
  onDone: (ids: string[]) => void,
): { open: (layerId: string) => void; dialog: ReactNode } {
  const [layerId, setLayerId] = useState<string | null>(null)
  const layer = layerId ? editor.doc?.layers.find((l) => l.id === layerId) : undefined

  function apply(result: TraceResult) {
    setLayerId(null)
    const now = editor.getDoc()?.layers.find((l) => l.id === layerId)
    if (!now || now.kind !== 'raster') return
    if (result.colors.length === 0) return messages.problem(t('Nothing to turn into shapes with these choices. Try another setting.'))
    const one = result.colors.length === 1
    const shapes = tracedShapes(result, now, traceGroup(t('Traced picture')), (n) => (one ? t('Traced picture') : t('Color {number}', { number: n })))
    editor.change(t('Turn into shapes'), (d) => placeTraced(d, now.id, shapes))
    onDone(shapes.map((s) => s.id))
    messages.inform(t('Your picture is now shapes. The picture itself is hidden below them, in case you want it back.'))
  }

  return {
    open: (id) => {
      const found = editor.getDoc()?.layers.find((l) => l.id === id)
      if (found?.kind === 'raster') setLayerId(id)
      else messages.problem(t('Pick a photo or a drawing first: click it on your design.'))
    },
    dialog: layer?.kind === 'raster' && <TraceDialog name={layer.name} source={layer.canvas} onApply={apply} onClose={() => setLayerId(null)} />,
  }
}
