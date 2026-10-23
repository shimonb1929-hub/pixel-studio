import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The site itself has no pictures: no sample photos, preview pictures, template images or
// illustrations, and never pictures of people. Only the app's own icons are picture files.
// Previews show the user's own work, or plain shapes, colors and words.

const ROOT = join(import.meta.dirname, '..')
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'blob-report'])
const ICONS = new Set([
  'public/apple-touch-icon.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/icon-maskable-512.png',
  'public/icon-maskable.svg',
  'public/icon.svg',
])
const PICTURE = /^\.(png|jpe?g|jfif|gif|webp|avif|svg|ico|bmp|tiff?|heic|heif|psd)$/i
const TEXT = /^\.(tsx?|jsx?|mjs|css|html|json|webmanifest)$/i

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [relative(ROOT, path).split('\\').join('/')]
  })
}

const ALL = files(ROOT)

// What the app itself is made of (tests may name made-up picture files, so they are left out).
// public/ocr holds the text-recognition library copied unchanged from node_modules (which isn't
// read either): its worker can hand back the user's own picture as a PNG, which looks like a
// picture written into the code but isn't one.
const APP = ALL.filter(
  (name) => (/^(src|public|pwa)\//.test(name) || name === 'index.html') && !name.startsWith('public/ocr/'),
).filter((name) => TEXT.test(extname(name)) && !/\.test\.tsx?$/.test(name))

// Ways a picture could come in from outside or be written into the app's own files.
const SNEAKY: [string, RegExp][] = [
  ['a picture written into the code', /data:image\//i],
  ['a picture from the internet', /https?:\/\/[^\s"'`)]+\.(png|jpe?g|gif|webp|avif|svg|bmp)\b/i],
  ['a picture from a photo website', /unsplash|picsum|pexels|pixabay|placekitten|placehold\.|placeholder\.com|loremflickr|randomuser|pravatar|gravatar|shutterstock|istockphoto|gettyimages|freepik|thispersondoesnotexist/i],
  ['a picture file used by the code', /["'`][\w./-]*\.(png|jpe?g|gif|webp|avif|bmp)["'`]|url\([^)]*\.(png|jpe?g|gif|webp|avif|bmp|svg)\b/i],
  ['an emoji picture (faces, people, things)', /[\u{1F300}-\u{1FAFF}]/u],
]

describe('no pictures on the site itself', () => {
  it('has no picture files except the app icons', () => {
    const pictures = ALL.filter((name) => PICTURE.test(extname(name)))
    expect(pictures.filter((name) => !ICONS.has(name))).toEqual([])
  })

  it('the app icons are plain shapes, with no picture inside them', () => {
    for (const name of ['public/icon.svg', 'public/icon-maskable.svg']) {
      const svg = readFileSync(join(ROOT, name), 'utf8')
      expect(svg, name).not.toMatch(/<image\b|href=|url\(/i)
    }
  })

  it('the code never brings in a picture', () => {
    const found: string[] = []
    for (const name of APP) {
      // The install description names the app icons and the picture types the app can open.
      if (name === 'public/manifest.webmanifest') continue
      const text = readFileSync(join(ROOT, name), 'utf8')
      for (const [what, pattern] of SNEAKY) {
        const match = text.match(pattern)
        // The page head names the phone icon, which is one of the app icons.
        if (match && !(name === 'index.html' && match[0] === '"apple-touch-icon.png"')) found.push(`${name}: ${what} (${match[0]})`)
      }
    }
    expect(found).toEqual([])
  })

  it('the install description only names the app icons', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8')) as {
      icons?: { src: string }[]
      screenshots?: unknown[]
    }
    expect(manifest.screenshots ?? []).toEqual([])
    for (const icon of manifest.icons ?? []) expect(ICONS.has(`public/${icon.src}`), icon.src).toBe(true)
  })
})
