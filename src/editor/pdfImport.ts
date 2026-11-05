import { t } from '../i18n/i18n.ts'
import { createDocumentFromImage, createId, getContext2d, createCanvas, MAX_DOCUMENT_SIDE } from './document.ts'
import type { DesignPage, EditorDocument } from './types.ts'

// Opening a PDF (a flyer, a menu, a form someone sent): each of its pages becomes a page of the
// design, drawn as a sharp picture to work on, add to, or read the words from (Words from a
// picture). The PDF reader, pdf.js, comes from Pixel Studio's own site the first time it is needed.

// The detail pages are drawn at: print detail (300 pixels to the inch), without making giant pictures.
const PIXELS_PER_POINT = 300 / 72
const MAX_SIDE = Math.min(4000, MAX_DOCUMENT_SIDE)
// Long PDFs open their first pages only.
export const MAX_PDF_PAGES = 50

export async function isPdf(file: Blob): Promise<boolean> {
  if (file.type === 'application/pdf') return true
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  return String.fromCharCode(...head) === '%PDF-'
}

async function loadPdfJs() {
  const [library, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  library.GlobalWorkerOptions.workerSrc = worker.default
  return library
}

export async function pdfToDocument(file: File): Promise<{ doc: EditorDocument; skipped: number }> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true, enableXfa: false })
  try {
    const pdf = await task.promise
    const count = Math.min(pdf.numPages, MAX_PDF_PAGES)
    const canvases: HTMLCanvasElement[] = []
    for (let number = 1; number <= count; number++) {
      const page = await pdf.getPage(number)
      const plain = page.getViewport({ scale: 1 })
      const scale = Math.min(PIXELS_PER_POINT, MAX_SIDE / Math.max(plain.width, plain.height))
      const viewport = page.getViewport({ scale })
      const canvas = createCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)))
      const ctx = getContext2d(canvas)
      // Paper is white.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      page.cleanup()
      canvases.push(canvas)
    }
    const docs = canvases.map((canvas) => {
      const doc = createDocumentFromImage(file.name, canvas, canvas.width, canvas.height)
      return { ...doc, background: '#ffffff', layers: doc.layers.map((l) => ({ ...l, name: t('Page picture') })) }
    })
    const first = docs[0]
    if (docs.length === 1) return { doc: first, skipped: 0 }
    const pages: DesignPage[] = docs.map((d) => ({ id: createId('page'), width: d.width, height: d.height, background: d.background, layers: d.layers, activeLayerId: d.activeLayerId }))
    return { doc: { ...first, pages, pageIndex: 0 }, skipped: pdf.numPages - count }
  } finally {
    void task.destroy()
  }
}
