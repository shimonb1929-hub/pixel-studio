// Puts the files of "Words from a picture" (text recognition with Tesseract) on our own site, so the
// app never reaches another site for them: NetFree and other filters often block outside sites.
//
//   node scripts/ocr/fetch.mjs
//
// Copies into public/ocr/<tesseract.js version>/:
// - worker.min.js from the tesseract.js package (the version in package.json),
// - core/: the three Tesseract engines for the LSTM recognizer from tesseract.js-core (plain,
//   SIMD and relaxed SIMD; tesseract.js picks the fastest one the browser can run),
// - lang/<code>.traineddata.gz for every language in LANGUAGES, from the @tesseract.js-data
//   packages (the "4.0.0_best_int" set: Tesseract's best models made smaller, LSTM only),
// - the licenses (Apache License 2.0).
// Older version folders are removed, and src/ai/ocrFiles.ts is written with the folder and sizes.
// The folder has the version in its name, so browsers that kept old files never mix versions.
//
// Needs only Node 22, npm and tar. Run `npm install` first.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// English, Hebrew and Yiddish, and the version of their packages.
const LANGUAGES = ['eng', 'heb', 'yid']
const DATA_VERSION = '1.0.0'
const DATA_SET = '4.0.0_best_int'
const ENGINES = ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']

const pkg = (name) => JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'))
const tesseract = pkg('tesseract.js')
const core = pkg('tesseract.js-core')

const ocrRoot = join(ROOT, 'public', 'ocr')
const folder = join(ocrRoot, tesseract.version)
rmSync(ocrRoot, { recursive: true, force: true })
mkdirSync(join(folder, 'core'), { recursive: true })
mkdirSync(join(folder, 'lang'), { recursive: true })

copyFileSync(join(ROOT, 'node_modules/tesseract.js/dist/worker.min.js'), join(folder, 'worker.min.js'))
copyFileSync(join(ROOT, 'node_modules/tesseract.js/LICENSE.md'), join(folder, 'LICENSE-tesseract.js.md'))
for (const engine of ENGINES) copyFileSync(join(ROOT, 'node_modules/tesseract.js-core', engine), join(folder, 'core', engine))
copyFileSync(join(ROOT, 'node_modules/tesseract.js-core/LICENSE'), join(folder, 'core', 'LICENSE'))

const work = mkdtempSync(join(tmpdir(), 'pixel-studio-ocr-'))
const sizes = {}
for (const lang of LANGUAGES) {
  const name = `@tesseract.js-data/${lang}@${DATA_VERSION}`
  const tarball = execFileSync('npm', ['pack', name, '--silent'], { cwd: work, encoding: 'utf8' }).trim().split('\n').pop()
  const into = join(work, lang)
  mkdirSync(into)
  execFileSync('tar', ['-xzf', join(work, tarball), '-C', into])
  const file = join(into, 'package', DATA_SET, `${lang}.traineddata.gz`)
  if (!existsSync(file)) throw new Error(`${name} has no ${DATA_SET}/${lang}.traineddata.gz`)
  copyFileSync(file, join(folder, 'lang', `${lang}.traineddata.gz`))
  sizes[lang] = statSync(file).size
}
rmSync(work, { recursive: true, force: true })
writeFileSync(
  join(folder, 'lang', 'README.txt'),
  `Tesseract language models (${DATA_SET}) from the @tesseract.js-data packages, version ${DATA_VERSION}.\n` +
    'They come from github.com/tesseract-ocr/tessdata_best, under the Apache License 2.0.\n',
)

const engineSize = Math.max(...ENGINES.map((engine) => statSync(join(folder, 'core', engine)).size))
const source = `// Made by scripts/ocr/fetch.mjs. Do not edit by hand; run \`node scripts/ocr/fetch.mjs\`.
// Where the files of Words from a picture are on our own site, and how big the downloads are.

// tesseract.js ${tesseract.version}, tesseract.js-core ${core.version}, language models ${DATA_SET}.
export const OCR_FOLDER = 'ocr/${tesseract.version}'

export type OcrLanguage = ${LANGUAGES.map((l) => `'${l}'`).join(' | ')}

// In bytes: the engine (downloaded once) and each language (downloaded the first time it's used).
export const OCR_ENGINE_BYTES = ${engineSize + statSync(join(folder, 'worker.min.js')).size}
export const OCR_LANGUAGE_BYTES: Record<OcrLanguage, number> = ${JSON.stringify(sizes, null, 2).replace(/"(\w+)":/g, '$1:')}
`
writeFileSync(join(ROOT, 'src/ai/ocrFiles.ts'), source)
console.log(`OCR files for tesseract.js ${tesseract.version} are in public/ocr/${tesseract.version}:`)
for (const entry of readdirSync(folder, { recursive: true })) console.log(`  ${entry}`)
