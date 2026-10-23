import { createId } from '../editor/document.ts'
import type { EditorDocument, Layer, TextFlow, TextLayer, TextSpan } from '../editor/types.ts'
import { tidySpans } from './spans.ts'
import { hasRtlLetters } from './layout.ts'
import { fitText, textLayout, textName } from './textLayer.ts'

// Text that runs on from box to box, like a story in a newspaper: what doesn't fit in one box
// continues in the next. Each box shows its own part of the story as ordinary text, so drawing,
// picking, downloads and PDFs all work as for any text. The whole story is kept on every box, and
// after every change the parts are worked out again.

function isFlowing(layer: Layer): layer is TextLayer & { flow: TextFlow } {
  return layer.kind === 'text' && !!layer.flow
}

// The part of the story a box shows, without the line break it may end with.
function shownPart(full: string, start: number, end: number): string {
  const part = full.slice(start, end)
  return part.endsWith('\n') ? part.slice(0, -1) : part
}

// The words with their own look in the whole story: each box's, placed where its part starts.
function storySpans(boxes: (TextLayer & { flow: TextFlow })[]): TextSpan[] {
  return boxes.flatMap((b) => (b.spans ?? []).map((span) => ({ ...span, start: span.start + b.flow.start, end: span.end + b.flow.start })))
}

// The spans between `start` and `end`, counted from `start`.
function spansIn(spans: TextSpan[], start: number, end: number): TextSpan[] {
  return spans.flatMap((span) => {
    const a = Math.max(span.start, start)
    const b = Math.min(span.end, end)
    return a < b ? [{ ...span, start: a - start, end: b - start }] : []
  })
}

// Keeps the top of a box where it is while its height changes.
function withHeight(layer: TextLayer, height: number): TextLayer {
  const { box } = layer
  const old = Math.abs(box.height)
  const dy = (height - old) / 2
  // Down the box's own up-down direction, so a turned box grows along itself.
  const sign = box.height < 0 ? -1 : 1
  return {
    ...layer,
    box: { ...box, height: sign * height, cx: box.cx - Math.sin(box.rotation) * dy, cy: box.cy + Math.cos(box.rotation) * dy },
  }
}

// Splits each story over its boxes again. Returns the same design when nothing changes.
export function reflowText(doc: EditorDocument): EditorDocument {
  if (!doc.layers.some(isFlowing)) return doc
  const stories = new Map<string, (TextLayer & { flow: TextFlow })[]>()
  for (const layer of doc.layers) if (isFlowing(layer)) stories.set(layer.flow.story, [...(stories.get(layer.flow.story) ?? []), layer])
  const replaced = new Map<string, TextLayer>()
  for (const boxes of stories.values()) {
    boxes.sort((a, b) => a.flow.index - b.flow.index)
    // Every box has the whole story; the first one's copy is the one kept.
    const { full } = boxes[0].flow
    const style = boxes[0].style
    const looks = storySpans(boxes)
    const spansFor = (start: number, end: number, length: number) => tidySpans(spansIn(looks, start, end), style, length)
    if (boxes.length === 1) {
      // A box left on its own is ordinary text again.
      const { flow: _, spans: __, ...plain } = boxes[0]
      const name = plain.name === textName(plain.text) ? textName(full) : plain.name
      const spans = spansFor(0, full.length, full.length)
      replaced.set(boxes[0].id, fitText({ ...plain, name, text: full, ...(spans ? { spans } : {}) }))
      continue
    }
    let start = 0
    boxes.forEach((layer, i) => {
      const last = i === boxes.length - 1
      const rest = full.slice(start)
      const shaped: TextLayer = { ...layer, style, wrap: true, text: rest, spans: spansFor(start, full.length, rest.length) }
      const layout = textLayout(shaped)
      const fits = Math.max(1, Math.floor((layer.flow.height + 0.5) / layout.lineHeight))
      // The first line in a row past the box's height starts the next box (rows can be skipped
      // where the text flows around something).
      const over = layout.lines.findIndex((line) => line.row >= fits)
      const end = last || over < 0 ? full.length : start + layout.lines[over].start
      const text = shownPart(full, start, end)
      const flow = { ...layer.flow, index: i, start, end }
      // Names follow the words each box shows, unless a box was given a name of its own.
      const name = layer.name === textName(layer.text) ? textName(text) : layer.name
      const { spans: _, ...unstyled } = layer
      const spans = spansFor(start, end, text.length)
      let next: TextLayer = { ...unstyled, name, style, wrap: true, text, flow, ...(spans ? { spans } : {}) }
      const needed = fitText(next).box.height
      next = withHeight(next, last ? Math.max(layer.flow.height, Math.abs(needed)) : layer.flow.height)
      replaced.set(layer.id, next)
      start = end
    })
  }
  let changed = false
  const layers = doc.layers.map((layer) => {
    const next = replaced.get(layer.id)
    if (!next || sameLayer(layer, next)) return layer
    changed = true
    return next
  })
  return changed ? { ...doc, layers } : doc
}

function sameLayer(a: Layer, b: TextLayer): boolean {
  if (a.kind !== 'text') return false
  const fa = a.flow
  const fb = b.flow
  const sameFlow = fa === fb || (!!fa && !!fb && fa.story === fb.story && fa.index === fb.index && fa.full === fb.full && fa.start === fb.start && fa.end === fb.end && fa.height === fb.height)
  return sameFlow && JSON.stringify(a.spans) === JSON.stringify(b.spans) && a.name === b.name && a.text === b.text && a.wrap === b.wrap && a.style === b.style && a.box.cx === b.box.cx && a.box.cy === b.box.cy && a.box.width === b.box.width && a.box.height === b.box.height
}

// The story after one box's part was typed over (`spans` are the looks of the typed part).
export function editFlowPart(doc: EditorDocument, layerId: string, text: string, spans?: TextSpan[]): EditorDocument {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (!layer || !isFlowing(layer)) return doc
  const { full, start, end, story } = layer.flow
  const boxes = doc.layers.filter((l): l is TextLayer & { flow: TextFlow } => isFlowing(l) && l.flow.story === story)
  const ending = full.slice(start, end).endsWith('\n') && end < full.length ? '\n' : ''
  const next = full.slice(0, start) + text + ending + full.slice(end)
  const old = storySpans(boxes)
  const after = start + text.length + ending.length
  const looks = [
    ...spansIn(old, 0, start),
    ...(spans ?? []).map((span) => ({ ...span, start: span.start + start, end: span.end + start })),
    ...spansIn(old, end, full.length).map((span) => ({ ...span, start: span.start + after, end: span.end + after })),
  ]
  // The first box holds the whole story for a moment; splitting it again shares it out.
  const first = Math.min(...boxes.map((b) => b.flow.index))
  const layers = doc.layers.map((l): Layer => {
    if (!isFlowing(l) || l.flow.story !== story) return l
    const { spans: _, ...rest } = l
    if (l.flow.index !== first) return { ...rest, flow: { ...l.flow, full: next, start: next.length, end: next.length } }
    return { ...rest, ...(looks.length ? { spans: looks } : {}), flow: { ...l.flow, full: next, start: 0, end: next.length } }
  })
  return reflowText({ ...doc, layers })
}

// Every box of the story a text belongs to, or just the text.
export function storyBoxes(doc: EditorDocument, layer: TextLayer): TextLayer[] {
  if (!layer.flow) return [layer]
  const story = layer.flow.story
  return doc.layers.filter((l): l is TextLayer => isFlowing(l) && l.flow.story === story)
}

// Adds an empty box after a text, for the text to continue in: beside it if there's room on the
// page (on the left for Hebrew and Yiddish), otherwise under it. A box that holds all its text gives the second half of it to the new box.
export function continueText(doc: EditorDocument, layerId: string, gap: number): { doc: EditorDocument; id: string } | null {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (layer?.kind !== 'text') return null
  const lineHeight = layer.style.size * layer.style.lineHeight
  const width = Math.abs(layer.box.width)
  let height = Math.abs(layer.box.height)
  let flow: TextFlow
  if (layer.flow) {
    flow = layer.flow
    height = flow.height
  } else {
    const lines = Math.round(height / lineHeight)
    if (lines > 1) height = Math.ceil(lines / 2) * lineHeight
    flow = { story: createId('story'), index: 0, full: layer.text, start: 0, end: layer.text.length, height }
  }
  const { box } = layer
  // Hebrew and Yiddish run on into a box on the left, the way their newspapers' columns go.
  const rtl = layer.style.direction === 'rtl' || (layer.style.direction === 'auto' && hasRtlLetters(flow.full))
  const sideRoom = box.rotation === 0 && (rtl ? box.cx - width / 2 - gap - width >= 0 : box.cx + width / 2 + gap + width <= doc.width)
  const belowRoom = box.rotation === 0 && box.cy - Math.abs(box.height) / 2 + height + gap + height <= doc.height
  const top = box.cy - Math.abs(box.height) / 2
  const nextBox = sideRoom
    ? { ...box, cx: box.cx + (rtl ? -1 : 1) * (width + gap), cy: top + height / 2, height }
    : belowRoom
      ? { ...box, cy: top + height + gap + height / 2, height }
      : { ...box, cx: box.cx + gap, cy: box.cy + gap, height }
  const id = createId('layer')
  const after = flow.index
  // Boxes after this one move one place on, making room for the new box right after it.
  const layers = doc.layers.flatMap((l): Layer[] => {
    if (isFlowing(l) && l.flow.story === flow.story && l.flow.index > after) return [{ ...l, flow: { ...l.flow, index: l.flow.index + 1 } }]
    if (l.id !== layer.id) return [l]
    const first: TextLayer = { ...layer, wrap: true, flow: { ...flow, height } }
    const added: TextLayer = { ...layer, id, name: textName(''), text: '', locked: false, box: nextBox, flow: { ...flow, index: after + 1, height } }
    return [first, added]
  })
  return { doc: reflowText({ ...doc, layers, activeLayerId: id }), id }
}

// Turns a box's flow into a new story, for copies (a copied page keeps its boxes running on).
export function renameStories(layers: Layer[]): Layer[] {
  const names = new Map<string, string>()
  return layers.map((l) => {
    if (!isFlowing(l)) return l
    if (!names.has(l.flow.story)) names.set(l.flow.story, createId('story'))
    return { ...l, flow: { ...l.flow, story: names.get(l.flow.story)! } }
  })
}
