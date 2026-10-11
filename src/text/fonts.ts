import { FONTS, type FontInfo } from './fontCatalog.ts'

// The fonts that come with Pixel Studio: found by id, loaded only when used, and drawn with a
// Hebrew font standing in for any letters a font doesn't have, so nothing ever shows as boxes.

export const DEFAULT_FONT = 'heebo'
// Stands in for Hebrew and Yiddish letters in fonts made only for English.
const HEBREW_FALLBACK = 'noto-sans-hebrew'
const LATIN_FALLBACK = 'heebo'

const byId = new Map(FONTS.map((font) => [font.id, font]))

export function fontInfo(id: string): FontInfo | undefined {
  return byId.get(id)
}

export function fontName(id: string): string {
  return byId.get(id)?.name ?? id
}

// The name a font has inside the program, so a copy installed on the computer is never used
// instead (it could be a different version, with different letter widths).
function familyName(id: string): string {
  return `ps-${id}`
}

export interface FontChoice {
  font: string
  weight: number
  italic: boolean
  size: number
}

// The font list: the chosen font, then stand-ins for letters it doesn't have.
export function fontStack(id: string): string {
  const ids = [id, ...[LATIN_FALLBACK, HEBREW_FALLBACK].filter((f) => f !== id && byId.has(f))]
  const known = ids.filter((f) => byId.has(f))
  return [...known.map((f) => `"${familyName(f)}"`), 'sans-serif'].join(', ')
}

// A CSS font for canvas and the typing box.
export function cssFont(choice: FontChoice): string {
  return `${choice.italic ? 'italic ' : ''}${choice.weight} ${choice.size}px ${fontStack(choice.font)}`
}

// The weight a font can show that's nearest the one asked for.
export function nearestWeight(id: string, weight: number): number {
  const weights = byId.get(id)?.weights
  if (!weights?.length) return weight
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0])
}

const registered = new Set<string>()

function register(id: string) {
  const info = byId.get(id)
  if (!info || registered.has(id) || typeof FontFace === 'undefined') return
  registered.add(id)
  for (const file of info.files) {
    const url = new URL(file.url, document.baseURI).href
    const face = new FontFace(familyName(id), `url("${url}") format("woff2")`, { weight: file.weight, style: file.style, unicodeRange: file.unicodeRange })
    document.fonts.add(face)
  }
}

// Goes up each time a font finishes loading, so text drawn with a stand-in is drawn again.
let version = 0
const listeners = new Set<() => void>()

export function fontsVersion(): number {
  return version
}

export function onFontsLoaded(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// A few of each kind of letter in the text, so only the font files it needs are loaded.
function sampleOf(text: string): string {
  const chars = new Set<string>(['A'])
  for (const char of text) {
    if (chars.size >= 64) break
    if (char.trim()) chars.add(char)
  }
  return [...chars].join('')
}

const loading = new Map<string, Promise<void>>()

// True when everything needed to draw the text in this font is loaded.
export function fontReady(choice: FontChoice, text: string): boolean {
  if (typeof document === 'undefined') return true
  register(choice.font)
  register(LATIN_FALLBACK)
  register(HEBREW_FALLBACK)
  try {
    return document.fonts.check(cssFont({ ...choice, size: 16 }), sampleOf(text))
  } catch {
    return true
  }
}

// Loads what's needed to draw the text in this font. Never fails: a font that can't load is
// drawn with a stand-in.
export function loadFont(choice: FontChoice, text: string): Promise<void> {
  if (fontReady(choice, text)) return Promise.resolve()
  const sample = sampleOf(text)
  const font = cssFont({ ...choice, size: 16 })
  const key = `${font}|${sample}`
  let promise = loading.get(key)
  if (!promise) {
    promise = document.fonts
      .load(font, sample)
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        version++
        for (const listener of listeners) listener()
      })
    loading.set(key, promise)
  }
  return promise
}

export function allFonts(): FontInfo[] {
  return FONTS
}
