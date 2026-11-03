import type { FontCategory, FontInfo } from '../text/fontCatalog.ts'
import { FONT_PURPOSES, type FontPurpose } from '../text/fontPurposes.ts'
import { live, msg, t } from '../i18n/i18n.ts'

// The ways to narrow down the font list, shared by the font list in the Text panel and the big
// font window.

export type FontLetters = 'any' | 'hebrew' | 'yiddish'
export type FontFor = 'all' | FontPurpose

export const LETTERS: { value: FontLetters; label: string; description: string }[] = live([
  { value: 'any', label: msg('Any'), description: msg('Fonts for every language.') },
  { value: 'hebrew', label: msg('Hebrew'), description: msg('Fonts with Hebrew letters.') },
  { value: 'yiddish', label: msg('Yiddish'), description: msg('Fonts with all the Yiddish letters (װ ױ ײ) and vowel points.') },
])

export const KINDS: { value: FontCategory; label: string; description: string }[] = live([
  { value: 'sans', label: msg('Clean'), description: msg('Simple, modern letters without little feet (sans serif).') },
  { value: 'serif', label: msg('Classic'), description: msg('Letters with little feet, like in books and newspapers (serif).') },
  { value: 'display', label: msg('Bold & fun'), description: msg('Eye-catching letters for headlines and posters.') },
  { value: 'handwriting', label: msg('Handwritten'), description: msg('Letters that look written by hand.') },
  { value: 'mono', label: msg('Typewriter'), description: msg('Every letter the same width, like code or a typewriter.') },
])

export function hasLetters(font: FontInfo, letters: FontLetters): boolean {
  if (letters === 'hebrew') return font.hebrew
  if (letters === 'yiddish') return font.yiddish
  return true
}

// Words that find a font: its name, its kind and what it's good for, in English and in the
// language the app is shown in, so "wedding", "kids" or "Torah" find fonts too.
export function searchWords(font: FontInfo): string {
  const kind = KINDS.find((k) => k.value === font.category)
  const parts = [font.name, kind?.label ?? '', kind?.description ?? '', font.category]
  for (const purpose of FONT_PURPOSES) {
    if (purpose.fonts.includes(font.id)) parts.push(purpose.label, purpose.description, purpose.value)
  }
  if (font.hebrew) parts.push('hebrew', t('Hebrew'))
  if (font.yiddish) parts.push('yiddish', t('Yiddish'))
  return parts.join(' ').toLowerCase()
}
