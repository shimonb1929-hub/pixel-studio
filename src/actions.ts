export type ActionGroup = 'Design' | 'Edit' | 'Select' | 'Layers' | 'Whole design' | 'View' | 'Tools' | 'Brush' | 'Looks'

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
  run: () => void
}

export const NEEDS_DOCUMENT_HINT = 'Start a new design or open a picture first.'

// Why an action can't be used right now, or null if it can.
export function actionBlocker(action: Action, hasDocument: boolean): string | null {
  if (action.needsDocument && !hasDocument) return NEEDS_DOCUMENT_HINT
  return action.disabledReason ?? null
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

const WORD_SPLIT = /[^a-z0-9%]+/

// Every typed word has to match the action somewhere. Matches at the start of a title word
// count most, then the keywords, then the middle of the title or the description. Middle-of-word
// matches need three letters, so typing one letter only finds words that start with it.
export function searchActions(actions: Action[], query: string): Action[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return actions

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
      else return
    }
    matches.push({ action, score, index })
  })

  return matches.sort((a, b) => b.score - a.score || a.index - b.index).map((match) => match.action)
}
