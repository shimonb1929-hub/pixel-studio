import { afterEach, describe, expect, it } from 'vitest'
import { live, msg, setLanguage, t } from './i18n.ts'

// Every file of the app as text, to find the English sentences in it (the same reading as
// scripts/i18n-keys.mjs).
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
const LISTS = import.meta.glob<Record<string, string>>('./messages/*.json', { import: 'default', eager: true })

const CALL = /\b(?:t|tParts|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g

function unescape(text: string): string {
  return text.replace(/\\(u\{?[0-9a-fA-F]+\}?|.)/g, (_, c: string) =>
    c[0] === 'u' ? String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16)) : c === 'n' ? '\n' : c,
  )
}

const sentences = new Set<string>()
for (const source of Object.values(SOURCES)) {
  for (const match of source.matchAll(CALL)) sentences.add(unescape(match[1] ?? match[2]))
}

const marks = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  it('finds the app’s sentences', () => {
    expect(sentences.size).toBeGreaterThan(500)
    expect(sentences.has('Arrange')).toBe(true)
  })

  for (const lang of ['he', 'yi', 'es', 'fr']) {
    const list = LISTS[`./messages/${lang}.json`]

    it(`${lang} says every sentence, with the same {marks}`, () => {
      expect(list).toBeDefined()
      const missing = [...sentences].filter((s) => !list[s]?.trim())
      expect(missing).toEqual([])
      const wrongMarks = [...sentences].filter((s) => marks(s).join() !== marks(list[s]).join())
      expect(wrongMarks).toEqual([])
    })

    it(`${lang} has no sentences the app no longer uses`, () => {
      expect(Object.keys(list).filter((s) => !sentences.has(s))).toEqual([])
    })
  }
})

describe('t', () => {
  afterEach(() => setLanguage('en'))

  it('fills in {marks} and keeps an English name apart in Hebrew', async () => {
    expect(t('Layer: {name}', { name: 'Sky' })).toBe('Layer: Sky')
    await setLanguage('he')
    expect(t('Layer: {name}', { name: 'Sky' })).toContain('⁨Sky⁩')
  })

  it('live lists change language without being made again', async () => {
    const list = live([{ id: 'a', name: msg('Arrange') }])
    expect(list[0].name).toBe('Arrange')
    await setLanguage('es')
    expect(list[0].name).toBe(LISTS['./messages/es.json']['Arrange'])
    expect(list[0].id).toBe('a')
  })
})
