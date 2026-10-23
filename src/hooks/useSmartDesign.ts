import { useMemo, useState } from 'react'
import { createId } from '../editor/document.ts'
import { matchDesignToPalette, recoloredCount, type PaletteColor } from '../editor/palette.ts'
import { applyReadableFix, neededContrast, readability, readableFixes, worstContrast, type Readability, type ReadableFix } from '../editor/readable.ts'
import { designPalette, textBackdrop } from '../editor/smartDesign.ts'
import { tidyPage } from '../editor/tidyPage.ts'
import type { EditorDocument, TextLayer } from '../editor/types.ts'
import { documentPpi } from '../editor/units.ts'
import type { Editor } from './useEditor.ts'
import { t } from '../i18n/i18n.ts'

// The design helpers: colors from the photos, matching the design to them, words that are always
// readable, and tidying the whole page. Each one shows its result on the design first; nothing
// changes until Apply, and then it is one undo step.

export interface SmartPreview {
  title: string
  description: string
  // The undo step's name.
  label: string
  // The design it was made from: once the design changes, the preview is gone.
  base: EditorDocument
  doc: EditorDocument
  // Colors to show with the description, for matching to a photo.
  colors?: string[]
}

export interface SmartDesign {
  // The main colors of the picked photo (or of every photo), darkest first.
  palette: PaletteColor[]
  paletteFromPicked: boolean
  // The picked words, when they are hard to read where they are, with ways to fix it.
  readable: { check: Readability; fixes: ReadableFix[] } | null
  preview: SmartPreview | null
  // What the design shows: a preview, or a fix being pointed at. Null shows the design itself.
  shown: EditorDocument | null
  matchDesign: () => void
  tidyPage: () => void
  // Shows the best fix for the picked words, to apply or cancel.
  makeReadable: () => void
  applyFix: (fix: ReadableFix) => void
  hoverFix: (fix: ReadableFix | null) => void
  apply: () => void
  cancel: () => void
}

export function fixName(fix: ReadableFix): string {
  if (fix.kind === 'shadow') return t('Soft shadow')
  if (fix.kind === 'backing') return t('Box behind')
  return fix.tone === 'light' ? t('White words') : fix.tone === 'dark' ? t('Dark words') : t('Photo color')
}

export function fixDescription(fix: ReadableFix): string {
  if (fix.kind === 'shadow') return t('A soft shadow around the letters makes them stand out from a busy photo (pro: drop shadow). Change it any time under Shadow, glow or outline.')
  if (fix.kind === 'backing') return t('A soft, slightly see-through box behind the words, kept together with them, so they read on any photo.')
  if (fix.tone === 'photo') return t('Color the words with a color from your photos that is easy to read here.')
  return fix.tone === 'light' ? t('Make the words white, so they stand out from what is behind them.') : t('Make the words dark, so they stand out from what is behind them.')
}

export function useSmartDesign(editor: Editor, options: { pickedId?: string; pickedText: TextLayer | null; notify: (message: string) => void }): SmartDesign {
  const { doc } = editor
  const { pickedId, pickedText, notify } = options
  const [previewState, setPreview] = useState<SmartPreview | null>(null)
  const [hovered, setHovered] = useState<{ base: EditorDocument; doc: EditorDocument } | null>(null)
  // A preview made from an older design is out of date, so it simply stops showing.
  const preview = previewState && previewState.base === doc ? previewState : null
  const hoveredDoc = hovered && hovered.base === doc ? hovered.doc : null

  const { colors: palette, picked: paletteFromPicked } = useMemo(
    () => (doc ? designPalette(doc, pickedId) : { colors: [], picked: false }),
    // The revision changes when pixels are painted, which can change a photo's colors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.layers, pickedId, editor.revision],
  )

  const readable = useMemo(() => {
    if (!doc || !pickedText || !pickedText.visible || !pickedText.text.trim()) return null
    const backdrop = textBackdrop(doc, pickedText)
    if (!backdrop) return null
    const ppi = documentPpi(doc)
    const check = readability(pickedText, backdrop, ppi)
    return check.ok ? null : { check, fixes: readableFixes(pickedText, backdrop, palette, ppi) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pickedText, palette, editor.revision])

  function withFix(d: EditorDocument, layer: TextLayer, fix: ReadableFix): EditorDocument {
    return applyReadableFix(d, layer.id, fix, { id: createId('layer'), name: t('Box behind words'), group: { id: createId('group'), name: layer.name } })
  }

  return {
    palette,
    paletteFromPicked,
    readable,
    preview,
    shown: preview?.doc ?? hoveredDoc,

    matchDesign() {
      const d = editor.getDoc()
      if (!d) return
      const colors = designPalette(d, pickedId).colors
      if (colors.length === 0) return notify(t('Add a photo first: its colors are used for the design.'))
      const ppi = documentPpi(d)
      const next = matchDesignToPalette(
        d,
        colors,
        (current, layer) => {
          const backdrop = textBackdrop(current, layer)
          return backdrop ? (color: string) => worstContrast(color, backdrop) : '#ffffff'
        },
        (layer) => neededContrast(layer, ppi),
      )
      const count = recoloredCount(d, next)
      if (count === 0) return notify(t('There are no shapes or words to recolor, or they already have these colors.'))
      setPreview({
        title: t('Match design to photo'),
        description: t('Shapes and words take the colors of your photos, and words stay easy to read. Things changing color: {count}.', { count }),
        label: t('Match design to photo'),
        base: d,
        doc: next,
        colors: colors.map((c) => c.hex),
      })
    },

    tidyPage() {
      const d = editor.getDoc()
      if (!d) return
      const { doc: next, moved } = tidyPage(d)
      if (moved === 0) return notify(t('The page is already tidy: nothing is almost in line.'))
      setPreview({
        title: t('Tidy the whole page'),
        description: t('Things that were almost in line move a few pixels, to line up exactly. Things moving: {count}.', { count: moved }),
        label: t('Tidy the whole page'),
        base: d,
        doc: next,
      })
    },

    makeReadable() {
      const d = editor.getDoc()
      if (!d || !pickedText) return notify(t('Pick some words on your design first.'))
      if (!readable) return notify(t('These words are already easy to read.'))
      const fix = readable.fixes[0]
      setPreview({ title: t('Make words readable'), description: fixDescription(fix), label: t('Make words readable'), base: d, doc: withFix(d, pickedText, fix) })
    },

    applyFix(fix) {
      setHovered(null)
      if (!pickedText) return
      editor.change(t('Make words readable'), (d) => withFix(d, pickedText, fix))
    },

    hoverFix(fix) {
      const d = editor.getDoc()
      setHovered(fix && d && pickedText ? { base: d, doc: withFix(d, pickedText, fix) } : null)
    },

    apply() {
      if (!preview) return
      setPreview(null)
      editor.change(preview.label, () => preview.doc)
    },

    cancel() {
      setPreview(null)
    },
  }
}
