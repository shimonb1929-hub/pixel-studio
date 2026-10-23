import type { Worker as Recognizer } from 'tesseract.js'
import { OCR_FOLDER, type OcrLanguage } from './ocrFiles.ts'
import { foundLines, ocrLanguageCode, scaleLines, type FoundLine } from './ocrLayout.ts'

// Words from a picture: text recognition (OCR) with Tesseract, through tesseract.js. Every file it
// needs (its worker, the engine and the language models) comes from our own site, under
// public/ocr (see scripts/ocr/fetch.mjs), never from another site, so it works behind filters
// like NetFree. The files are downloaded the first time they're used; after that the browser keeps
// them (the language models in its own storage, the rest through the offline helper).

export type { OcrLanguage }

// What the recognizer is doing, for the progress note: getting ready (downloading and starting,
// the first time) or reading, with how far along it is (0 to 1).
export interface OcrProgress {
  stage: 'preparing' | 'reading'
  share: number
}

// Pictures are read at a size where letters are big enough for the recognizer but the work stays
// quick: small pictures are enlarged, very big ones made smaller.
const SMALL_SIDE = 1200
const LARGE_SIDE = 4000

let recognizer: { languages: string; ready: Promise<Recognizer> } | null = null
let listener: ((progress: OcrProgress) => void) | null = null

// Our own folder, as a full address: the worker reads the engine and languages relative to it.
function ownFile(path: string): string {
  return new URL(`${OCR_FOLDER}/${path}`, document.baseURI).href
}

function report(message: { status: string; progress: number }) {
  if (!listener) return
  if (message.status === 'recognizing text') listener({ stage: 'reading', share: message.progress })
  else listener({ stage: 'preparing', share: message.progress })
}

async function start(languages: string): Promise<Recognizer> {
  const { createWorker, OEM } = await import('tesseract.js')
  return createWorker(languages.split('+'), OEM.LSTM_ONLY, {
    workerPath: ownFile('worker.min.js'),
    // A folder: tesseract.js picks the fastest engine this browser can run from it.
    corePath: ownFile('core'),
    langPath: ownFile('lang'),
    // The worker is started from its file on our site, not from a copy made in the page.
    workerBlobURL: false,
    // The language models are kept in the browser under this name, so a newer set never mixes
    // with an older one.
    cachePath: OCR_FOLDER,
    logger: report,
    errorHandler: () => {},
  })
}

function recognizerFor(languages: string): Promise<Recognizer> {
  if (recognizer?.languages === languages) return recognizer.ready
  const previous = recognizer
  const ready = (async () => {
    if (previous) {
      // The engine is already loaded: only the languages change.
      const worker = await previous.ready.catch(() => null)
      if (worker) {
        await worker.reinitialize(languages)
        return worker
      }
    }
    return start(languages)
  })()
  recognizer = { languages, ready }
  ready.catch(() => {
    if (recognizer?.ready === ready) recognizer = null
  })
  return ready
}

// The picture as the recognizer reads it: on white (see-through parts count as paper), at a size
// it reads well. `factor` is how much bigger it is than the original.
function readingCopy(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; factor: number } {
  const side = Math.max(source.width, source.height)
  const factor = side < SMALL_SIDE ? Math.min(3, SMALL_SIDE / side) : side > LARGE_SIDE ? LARGE_SIDE / side : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * factor))
  canvas.height = Math.max(1, Math.round(source.height * factor))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return { canvas, factor: canvas.width / source.width }
}

// Finds the lines of words in a picture, in the picture's own pixels.
export async function readWords(source: HTMLCanvasElement, languages: OcrLanguage[], onProgress: (progress: OcrProgress) => void): Promise<FoundLine[]> {
  listener = onProgress
  try {
    onProgress({ stage: 'preparing', share: 0 })
    const worker = await recognizerFor(ocrLanguageCode(languages))
    const { canvas, factor } = readingCopy(source)
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    return scaleLines(foundLines(data), factor)
  } finally {
    if (listener === onProgress) listener = null
  }
}
