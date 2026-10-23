import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// Writes the offline helper (sw.js) with a list of every file of this build, so the installed
// app opens without internet. Only for the finished site, never while developing. Fonts (in
// public/fonts) aren't on the list: there are too many to fetch up front, so each one is kept
// the first time it's used. The AI's files (the engine here, the model in public/models, and the
// files of Words from a picture in public/ocr) aren't either: they're big and only needed by the AI
// tools, so they're kept the first time they're used.
const AI_FILES = /(^|\/)(ort-wasm|segmentWorker)/

// Stands for the model files in public/models, so installed apps keep their copy of the model
// until the files change (see pwa/service-worker.js). Names and sizes are enough (reading 40 MB on
// every build is not), along with the small files, which name the model's revision.
function modelsVersion(): string {
  const hash = createHash('sha256')
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else {
        const size = statSync(path).size
        hash.update(`${path}:${size}\n`)
        if (size < 65536) hash.update(readFileSync(path))
      }
    }
  }
  if (existsSync('public/models')) walk('public/models')
  return hash.digest('hex').slice(0, 12)
}

function offlineHelper(): Plugin {
  return {
    name: 'pixel-studio-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = readdirSync('public').filter((name) => !name.startsWith('_') && statSync(`public/${name}`).isFile())
      // The AI files are big and only needed by the AI tools, so they're kept the first time
      // they're used instead.
      const files = [...Object.keys(bundle).filter((name) => !AI_FILES.test(name)), ...publicFiles].sort()
      const template = readFileSync('pwa/service-worker.js', 'utf8')
      // Built files have their version in their name, but files from public/ keep theirs, so their
      // contents count too: a new icon or app description must reach installed apps as well.
      const hash = createHash('sha256').update(files.join('\n')).update(template)
      for (const name of publicFiles) hash.update(readFileSync(`public/${name}`))
      const version = hash.digest('hex').slice(0, 12)
      const source = template
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(files))
        .replace('__MODELS_VERSION__', modelsVersion())
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the site works at any address (its own domain or a folder of one).
  base: './',
  plugins: [react(), tailwindcss(), offlineHelper()],
  // The AI library is only used inside a worker, which the dev server doesn't look into ahead of
  // time. Without this, the first AI use prepares it late and reloads every open page.
  // The same for the text reader (Words from a picture), which is loaded only when first used.
  optimizeDeps: { include: ['@huggingface/transformers', 'tesseract.js'] },
})
