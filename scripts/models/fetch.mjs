// Downloads the AI model files that Magic select, Remove background and Blur the background use,
// into public/models/, so the site serves them itself.
//
// The app never fetches anything from another site while it runs (it's used behind NetFree, which
// blocks or holds outside sites), so every file the AI needs is shipped with the site and committed.
// This script is only for refreshing them later.
//
//   node scripts/models/fetch.mjs          download the pinned revision and check every file
//   node scripts/models/fetch.mjs --check  only check the files already in public/models
//
// The model is SlimSAM (Xenova/slimsam-77-uniform, Apache License 2.0), full-size numbers (fp32):
// the squeezed versions give ragged, patchy outlines. To move to a newer revision, change REVISION
// and the sizes and sha256 sums below (the Hugging Face API lists them under "lfs" for big files).
//
// Needs Node 22 and curl (curl follows the HTTPS_PROXY setting, where one is needed).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODEL = 'Xenova/slimsam-77-uniform'
const REVISION = '5850ab45f587c112167512ffef949107115e26a0'
// Only the files the app reads. sha256 is checked for the big files; the small JSON files are
// checked by being valid JSON.
const FILES = [
  { path: 'config.json' },
  { path: 'preprocessor_config.json' },
  {
    path: 'onnx/vision_encoder.onnx',
    size: 23276014,
    sha256: '9f8433273a6750b587779baa0cf5508111001bf7e7acfcf585d370139fd366d0',
  },
  {
    path: 'onnx/prompt_encoder_mask_decoder.onnx',
    size: 16557892,
    sha256: 'f4514391764fbd56e08e119060d874ecd7d52994bfb1968af159e12d4943b5bb',
  },
]
// GitHub refuses files over 100 MB.
const MAX_BYTES = 95 * 1024 * 1024

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const target = join(root, 'public', 'models', MODEL)
const checkOnly = process.argv.includes('--check')

function check(file, path) {
  const bytes = readFileSync(path)
  if (bytes.length > MAX_BYTES) throw new Error(`${file.path} is ${bytes.length} bytes, too big for GitHub`)
  if (file.size !== undefined && bytes.length !== file.size) {
    throw new Error(`${file.path} is ${bytes.length} bytes, expected ${file.size}`)
  }
  if (file.sha256) {
    const sum = createHash('sha256').update(bytes).digest('hex')
    if (sum !== file.sha256) throw new Error(`${file.path} has sha256 ${sum}, expected ${file.sha256}`)
  } else {
    JSON.parse(bytes.toString('utf8'))
  }
}

for (const file of FILES) {
  const path = join(target, file.path)
  if (!checkOnly) {
    const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file.path}`
    console.log(`Downloading ${file.path}`)
    mkdirSync(dirname(path), { recursive: true })
    const partial = `${path}.part`
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', partial, url], { stdio: 'inherit' })
    check(file, partial)
    renameSync(partial, path)
  } else if (!existsSync(path)) {
    throw new Error(`${file.path} is missing; run node scripts/models/fetch.mjs`)
  }
  check(file, path)
  console.log(`ok ${file.path} (${(statSync(path).size / 1048576).toFixed(1)} MB)`)
}

writeFileSync(
  join(target, 'SOURCE.txt'),
  `SlimSAM (${MODEL}), Apache License 2.0.\nDownloaded by scripts/models/fetch.mjs from https://huggingface.co/${MODEL} at revision ${REVISION}.\n`,
)
