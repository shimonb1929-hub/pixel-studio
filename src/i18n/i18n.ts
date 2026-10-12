import { useSyncExternalStore } from 'react'

// The languages the app speaks. Every word people see is written in English in the code, inside
// t('...') or msg('...'), and each other language has a list that says it in that language
// (src/i18n/messages). A test checks that every list has every sentence.
export type Language = 'en' | 'he' | 'yi' | 'es' | 'fr'

export interface LanguageInfo {
  id: Language
  // The language's name in its own words, so people can find theirs.
  name: string
  // Hebrew and Yiddish read right to left, so the whole screen is mirrored for them.
  rtl: boolean
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'en', name: 'English', rtl: false },
  { id: 'he', name: 'עברית', rtl: true },
  { id: 'yi', name: 'אידיש', rtl: true },
  { id: 'es', name: 'Español', rtl: false },
  { id: 'fr', name: 'Français', rtl: false },
]

const STORAGE_KEY = 'pixel-studio-language'

// Each list is its own file, fetched only when that language is picked.
const LISTS = import.meta.glob<{ default: Record<string, string> }>('./messages/*.json')

let current: Language = 'en'
let started = false
let words: Record<string, string> = {}
const listeners = new Set<() => void>()
// Goes up whenever words on screen must change, so components draw again.
let version = 0

function changed() {
  version++
  for (const listener of listeners) listener()
}

export function language(): Language {
  return current
}

export function languageInfo(id: Language = current): LanguageInfo {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]
}

export function isRtl(): boolean {
  return languageInfo().rtl
}

// Says an English sentence in the current language. {name} marks are filled in from `vars`, so a
// sentence can put a name or number wherever its language needs it.
export function t(text: string, vars?: Record<string, string | number>): string {
  // A sentence said while the app is still loading would stay in that language for good; such
  // lists use msg() and live() instead. Browser tests fail on this message.
  if (!started && import.meta.env.DEV && import.meta.env.MODE !== 'test') console.error(`t() used while loading, so it can't change language: ${text}`)
  const said = (current !== 'en' && words[text]) || text
  const filled = vars ? said.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? isolate(String(vars[key])) : all)) : said
  return marking ? `⟦${filled}⟧` : filled
}

// While developing, every translated sentence can be marked ⟦like this⟧, so words that were
// missed stand out on screen (run markTranslations() in the browser console).
let marking = false
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { markTranslations: () => void }).markTranslations = () => {
    marking = true
    changed()
  }
}

const RTL_LETTERS = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/
const LTR_LETTERS = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/

// A name written the other way from the sentence around it (a Hebrew layer name in English, or
// an English one in Hebrew) is kept apart, so its letters and punctuation stay in their places.
function isolate(value: string): string {
  const other = languageInfo().rtl ? LTR_LETTERS : RTL_LETTERS
  return other.test(value) ? `\u2068${value}\u2069` : value
}

// Like t(), but the {marks} can be filled with parts of the page, such as bold words.
export function tParts<T>(text: string, parts: Record<string, T>): (string | T)[] {
  return t(text)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => {
      const key = /^\{(\w+)\}$/.exec(piece)?.[1]
      return key && key in parts ? parts[key] : piece
    })
}

// Sentences marked with msg(), which live() lists say in the current language.
const marked = new Set<string>()

// Marks a sentence kept in a list (like the tools) so it gets translated; t() or live() says it
// when shown.
export function msg<T extends string>(text: T): T {
  marked.add(text)
  return text
}

const liveLists = new WeakMap<object, object>()
const withWords = new WeakMap<object, boolean>()

// Whether a plain list or table holds marked sentences, so only those are wrapped (others, like
// slider settings, are given back as they are and can be saved or sent to a worker).
function hasWords(data: object): boolean {
  if (!Array.isArray(data) && Object.getPrototypeOf(data) !== Object.prototype) return false
  const known = withWords.get(data)
  if (known !== undefined) return known
  withWords.set(data, false)
  const found = Object.values(data).some((value) => (typeof value === 'string' ? marked.has(value) : !!value && typeof value === 'object' && hasWords(value)))
  withWords.set(data, found)
  return found
}

// A list or table of words that always reads in the current language: every msg() sentence in it
// is said with t() when read. Other words (ids, keys) stay as they are. The same list always gives
// back the same object, so comparing picked items still works.
export function live<T extends object>(data: T): T {
  const known = liveLists.get(data)
  if (known) return known as T
  const view = new Proxy(data, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof value === 'string') return marked.has(value) ? t(value) : value
      if (value && typeof value === 'object' && hasWords(value)) return live(value)
      return value
    },
  })
  liveLists.set(data, view)
  return view
}

// For "Undo shadow strength": a step's name inside a sentence, in small letters where the
// language has them.
export function inSentence(text: string): string {
  return current === 'he' || current === 'yi' ? text : text.toLowerCase()
}

// For dates and times. Yiddish has no calendar words in browsers, so its dates use numbers.
export function dateLocale(): string {
  return { en: 'en-US', he: 'he-IL', yi: 'he-IL', es: 'es-ES', fr: 'fr-FR' }[current]
}

let hebrewFont = false

// Hebrew and Yiddish letters for the app's own words come from Heebo, which is already among the
// design fonts (Inter, the app's font, has no Hebrew letters). The browser fetches it only once
// Hebrew letters are on screen.
function loadHebrewFont() {
  if (hebrewFont || typeof FontFace === 'undefined') return
  hebrewFont = true
  const face = new FontFace('Pixel UI Hebrew', 'url(fonts/heebo/heebo-hebrew-wght-normal.woff2)', {
    weight: '100 900',
    unicodeRange: 'U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F',
  })
  document.fonts.add(face)
}

function apply() {
  if (typeof document === 'undefined') return
  loadHebrewFont()
  const root = document.documentElement
  root.lang = current
  root.dir = languageInfo().rtl ? 'rtl' : 'ltr'
}

// Called once the app's files have loaded, before anything is shown.
export function startLanguages(): Promise<void> {
  started = true
  return setLanguage(startingLanguage())
}

export async function setLanguage(next: Language): Promise<void> {
  const load = LISTS[`./messages/${next}.json`]
  const list = next === 'en' || !load ? {} : (await load()).default
  current = next
  words = list
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private windows may not keep it; the language still changes for now.
  }
  apply()
  changed()
}

// The language picked last time, or else the one the browser asks for, or else English.
export function startingLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LANGUAGES.some((l) => l.id === saved)) return saved as Language
  } catch {
    // No saved choice.
  }
  if (typeof navigator === 'undefined') return 'en'
  for (const wanted of navigator.languages ?? [navigator.language]) {
    const code = wanted.toLowerCase().split('-')[0]
    // Old browsers call Hebrew "iw" and Yiddish "ji".
    const id = code === 'iw' ? 'he' : code === 'ji' ? 'yi' : code
    if (LANGUAGES.some((l) => l.id === id)) return id as Language
  }
  return 'en'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Re-draws a component when the language changes.
export function useLanguage(): Language {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return current
}
