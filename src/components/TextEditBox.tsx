import { useLayoutEffect, useRef } from 'react'
import type { TextLayer, Viewport } from '../editor/types.ts'
import { fontStack } from '../text/fonts.ts'
import { resolveAlign } from '../text/layout.ts'
import { textLayout } from '../text/textLayer.ts'

export interface TextEditing {
  // The text as it is right now. While typing, it shows in this box instead of on the design.
  layer: TextLayer
  // Where the cursor starts: a place in the text, or the whole text picked.
  caret: number | 'all'
  onChange: (text: string) => void
  onDone: () => void
}

// The box text is typed into, laid exactly over where the text sits on the design: same font, size,
// spacing, direction, turn and zoom. The browser does the typing itself, so the cursor, selecting,
// copying, Hebrew and Yiddish keyboards and right-to-left text all work the way they do everywhere.
export function TextEditBox({ editing, viewport }: { editing: TextEditing; viewport: Viewport }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { layer } = editing
  const { box, style } = layer
  const layout = textLayout(layer)
  const width = Math.abs(box.width)
  const height = Math.abs(box.height)

  // Start typing right away, with the cursor where it was asked for.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (editing.caret === 'all') el.select()
    else el.setSelectionRange(editing.caret, editing.caret)
    // Only when typing starts; afterwards the cursor is the typist's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id])

  // The box never scrolls: it always grows to fit the text.
  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      el.scrollTop = 0
      el.scrollLeft = 0
    }
  })

  // From the text's own top-left corner to the screen: its box's middle, turn and flips, then the zoom.
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  const fx = box.width < 0 ? -1 : 1
  const fy = box.height < 0 ? -1 : 1
  const z = viewport.zoom
  const a = z * cos * fx
  const b = z * sin * fx
  const c = -z * sin * fy
  const d = z * cos * fy
  const e = z * (box.cx - (cos * fx * width) / 2 + (sin * fy * height) / 2) + viewport.panX
  const f = z * (box.cy - (sin * fx * width) / 2 - (cos * fy * height) / 2) + viewport.panY

  // Text that grows as you type gets room for the next letter on the side it grows toward.
  const align = resolveAlign(style.align, layout.direction)
  const room = layer.wrap ? 0 : style.size
  const offset = align === 'right' ? -room : align === 'center' ? -room / 2 : 0

  return (
    <textarea
      ref={ref}
      aria-label="Type your text"
      value={layer.text}
      dir={layout.direction}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(event) => editing.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          event.preventDefault()
          editing.onDone()
        }
      }}
      className="absolute left-0 top-0 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        transformOrigin: '0 0',
        transform: `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f}) translateX(${offset}px)`,
        width: width + room,
        height,
        fontFamily: fontStack(style.font),
        fontSize: `${style.size}px`,
        fontWeight: style.weight,
        fontStyle: style.italic ? 'italic' : 'normal',
        letterSpacing: `${style.letterSpacing * style.size}px`,
        lineHeight: `${style.size * style.lineHeight}px`,
        color: style.color,
        caretColor: style.color,
        whiteSpace: layer.wrap ? 'pre-wrap' : 'pre',
        overflowWrap: 'break-word',
        textAlign: style.align === 'auto' ? 'start' : style.align,
        direction: layout.direction,
        // With no direction chosen, each paragraph reads the way its first letter does.
        unicodeBidi: style.direction === 'auto' ? 'plaintext' : 'normal',
        fontKerning: 'normal',
      }}
    />
  )
}
