// Builds Pixel Studio's font library from Fontsource npm packages.
//
// Reads scripts/fonts/list.json, downloads each family's package with `npm pack`, copies the chosen
// woff2 files and the family's LICENSE into public/fonts/<id>/, and writes src/text/fontCatalog.ts
// with every file's exact unicode-range taken from the package's CSS.
//
//   node scripts/fonts/fetch.mjs           use the versions pinned in list.json (latest when none)
//   node scripts/fonts/fetch.mjs --latest  ignore the pinned versions and take the newest ones
//   node scripts/fonts/fetch.mjs --pin     also write the versions used back into list.json
//
// Needs only Node 22, npm and tar. Downloads are kept in the system temp folder between runs.
// Which files are taken from a package:
// - only the subsets in list.json ("latin", "latin-ext", "hebrew"), and only woff2 files;
// - variable packages: the wght axis (wght.css, plus wght-italic.css when the family has italic);
//   when there is no wght axis, the standard one (standard.css), else index.css;
// - static packages: weights 400 and 700 (or the font's own "weights", or the weight closest to
//   400), normal style, plus italic in the first of those weights when the package has it.
// If the files add up to more than list.json's maxTotalMB, italic files of display and handwriting
// families are left out first, biggest first.
//
// Fonts marked "local" in list.json are not on Fontsource: their files are made by another script
// (for "culmus", scripts/fonts/culmus.py) straight into public/fonts/<id>/ with a font.json, and
// are read from there and left in place.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = new Set(process.argv.slice(2))
const PIN = args.has('--pin')
const LATEST = args.has('--latest')

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const listPath = join(here, 'list.json')
const fontsDir = join(root, 'public', 'fonts')
const catalogPath = join(root, 'src', 'text', 'fontCatalog.ts')
const work = join(tmpdir(), 'pixel-studio-fontsource')
const tarballDir = join(work, 'tarballs')
const unpackDir = join(work, 'unpacked')

const CATEGORIES = {
  'sans-serif': 'sans',
  serif: 'serif',
  display: 'display',
  handwriting: 'handwriting',
  monospace: 'mono',
}
const LICENSES = new Map([
  ['ofl-1.1', 'OFL-1.1'],
  ['apache-2.0', 'Apache-2.0'],
  ['mit', 'MIT'],
  ['cc0-1.0', 'CC0-1.0'],
  ['unlicense', 'Unlicense'],
  ['gpl-2.0-with-font-exception', 'GPL-2.0-with-font-exception'],
])
const WOFF2_MAGIC = 'wOF2'

const list = JSON.parse(readFileSync(listPath, 'utf8'))
const SUBSETS = list.subsets ?? ['latin', 'latin-ext', 'hebrew']
const maxBytes = (list.maxTotalMB ?? 40) * 1024 * 1024
const warnings = []
const skipped = []

function warn(message) {
  warnings.push(message)
  console.warn(`! ${message}`)
}

function skip(id, reason) {
  skipped.push({ id, reason })
  console.warn(`! skipped ${id}: ${reason}`)
}

// --- Download ---------------------------------------------------------------------------------

function tarballName(pkg, version) {
  return `${pkg.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

function npmPack(specs) {
  const out = execFileSync(
    'npm',
    ['pack', ...specs, '--json', '--pack-destination', tarballDir],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 },
  )
  // npm may print other text before the JSON; the JSON array is the last thing printed.
  const result = JSON.parse(out.slice(out.indexOf('[')))
  return result.map((entry) => ({ name: entry.name, version: entry.version, file: entry.filename }))
}

function download(fonts) {
  mkdirSync(tarballDir, { recursive: true })
  const found = new Map()
  const todo = []
  for (const font of fonts) {
    const version = LATEST ? undefined : font.version
    const cached = version && join(tarballDir, tarballName(font.package, version))
    if (cached && existsSync(cached)) found.set(font.id, { version, tarball: cached })
    else todo.push(font)
  }
  const spec = (font) => `${font.package}@${(!LATEST && font.version) || 'latest'}`
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20)
    console.log(`Downloading ${batch.map((font) => font.package).join(', ')}`)
    let packed
    try {
      packed = npmPack(batch.map(spec))
    } catch {
      // One bad package fails the whole batch, so try them one by one.
      packed = []
      for (const font of batch) {
        try {
          packed.push(...npmPack([spec(font)]))
        } catch (error) {
          skip(font.id, `could not download ${spec(font)} (${String(error.stderr ?? error).trim().split('\n')[0]})`)
        }
      }
    }
    for (const font of batch) {
      const entry = packed.find((item) => item.name === font.package)
      if (entry) found.set(font.id, { version: entry.version, tarball: join(tarballDir, entry.file) })
    }
  }
  return found
}

function unpack(id, tarball) {
  const dir = join(unpackDir, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', dir])
  return join(dir, 'package')
}

// --- Reading a package ------------------------------------------------------------------------

function parseFaces(css) {
  const faces = []
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1]
    const prop = (name) => body.match(new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+);`))?.[1].trim()
    const src = prop('src') ?? ''
    const file = src.match(/url\(\s*['"]?\.\/files\/([^)'"]+\.woff2)['"]?\s*\)/)?.[1]
    if (!file) continue
    faces.push({
      file,
      style: prop('font-style') ?? 'normal',
      weight: (prop('font-weight') ?? '400').replace(/\s+/g, ' '),
      unicodeRange: (prop('unicode-range') ?? '').replace(/\s+/g, ''),
    })
  }
  return faces
}

function subsetOf(id, file) {
  // Longest names first, so 'latin-ext' is not read as 'latin'.
  const names = [...SUBSETS].sort((a, b) => b.length - a.length)
  return names.find((name) => file.startsWith(`${id}-${name}-`))
}

function pickStaticWeights(available) {
  const wanted = [400, 700].filter((weight) => available.includes(weight))
  if (wanted.length > 0) return wanted
  const closest = [...available].sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400) || b - a)[0]
  return closest === undefined ? [] : [closest]
}

function cssFilesFor(font, meta, pkgDir) {
  const has = (name) => existsSync(join(pkgDir, name))
  if (meta.variable) {
    for (const axis of ['wght', 'standard']) {
      if (has(`${axis}.css`)) {
        return has(`${axis}-italic.css`) ? [`${axis}.css`, `${axis}-italic.css`] : [`${axis}.css`]
      }
    }
    return ['index.css']
  }
  const weights = font.weights ?? pickStaticWeights(meta.weights ?? [])
  const files = weights.map((weight) => `${weight}.css`).filter(has)
  if (weights.length > 0 && has(`${weights[0]}-italic.css`)) files.push(`${weights[0]}-italic.css`)
  return files
}

function licenseFile(pkgDir) {
  const name = readdirSync(pkgDir).find((file) => /^licen[cs]e(\.(md|txt))?$/i.test(file))
  return name && join(pkgDir, name)
}

function readFamily(font, pkgDir, version) {
  const meta = JSON.parse(readFileSync(join(pkgDir, 'metadata.json'), 'utf8'))
  const licenseType = typeof meta.license === 'string' ? meta.license : meta.license?.type
  const license = LICENSES.get(String(licenseType ?? '').toLowerCase())
  if (!license) return skip(font.id, `license ${licenseType} does not allow redistribution here`)
  const licensePath = licenseFile(pkgDir)
  if (!licensePath) return skip(font.id, 'the package has no LICENSE file')
  const category = font.category ?? CATEGORIES[meta.category]
  if (!category) return skip(font.id, `unknown category ${meta.category}`)

  const faces = []
  for (const cssFile of cssFilesFor(font, meta, pkgDir)) {
    for (const face of parseFaces(readFileSync(join(pkgDir, cssFile), 'utf8'))) {
      const subset = subsetOf(font.id, face.file)
      if (!subset) continue
      if (font.noItalic && face.style === 'italic') continue
      const source = join(pkgDir, 'files', face.file)
      if (!existsSync(source)) {
        warn(`${font.id}: ${cssFile} names ${face.file}, which is not in the package`)
        continue
      }
      if (faces.some((known) => known.file === face.file)) continue
      faces.push({ ...face, subset, source, size: statSync(source).size })
    }
  }
  if (!faces.some((face) => face.subset === 'latin' || face.subset === 'hebrew')) {
    return skip(font.id, 'no latin or hebrew woff2 file')
  }
  const hebrew = faces.some((face) => face.subset === 'hebrew')
  if (font.hebrew && !hebrew) warn(`${font.id}: expected Hebrew letters but found no hebrew file`)
  if (hebrew && (typeof font.yiddish !== 'boolean' || typeof font.niqqud !== 'boolean')) {
    warn(`${font.id}: has Hebrew but list.json has no yiddish/niqqud result; using false`)
  }
  return {
    id: font.id,
    name: meta.family,
    category,
    hebrew,
    yiddish: hebrew && font.yiddish === true,
    niqqud: hebrew && font.niqqud === true,
    variable: Boolean(meta.variable),
    license,
    licensePath,
    version,
    faces,
  }
}

// A font made by another script into public/fonts/<id>/, described by its font.json.
function readLocalFamily(font) {
  const dir = join(fontsDir, font.id)
  const infoPath = join(dir, 'font.json')
  if (!existsSync(infoPath)) return skip(font.id, `no ${infoPath}; run scripts/fonts/${font.local}.py first`)
  const info = JSON.parse(readFileSync(infoPath, 'utf8'))
  const license = LICENSES.get(String(info.license ?? '').toLowerCase())
  if (!license) return skip(font.id, `license ${info.license} does not allow redistribution here`)
  const licensePath = join(dir, 'LICENSE')
  if (!existsSync(licensePath)) return skip(font.id, 'has no LICENSE file')
  if (!font.category) return skip(font.id, 'list.json gives no category')
  const faces = []
  for (const face of info.faces) {
    const source = join(dir, face.file)
    if (!existsSync(source)) {
      warn(`${font.id}: font.json names ${face.file}, which is not there`)
      continue
    }
    faces.push({ ...face, subset: font.hebrew ? 'hebrew' : 'latin', source, size: statSync(source).size, local: true })
  }
  if (faces.length === 0) return skip(font.id, 'no woff2 file')
  return {
    id: font.id,
    name: info.name,
    category: font.category,
    hebrew: font.hebrew === true,
    yiddish: font.hebrew === true && font.yiddish === true,
    niqqud: font.hebrew === true && font.niqqud === true,
    variable: false,
    license,
    licensePath,
    version: info.version,
    faces,
    local: true,
  }
}

// --- Choosing and writing ---------------------------------------------------------------------

function weightsOf(family) {
  const weights = new Set()
  for (const face of family.faces) {
    const [low, high = low] = face.weight.split(' ').map(Number)
    if (family.variable) {
      for (let weight = Math.ceil(low / 100) * 100; weight <= high; weight += 100) weights.add(weight)
    } else {
      weights.add(low)
    }
  }
  return [...weights].sort((a, b) => a - b)
}

function totalBytes(families) {
  let total = 0
  for (const family of families) {
    total += statSync(family.licensePath).size
    for (const face of family.faces) total += face.size
  }
  return total
}

function fitInBudget(families) {
  let total = totalBytes(families)
  if (total <= maxBytes) return
  const italicSize = (family) =>
    family.faces.filter((face) => face.style === 'italic').reduce((sum, face) => sum + face.size, 0)
  const candidates = families
    .filter((family) => ['display', 'handwriting'].includes(family.category) && italicSize(family) > 0)
    .sort((a, b) => italicSize(b) - italicSize(a))
  for (const family of candidates) {
    if (total <= maxBytes) break
    total -= italicSize(family)
    family.faces = family.faces.filter((face) => face.style !== 'italic')
    console.log(`Left out the italic files of ${family.id} to stay under ${list.maxTotalMB} MB`)
  }
  if (total > maxBytes) warn(`the fonts take ${(total / 1048576).toFixed(1)} MB, more than ${list.maxTotalMB} MB`)
}

function copyFiles(families) {
  const local = new Set(list.fonts.filter((font) => font.local).map((font) => font.id))
  for (const name of existsSync(fontsDir) ? readdirSync(fontsDir) : []) {
    if (!local.has(name)) rmSync(join(fontsDir, name), { recursive: true, force: true })
  }
  for (const family of families) {
    if (family.local) continue
    const dir = join(fontsDir, family.id)
    mkdirSync(dir, { recursive: true })
    copyFileSync(family.licensePath, join(dir, 'LICENSE'))
    for (const face of family.faces) {
      const target = join(dir, face.file)
      copyFileSync(face.source, target)
      const magic = readFileSync(target).subarray(0, 4).toString('latin1')
      if (magic !== WOFF2_MAGIC) warn(`${family.id}: ${face.file} is not a woff2 file`)
    }
  }
}

const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function familyToTs(family) {
  const subsetOrder = (subset) => SUBSETS.indexOf(subset)
  const files = [...family.faces].sort(
    (a, b) =>
      (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1) ||
      Number.parseInt(a.weight, 10) - Number.parseInt(b.weight, 10) ||
      subsetOrder(a.subset) - subsetOrder(b.subset),
  )
  return [
    '  {',
    `    id: ${quote(family.id)},`,
    `    name: ${quote(family.name)},`,
    `    category: ${quote(family.category)},`,
    `    hebrew: ${family.hebrew},`,
    `    yiddish: ${family.yiddish},`,
    `    niqqud: ${family.niqqud},`,
    `    weights: [${weightsOf(family).join(', ')}],`,
    `    italic: ${family.faces.some((face) => face.style === 'italic')},`,
    `    variable: ${family.variable},`,
    `    license: ${quote(family.license)},`,
    '    files: [',
    ...files.map(
      (face) =>
        `      { url: ${quote(`fonts/${family.id}/${face.file}`)}, weight: ${quote(face.weight)}, ` +
        `style: ${quote(face.style)}, subset: ${quote(face.subset)}, unicodeRange: ${quote(face.unicodeRange)} },`,
    ),
    '    ],',
    '  },',
  ].join('\n')
}

const CATALOG_HEAD = `// Made by scripts/fonts/fetch.mjs from Fontsource packages (and Culmus). Do not edit by hand; run \`node scripts/fonts/fetch.mjs\`.
export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono'

export interface FontFileInfo {
  // Path from the site's root, without a leading slash, like 'fonts/heebo/heebo-hebrew-wght-normal.woff2'.
  url: string
  // CSS font-weight: one weight ('400') or the range of a variable font ('100 900').
  weight: string
  style: 'normal' | 'italic'
  subset: 'latin' | 'latin-ext' | 'hebrew'
  // CSS unicode-range of this file, copied from Fontsource.
  unicodeRange: string
}

export interface FontInfo {
  id: string // 'heebo'
  name: string // 'Heebo'
  category: FontCategory
  hebrew: boolean
  // Has the Yiddish double letters (װ ױ ײ) and the vowel points Yiddish uses.
  yiddish: boolean
  // Has Hebrew vowel points (niqqud).
  niqqud: boolean
  // Weights that can be picked: every hundred within a variable font's range, or the static files' weights.
  weights: number[]
  italic: boolean
  variable: boolean
  license: string // 'OFL-1.1', 'Apache-2.0', …
  files: FontFileInfo[]
}

export const FONTS: FontInfo[] = [
  // Sorted: Hebrew fonts first (alphabetically), then the rest alphabetically.
`

function writeCatalog(families) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en')
  const sorted = [
    ...families.filter((family) => family.hebrew).sort(byName),
    ...families.filter((family) => !family.hebrew).sort(byName),
  ]
  mkdirSync(dirname(catalogPath), { recursive: true })
  writeFileSync(catalogPath, `${CATALOG_HEAD}${sorted.map(familyToTs).join('\n')}\n]\n`)
}

// One font per line, so changes to the list are easy to read in a diff.
function inlineJson(value) {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${inlineJson(item)}`)
      .join(', ')}}`
  }
  return JSON.stringify(value)
}

function writeList(versions) {
  const fonts = list.fonts.map((font) => {
    if (font.local) return font
    const version = versions.get(font.id) ?? font.version
    const rest = { ...font }
    delete rest.id
    delete rest.package
    delete rest.version
    return { id: font.id, package: font.package, ...(version ? { version } : {}), ...rest }
  })
  const lines = ['{']
  for (const [key, value] of Object.entries(list)) {
    if (key !== 'fonts') lines.push(`  ${JSON.stringify(key)}: ${inlineJson(value)},`)
  }
  lines.push('  "fonts": [')
  lines.push(fonts.map((font) => `    ${inlineJson(font)}`).join(',\n'))
  lines.push('  ]')
  lines.push('}')
  writeFileSync(listPath, `${lines.join('\n')}\n`)
}

// --- Main -------------------------------------------------------------------------------------

const ids = new Set()
for (const font of list.fonts) {
  if (ids.has(font.id)) throw new Error(`list.json names ${font.id} twice`)
  ids.add(font.id)
}

const downloads = download(list.fonts.filter((font) => !font.local))
const families = []
for (const font of list.fonts) {
  if (font.local) {
    const family = readLocalFamily(font)
    if (family) families.push(family)
    continue
  }
  const fetched = downloads.get(font.id)
  if (!fetched) continue
  const family = readFamily(font, unpack(font.id, fetched.tarball), fetched.version)
  if (family) families.push(family)
}

fitInBudget(families)
copyFiles(families)
writeCatalog(families)
if (PIN) writeList(new Map(families.map((family) => [family.id, family.version])))

const hebrewCount = families.filter((family) => family.hebrew).length
const yiddishCount = families.filter((family) => family.yiddish).length
console.log(
  `\n${families.length} families (${hebrewCount} with Hebrew, ${yiddishCount} ready for Yiddish, ` +
    `${families.length - hebrewCount} Latin only), ` +
    `${families.reduce((sum, family) => sum + family.faces.length, 0)} files, ` +
    `${(totalBytes(families) / 1048576).toFixed(1)} MB in public/fonts`,
)
if (skipped.length > 0) console.log(`Skipped: ${skipped.map((item) => `${item.id} (${item.reason})`).join('; ')}`)
if (warnings.length > 0) console.log(`${warnings.length} warning(s), see above.`)
