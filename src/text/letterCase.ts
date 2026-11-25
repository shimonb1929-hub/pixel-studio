import { changeStories, reflowText } from './textFlow.ts'
import { changeText, textName } from './textLayer.ts'
import type { EditorDocument, Layer } from '../editor/types.ts'

// Changing the letters of a text to CAPITALS, small letters, Each Word Capital or First word
// capital (pro: Change Case). Each letter stays one letter, so words with their own font or color
// keep it. Hebrew and Yiddish have no capitals, so their letters never change.

export type LetterCase = 'upper' | 'lower' | 'title' | 'sentence'

export const LETTER_CASES: LetterCase[] = ['upper', 'lower', 'title', 'sentence']

const LETTER = /\p{L}/u
const MARK = /[\p{M}'’]/u

// One letter in capitals or small letters, unless that would make it longer (ß becomes SS).
function swap(letter: string, upper: boolean): string {
  const next = upper ? letter.toUpperCase() : letter.toLowerCase()
  return next.length === letter.length ? next : letter
}

export function changeCase(text: string, kind: LetterCase): string {
  let out = ''
  // Whether the next letter starts a word, and whether it starts a sentence.
  let wordStart = true
  let sentenceStart = true
  for (const char of text) {
    if (LETTER.test(char)) {
      const upper = kind === 'upper' || (kind === 'title' && wordStart) || (kind === 'sentence' && sentenceStart)
      out += swap(char, upper)
      wordStart = false
      sentenceStart = false
      continue
    }
    out += char
    // An apostrophe or accent inside a word (don't, café) keeps the word going.
    if (!MARK.test(char)) wordStart = true
    if (/[.!?\n]/.test(char)) sentenceStart = true
  }
  return out
}

// Whether changing the letters would do anything: the text has letters that have capitals.
export function hasCase(text: string): boolean {
  return LETTER_CASES.some((kind) => changeCase(text, kind) !== text)
}

// The picked texts (by id) with their letters changed. A story running through several boxes
// changes everywhere it goes.
export function changeCaseOf(doc: EditorDocument, ids: string[], kind: LetterCase): EditorDocument {
  const picked = new Set(ids)
  const stories = new Set(doc.layers.flatMap((l) => (l.kind === 'text' && l.flow && picked.has(l.id) ? [l.flow.story] : [])))
  let changed = false
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind !== 'text' || layer.flow || layer.pageNumber || layer.contents || !picked.has(layer.id)) return layer
    const text = changeCase(layer.text, kind)
    if (text === layer.text) return layer
    changed = true
    const next = changeText(layer, { text })
    // A text named after its words keeps being named after them.
    return layer.name === textName(layer.text) ? { ...next, name: textName(text) } : next
  })
  // Only the boxes of the picked stories go through, then take their places again.
  const boxes = layers.filter((l) => l.kind === 'text' && l.flow && stories.has(l.flow.story))
  const redone = new Map(
    changeStories(boxes, (full, spans) => {
      const text = changeCase(full, kind)
      if (text === full) return null
      changed = true
      return { text, ...(spans ? { spans } : {}) }
    }).map((l) => [l.id, l]),
  )
  const kept = redone.size ? layers.map((l) => redone.get(l.id) ?? l) : layers
  if (!changed) return doc
  return reflowText({ ...doc, layers: kept })
}
