import { useEffect, useLayoutEffect, useRef } from 'react'
import { cssGradient } from '../editor/gradient.ts'
import type { TextLayer, TextSpan, TextStyle, Viewport } from '../editor/types.ts'
import { fontStack } from '../text/fonts.ts'
import { resolveAlign } from '../text/layout.ts'
import { editSpans, styledPieces, tidySpans } from '../text/spans.ts'
import { straightBox, textLayout } from '../text/textLayer.ts'
import { avoidMargins } from '../text/avoid.ts'
import { isCurved } from '../text/textCurve.ts'
import { t } from '../i18n/i18n.ts'

export interface TextEditing {
  // The text as it is right now. While typing, it shows in this box instead of on the design.
  layer: TextLayer
  // Where the cursor starts: a place in the text, or the whole text picked.
  caret: number | 'all'
  onChange: (text: string, spans: TextSpan[] | undefined) => void
  // Which letters are picked (start equals end for just a cursor), so the Text and Color panels
  // can change only those words.
  onSelect: (start: number, end: number) => void
  onDone: () => void
  // In a table's cell, Tab goes to the next cell and Shift+Tab to the one before.
  onTab?: (back: boolean) => void
}

// The box text is typed into, laid exactly over where the text sits on the design: same font, size,
// spacing, direction, turn and zoom. The browser does the typing itself, so the cursor, selecting,
// copying, Hebrew and Yiddish keyboards and right-to-left text all work the way they do everywhere.
// Words with their own look show it while typing, so what you see is what you get.
export function TextEditBox({ editing, viewport }: { editing: TextEditing; viewport: Viewport }) {
  const ref = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const { layer } = editing
  const { style } = layer
  // Curved text is typed straight, in the middle of where it sits; it bends again when typing ends.
  const box = straightBox(layer)
  const layout = textLayout(layer)
  const width = Math.abs(box.width)
  const height = Math.abs(box.height)
  // What the box shows, so a change from outside (a word made bold) draws it again, and typing
  // (which the browser has already shown) doesn't.
  const shown = useRef<{ text: string; spans: string } | null>(null)
  const latest = useRef(editing)
  latest.current = editing

  // Draws the text and its looks into the box, keeping the cursor and picked letters where they were.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const spans = JSON.stringify(layer.spans ?? [])
    if (shown.current && shown.current.text === layer.text && shown.current.spans === spans) return
    const focused = document.activeElement === el
    const keep = focused ? selectedRange(el) : null
    paint(el, layer.text, layer.spans, style)
    shown.current = { text: layer.text, spans }
    if (keep) selectRange(el, keep.start, keep.end)
  })

  // Start typing right away, with the cursor where it was asked for.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (editing.caret === 'all') selectRange(el, 0, layer.text.length)
    else selectRange(el, editing.caret, editing.caret)
    // Only when typing starts; afterwards the cursor is the typist's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id])

  // Tells which letters are picked whenever that changes.
  useEffect(() => {
    const report = () => {
      const el = ref.current
      if (!el || document.activeElement !== el) return
      const range = selectedRange(el)
      if (range) latest.current.onSelect(range.start, range.end)
    }
    document.addEventListener('selectionchange', report)
    return () => document.removeEventListener('selectionchange', report)
  }, [])

  // The box never scrolls: it always grows to fit the text.
  useLayoutEffect(() => {
    for (const el of [ref.current, frameRef.current]) {
      if (!el) continue
      el.scrollTop = 0
      el.scrollLeft = 0
    }
  })

  // Reads what was typed: the letters, and which of them look different.
  function typed() {
    const el = ref.current
    if (!el) return
    const text = readText(el)
    const { layer } = latest.current
    if (text === layer.text) return
    const spans = editSpans(layer.spans, layer.style, layer.text, text)
    // What the browser shows already matches, unless the looks moved (then it's drawn again).
    shown.current = { text, spans: JSON.stringify(readSpans(el, layer.style) ?? []) }
    latest.current.onChange(text, spans)
  }

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
  const curved = isCurved(layer)
  const wraps = layer.wrap && !curved
  const room = wraps ? 0 : style.size
  // Curved text grows from its middle.
  const offset = align === 'right' && !curved ? -room : align === 'center' || curved ? -room / 2 : 0

  const matrix = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
  // Text that flows around pictures and shapes: blocks floating at the sides of each row keep the
  // same room free as on the design, so the lines wrap the same way while typing.
  const lineHeight = style.size * style.lineHeight
  // A list's markers go inside the room each row has, so a row with something beside it starts
  // its words that much further in.
  const indent = layout.indent ?? 0
  const margins = (wraps && layer.avoid?.length ? avoidMargins(layer.avoid, width, lineHeight, style.size) : []).map((m) =>
    layout.direction === 'ltr' ? { ...m, left: m.left > 0 && m.left < width ? m.left + indent : m.left } : { ...m, right: m.right > 0 ? m.right + indent : m.right },
  )

  return (
    <>
    {layout.markers?.length ? (
      // A list's dots, numbers or letters, beside the words being typed, just where they'll be drawn.
      <div aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ transformOrigin: '0 0', transform: matrix, width, height }}>
        {layout.markers.map((marker, i) => (
          <span
            key={i}
            dir={marker.direction}
            className="absolute whitespace-pre"
            style={{
              left: marker.x,
              top: layout.lines[marker.line].row * layout.lineHeight,
              fontFamily: fontStack(style.font),
              fontSize: `${style.size}px`,
              fontWeight: style.weight,
              fontStyle: style.italic ? 'italic' : 'normal',
              lineHeight: `${layout.lineHeight}px`,
              letterSpacing: `${style.letterSpacing * style.size}px`,
              color: style.gradient ? style.gradient.stops[0].color : style.color,
            }}
          >
            {marker.text}
          </span>
        ))}
      </div>
    ) : null}
    <div
      ref={frameRef}
      className="absolute left-0 top-0 overflow-hidden"
      style={{
        transformOrigin: '0 0',
        transform: `${matrix} translateX(${offset}px)`,
        width: width + room,
        height,
      }}
    >
      {margins.map((margin, row) => [
        <div key={`l${row}`} aria-hidden="true" className="pointer-events-none" style={{ float: 'left', clear: 'left', width: margin.left, height: lineHeight }} />,
        <div key={`r${row}`} aria-hidden="true" className="pointer-events-none" style={{ float: 'right', clear: 'right', width: margin.right, height: lineHeight }} />,
      ])}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={t('Type your text')}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        dir={layout.direction}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onInput={(event) => {
          // Letters still being put together by the keyboard (accents, some input methods) are read
          // once they're finished.
          if (!(event.nativeEvent as InputEvent).isComposing) typed()
        }}
        onCompositionEnd={typed}
        onBeforeInput={(event) => {
          // Only plain letters: bold, italic and the like come from the Text panel, never from
          // the browser's own shortcuts.
          const type = (event.nativeEvent as InputEvent).inputType
          if (type?.startsWith('format')) event.preventDefault()
        }}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
        }}
        onDrop={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
            event.preventDefault()
            editing.onDone()
          } else if (event.key === 'Tab' && editing.onTab && !event.nativeEvent.isComposing) {
            event.preventDefault()
            editing.onTab(event.shiftKey)
          }
        }}
        className="m-0 block select-text border-0 bg-transparent p-0 outline-none"
        style={{
          width: width + room,
          height,
          fontFamily: fontStack(style.font),
          fontSize: `${style.size}px`,
          fontWeight: style.weight,
          fontStyle: style.italic ? 'italic' : 'normal',
          letterSpacing: `${style.letterSpacing * style.size}px`,
          lineHeight: `${style.size * style.lineHeight}px`,
          color: style.gradient ? 'transparent' : style.color,
          caretColor: style.gradient ? style.gradient.stops[0].color : style.color,
          // A gradient shows through the letters, like on the design.
          ...(style.gradient ? { backgroundImage: cssGradient(style.gradient), backgroundClip: 'text', WebkitBackgroundClip: 'text' } : {}),
          whiteSpace: wraps ? 'pre-wrap' : 'pre',
          overflowWrap: 'break-word',
          textAlign: style.align === 'auto' ? 'start' : style.align,
          direction: layout.direction,
          // With no direction chosen, each paragraph reads the way its first letter does.
          unicodeBidi: style.direction === 'auto' ? 'plaintext' : 'normal',
          fontKerning: 'normal',
          // A list keeps room for its markers at the side lines start from.
          paddingInlineStart: layout.indent ?? 0,
        }}
      />
    </div>
    </>
  )
}

// A line break the box adds after text that ends with Enter, so the empty last line shows. It isn't
// part of the text.
const END = 'data-end'

// Fills the box with the text, each different look in its own piece.
function paint(el: HTMLElement, text: string, spans: TextSpan[] | undefined, base: TextStyle) {
  el.replaceChildren()
  for (const piece of styledPieces(spans, base, 0, text.length)) {
    const letters = document.createTextNode(text.slice(piece.start, piece.end))
    if (piece.style === base) {
      el.appendChild(letters)
      continue
    }
    const look = document.createElement('span')
    look.dataset.look = JSON.stringify({ font: piece.style.font, weight: piece.style.weight, italic: piece.style.italic, color: piece.style.color })
    look.style.fontFamily = fontStack(piece.style.font)
    look.style.fontWeight = String(piece.style.weight)
    look.style.fontStyle = piece.style.italic ? 'italic' : 'normal'
    // Words without a color of their own let the text's gradient show through.
    if (piece.style.color !== base.color || !base.gradient) look.style.color = piece.style.color
    look.appendChild(letters)
    el.appendChild(look)
  }
  if (text.endsWith('\n') || text === '') {
    const end = document.createElement('br')
    end.setAttribute(END, '')
    el.appendChild(end)
  }
}

// Every piece of the box in order: text, and line breaks the browser may have put in.
function walk(el: HTMLElement, visit: (node: Node, length: number) => void) {
  const step = (node: Node, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) return visit(node, (node as Text).data.length)
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'BR') return visit(node, node.hasAttribute(END) || isLastBreak(el, node) ? 0 : 1)
    // A browser can put a new line in a block of its own; that block starts a new line.
    if ((node.tagName === 'DIV' || node.tagName === 'P') && !first) visit(node, 1)
    node.childNodes.forEach((child, i) => step(child, first && i === 0))
  }
  el.childNodes.forEach((child, i) => step(child, i === 0))
}

// A line break at the very end only makes the empty last line show.
function isLastBreak(el: HTMLElement, br: HTMLElement): boolean {
  let node: Node | null = br
  while (node && node !== el) {
    if (node.nextSibling) return false
    node = node.parentNode
  }
  return true
}

function readText(el: HTMLElement): string {
  let text = ''
  walk(el, (node, length) => {
    if (length === 0) return
    text += node.nodeType === Node.TEXT_NODE ? (node as Text).data : '\n'
  })
  return text
}

// The looks as the box shows them, tidied like the text's own.
function readSpans(el: HTMLElement, base: TextStyle): TextSpan[] | undefined {
  const spans: TextSpan[] = []
  let at = 0
  walk(el, (node, length) => {
    const look = node.nodeType === Node.TEXT_NODE ? node.parentElement?.closest<HTMLElement>('[data-look]') : null
    if (look && el.contains(look) && length > 0) spans.push({ start: at, end: at + length, style: JSON.parse(look.dataset.look!) })
    at += length
  })
  return tidySpans(spans, base, at)
}

// Where a point inside the box is in the text.
function offsetOf(el: HTMLElement, container: Node, offset: number): number {
  let at = 0
  let found: number | null = null
  // A point between pieces (not inside text) is before the piece at that position.
  const target = container.nodeType === Node.TEXT_NODE ? container : (container.childNodes[offset] ?? null)
  walk(el, (node, length) => {
    if (found !== null) return
    if (node === container && node.nodeType === Node.TEXT_NODE) found = at + offset
    else if (target && (node === target || target.contains(node))) found = at
    at += length
  })
  return found ?? at
}

function selectedRange(el: HTMLElement): { start: number; end: number } | null {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  const a = offsetOf(el, range.startContainer, range.startOffset)
  const b = offsetOf(el, range.endContainer, range.endOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

// Puts the cursor or the picked letters at places in the text.
function selectRange(el: HTMLElement, start: number, end: number) {
  const point = (index: number): [Node, number] => {
    let at = 0
    let result: [Node, number] | null = null
    walk(el, (node, length) => {
      if (result) return
      if (node.nodeType === Node.TEXT_NODE && index <= at + length) result = [node, index - at]
      at += length
    })
    return result ?? [el, el.childNodes.length - (el.lastChild instanceof HTMLElement && el.lastChild.hasAttribute(END) ? 1 : 0)]
  }
  const selection = document.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(...point(start))
  range.setEnd(...point(end))
  selection.removeAllRanges()
  selection.addRange(range)
}
