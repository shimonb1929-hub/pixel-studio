import type { FontInfo } from './fontCatalog.ts'
import { addOwnFontInfo, familyName, fontInfo, hideOwnFont } from './fonts.ts'
import { t } from '../i18n/i18n.ts'

// Fonts people add from their own computer. Each is kept in the browser (IndexedDB) so it's there
// next time, goes inside every design that uses it (so the design opens right on any computer),
// and inside SVG downloads. A font's id comes from its bytes, so the same file is never added twice.

export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2'
export const FONT_FORMATS: FontFormat[] = ['truetype', 'opentype', 'woff', 'woff2']

export interface OwnFont {
  id: string
  name: string
  format: FontFormat
  hebrew: boolean
  yiddish: boolean
  data: Blob
}

// Bigger than any real font file, small enough not to fill the browser.
export const MAX_FONT_BYTES = 40 * 1024 * 1024
export const OWN_FONT_ID = /^own-[0-9a-f]{16}$/

const DB_NAME = 'pixel-studio-fonts'
const STORE = 'fonts'

// A problem with a font file, in plain words.
export class FontFileError extends Error {}

// The kind of font file, from its first bytes; null when it isn't one a browser can use.
export function fontFileFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 12) return null
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  if (tag === '\0\x01\0\0' || tag === 'true') return 'truetype'
  if (tag === 'OTTO') return 'opentype'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  return null
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// The font's own table called `tag`, unpacked; null when it's missing or can't be read.
async function fontTable(bytes: Uint8Array, format: FontFormat, tag: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const woff = format === 'woff'
  const count = view.getUint16(woff ? 12 : 4)
  const first = woff ? 44 : 12
  const size = woff ? 20 : 16
  for (let i = 0; i < count; i++) {
    const at = first + i * size
    if (at + size > bytes.length) return null
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) !== tag) continue
    const offset = view.getUint32(at + (woff ? 4 : 8))
    const length = view.getUint32(at + (woff ? 8 : 12))
    if (offset + length > bytes.length) return null
    const table = bytes.subarray(offset, offset + length)
    // A woff file squeezes a table when that makes it smaller.
    return woff && length < view.getUint32(at + 12) ? inflate(table) : table
  }
  return null
}

// The font's name as its maker wrote it inside the file ("Frank Ruhl Bold"), or null.
export async function nameInFontFile(bytes: Uint8Array): Promise<string | null> {
  const format = fontFileFormat(bytes)
  // woff2 squeezes everything together; its name is read from the file name instead.
  if (!format || format === 'woff2') return null
  try {
    const table = await fontTable(bytes, format, 'name')
    if (!table || table.length < 6) return null
    const view = new DataView(table.buffer, table.byteOffset, table.byteLength)
    const count = view.getUint16(2)
    const strings = view.getUint16(4)
    const found: { score: number; text: string }[] = []
    for (let i = 0; i < count; i++) {
      const at = 6 + i * 12
      if (at + 12 > table.length) break
      const platform = view.getUint16(at)
      const language = view.getUint16(at + 4)
      const nameId = view.getUint16(at + 6)
      const length = view.getUint16(at + 8)
      const offset = strings + view.getUint16(at + 10)
      // The full name (4) is best, then the family's name (1).
      if ((nameId !== 4 && nameId !== 1) || offset + length > table.length) continue
      const raw = table.subarray(offset, offset + length)
      let text = ''
      if (platform === 3 || platform === 0) {
        for (let j = 0; j + 1 < raw.length; j += 2) text += String.fromCharCode((raw[j] << 8) | raw[j + 1])
      } else if (platform === 1) {
        text = String.fromCharCode(...raw)
      } else continue
      text = [...text].filter((c) => c >= ' ').join('').trim()
      if (!text) continue
      // English names first, then Windows ones.
      const score = (nameId === 4 ? 4 : 0) + (platform === 3 && language === 0x409 ? 2 : platform === 3 ? 1 : 0)
      found.push({ score, text })
    }
    found.sort((a, b) => b.score - a.score)
    return found[0]?.text.slice(0, 100) ?? null
  } catch {
    return null
  }
}

// A readable name from a file's name: "MyFont-Bold.ttf" → "MyFont Bold".
export function nameFromFileName(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (name || t('My font')).slice(0, 100)
}

async function fontId(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return `own-${[...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

// Whether a loaded font draws these letters itself, and not a stand-in: text in the font measures
// differently from text in two other fonts.
function drawsLetters(family: string, letters: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return false
  return ['monospace', 'serif'].every((fallback) => {
    ctx.font = `40px "${family}", ${fallback}`
    const width = ctx.measureText(letters).width
    ctx.font = `40px ${fallback}`
    return Math.abs(width - ctx.measureText(letters).width) > 0.5
  })
}

const urls = new Map<string, string>()
const datas = new Map<string, OwnFont>()

// Makes a font usable in this tab: in the font list, for drawing, and for downloads.
async function install(font: OwnFont): Promise<FontInfo> {
  if (!urls.has(font.id)) urls.set(font.id, URL.createObjectURL(font.data))
  datas.set(font.id, font)
  const info: FontInfo = {
    id: font.id,
    name: font.name,
    category: 'sans',
    hebrew: font.hebrew,
    yiddish: font.yiddish,
    niqqud: false,
    weights: [400],
    italic: false,
    variable: false,
    license: 'own',
    // One file draws every boldness, so none is made up by the browser.
    files: [{ url: urls.get(font.id)!, weight: '1 1000', style: 'normal', subset: 'latin', unicodeRange: 'U+0-10FFFF' }],
  }
  addOwnFontInfo(info, font.format)
  return fontInfo(font.id) ?? info
}

// The bytes of a font of your own, to put inside a design.
export function ownFontData(id: string): OwnFont | undefined {
  return datas.get(id)
}

let opening: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no storage'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((error: unknown) => {
    opening = null
    throw error
  })
  return opening
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = act(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

// Puts the fonts kept in this browser back on the list. Never fails: without storage the list just
// has no fonts of your own.
export async function startOwnFonts(): Promise<void> {
  try {
    const kept = await run('readonly', (store) => store.getAll() as IDBRequest<(OwnFont & { addedAt: number })[]>)
    kept.sort((a, b) => a.addedAt - b.addedAt)
    for (const font of kept) await install(font)
  } catch {
    // Nothing kept, or the browser won't keep anything.
  }
}

async function keep(font: OwnFont): Promise<void> {
  try {
    await run('readwrite', (store) => store.put({ ...font, addedAt: Date.now() }))
  } catch {
    // It still works until the page is closed, and stays inside designs that use it.
  }
}

// Adds a font file from the computer. Says in plain words what's wrong when it can't.
export async function addOwnFont(file: File): Promise<FontInfo> {
  if (file.size > MAX_FONT_BYTES) throw new FontFileError(t('This font file is too big. Font files are usually much smaller; check that it is the right file.'))
  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = fontFileFormat(bytes)
  if (!format) throw new FontFileError(t('This isn’t a font file Pixel Studio can use. Pick a .ttf, .otf, .woff or .woff2 file.'))
  const id = await fontId(bytes)
  const name = (await nameInFontFile(bytes)) ?? nameFromFileName(file.name)
  const data = new Blob([bytes as BlobPart], { type: `font/${format === 'truetype' ? 'ttf' : format === 'opentype' ? 'otf' : format}` })
  // Tried first, so a damaged file never reaches the list.
  const probe = new FontFace(`${familyName(id)}-probe`, await data.arrayBuffer())
  try {
    await probe.load()
  } catch {
    throw new FontFileError(t('This font file is damaged, so it can’t be used. Try downloading it again.'))
  }
  document.fonts.add(probe)
  const hebrew = drawsLetters(probe.family, 'אבגדהוזחטיכלמנסעפצקרשת')
  const yiddish = hebrew && drawsLetters(probe.family, 'װױײ')
  document.fonts.delete(probe)
  const font: OwnFont = { id, name, format, hebrew, yiddish, data }
  await keep(font)
  return install(font)
}

// Fonts that came inside a design: added to your fonts, so you can use them in other designs too.
export async function addFontsFromDesign(fonts: OwnFont[]): Promise<void> {
  for (const font of fonts) {
    if (datas.has(font.id)) continue
    await keep(font)
    await install(font)
  }
}

// Takes a font off your list. Designs that use it keep it.
export async function removeOwnFont(id: string): Promise<void> {
  hideOwnFont(id)
  try {
    await run('readwrite', (store) => store.delete(id))
  } catch {
    // Already gone.
  }
}
