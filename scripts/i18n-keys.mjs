// Lists every English sentence the app shows: the text inside t('...') and msg('...') in src.
// `node scripts/i18n-keys.mjs` prints them as JSON; `--missing he` prints only those the Hebrew
// list doesn't have yet. The i18n test uses the same reading, so lists can't fall behind.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CALL = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g

function unescape(text) {
  return text.replace(/\\(u\{?[0-9a-fA-F]+\}?|.)/g, (_, c) =>
    c[0] === 'u' ? String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16)) : c === 'n' ? '\n' : c,
  )
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

export function englishSentences(root = 'src') {
  const found = new Set()
  for (const file of files(root)) {
    for (const match of readFileSync(file, 'utf8').matchAll(CALL)) found.add(unescape(match[1] ?? match[2]))
  }
  return [...found].sort()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = englishSentences()
  const at = process.argv.indexOf('--missing')
  if (at > 0) {
    const lang = process.argv[at + 1]
    let have = {}
    try {
      have = JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8'))
    } catch {
      // No list yet: everything is missing.
    }
    console.log(JSON.stringify(keys.filter((k) => !(k in have)), null, 1))
  } else {
    console.log(JSON.stringify(keys, null, 1))
  }
}
