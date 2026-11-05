import { loadDesignFonts } from '../text/textLayer.ts'
import { drawLayer } from './compose.ts'
import { createCanvas, getContext2d } from './document.ts'
import { paintPage } from './gradient.ts'
import { pageDocuments } from './pages.ts'
import type { EditorDocument } from './types.ts'

// Printing straight from Pixel Studio (Ctrl+P): every page of the design is drawn at print detail
// and handed to the browser's own print window, one design page on each sheet of paper, as big as
// fits the paper chosen there. Text and shapes are drawn again at that size, so they print sharp.

// Enough pixels for a big sheet of paper at print detail, without making giant pictures.
const PRINT_SIDE = 3300
const MAX_SCALE = 4

export const PRINT_ROOT_ID = 'pixel-studio-print'

function printScale(width: number, height: number): number {
  return Math.min(MAX_SCALE, PRINT_SIDE / Math.max(width, height))
}

function drawPage(doc: EditorDocument): HTMLCanvasElement {
  const scale = printScale(doc.width, doc.height)
  const canvas = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)))
  const ctx = getContext2d(canvas)
  ctx.setTransform(canvas.width / doc.width, 0, 0, canvas.height / doc.height, 0, 0)
  // Paper is white, so a see-through page prints white.
  paintPage(ctx, doc, doc.width, doc.height, undefined, '#ffffff')
  ctx.imageSmoothingQuality = 'high'
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  return canvas
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The page could not be drawn for printing.'))), 'image/png'))
}

// While printing, only the pages show; on screen they are never seen.
const PRINT_CSS = `
#${PRINT_ROOT_ID} { display: none; }
@media print {
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} { display: block; }
  #${PRINT_ROOT_ID} .sheet { height: 100vh; display: flex; align-items: center; justify-content: center; break-after: page; overflow: hidden; }
  #${PRINT_ROOT_ID} .sheet:last-of-type { break-after: auto; }
  #${PRINT_ROOT_ID} img { max-width: 100%; max-height: 100%; object-fit: contain; }
}
`

export async function printDesign(doc: EditorDocument): Promise<void> {
  await loadDesignFonts(doc)
  document.getElementById(PRINT_ROOT_ID)?.remove()
  const urls: string[] = []
  const root = document.createElement('div')
  root.id = PRINT_ROOT_ID
  const style = document.createElement('style')
  style.textContent = PRINT_CSS
  root.appendChild(style)
  const cleanUp = () => {
    root.remove()
    for (const url of urls) URL.revokeObjectURL(url)
  }
  try {
    for (const page of pageDocuments(doc)) {
      const url = URL.createObjectURL(await toBlob(drawPage(page)))
      urls.push(url)
      const sheet = document.createElement('div')
      sheet.className = 'sheet'
      const img = document.createElement('img')
      img.alt = ''
      img.src = url
      sheet.appendChild(img)
      root.appendChild(sheet)
    }
    document.body.appendChild(root)
    await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode()))
  } catch (error) {
    cleanUp()
    throw error
  }
  // The pages go once the print window has closed (some browsers return from print() at once).
  window.addEventListener('afterprint', cleanUp, { once: true })
  window.print()
}
