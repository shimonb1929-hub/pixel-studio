import { msg, t } from './i18n/i18n.ts'

export type ActionGroup = 'Design' | 'Edit' | 'Select' | 'Layers' | 'Photo' | 'Line up' | 'Whole design' | 'Pages' | 'View' | 'Tools' | 'Brush' | 'Looks'

const GROUP_NAMES: Record<ActionGroup, string> = {
  Design: msg('Design'),
  Edit: msg('Edit'),
  Select: msg('Select'),
  Layers: msg('Layers'),
  Photo: msg('Photo'),
  'Line up': msg('Line up'),
  'Whole design': msg('Whole design'),
  Pages: msg('Pages'),
  View: msg('View'),
  Tools: msg('Tools'),
  Brush: msg('Brush'),
  Looks: msg('Looks'),
}

// A group's name in the current language.
export function groupName(group: ActionGroup): string {
  return t(GROUP_NAMES[group])
}

// Everything a person can do, described once in plain words. The menu, the search box
// and the hover tips all read from this list, so they always say the same thing.
export interface Action {
  id: string
  group: ActionGroup
  title: string
  description: string
  // Everyday words people might type when looking for this action.
  keywords: string[]
  shortcut?: string
  needsDocument?: boolean
  // Set when the action can't be used right now, explaining why in plain words.
  disabledReason?: string
  // Rarely needed, or one click away somewhere else (the Download window, the Layers panel, the
  // row of pages). The menu shows it only after "Show every choice"; search always finds it.
  extra?: boolean
  run: () => void
}

export const NEEDS_DOCUMENT_HINT = msg('Start a new design or open a picture first.')

// Why an action can't be used right now, or null if it can.
export function actionBlocker(action: Action, hasDocument: boolean): string | null {
  if (action.needsDocument && !hasDocument) return t(NEEDS_DOCUMENT_HINT)
  return action.disabledReason ?? null
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

// Letters of every language count, so Hebrew and Yiddish words can be searched too.
const WORD_SPLIT = /[^\p{L}\p{N}%]+/u

// Little words people type in a sentence ("make it bigger", "color of the text"). They count when
// they match, but never stop an action from being found.
const FILLER = new Set(['a', 'an', 'the', 'it', 'its', 'my', 'me', 'i', 'to', 'of', 'for', 'on', 'in', 'into', 'with', 'make', 'do', 'how', 'can', 'want', 'please', 'this', 'that', 'some', 'is', 'more', 'way'])

// Every typed word has to match the action somewhere (little words don't have to). Matches at the start of a title word
// count most, then the keywords, then the middle of the title or the description. Middle-of-word
// matches need three letters, so typing one letter only finds words that start with it. A title
// that starts with exactly what was typed comes first ("resize design" before "Undo resize design").
export function searchActions(actions: Action[], query: string): Action[] {
  const typed = normalize(query).trim()
  const words = typed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return actions
  // When everything typed is little words, they all have to match after all.
  const optional = (word: string) => FILLER.has(word) && words.some((w) => !FILLER.has(w))

  const matches: { action: Action; score: number; index: number }[] = []
  actions.forEach((action, index) => {
    const title = normalize(action.title)
    const titleWords = title.split(WORD_SPLIT)
    const keywordWords = action.keywords.flatMap((keyword) => normalize(keyword).split(WORD_SPLIT))
    const description = normalize(action.description)
    let score = 0
    for (const word of words) {
      if (titleWords.some((w) => w.startsWith(word))) score += 4
      else if (keywordWords.some((w) => w.startsWith(word))) score += 3
      else if (word.length >= 3 && title.includes(word)) score += 2
      else if (word.length >= 3 && description.includes(word)) score += 1
      else if (!optional(word)) return
    }
    if (title.startsWith(typed)) score += 1
    matches.push({ action, score, index })
  })

  return matches.sort((a, b) => b.score - a.score || a.index - b.index).map((match) => match.action)
}
