import { t } from '../i18n/i18n.ts'
import { drawLayer } from './compose.ts'
import { createCanvas, getContext2d } from './document.ts'
import { paintPage } from './gradient.ts'
import { placeText } from '../text/textLayer.ts'
import { buildPdf, type PdfImage, type PdfPage, type PdfTextLine } from './pdf.ts'
import { pageDocuments } from './pages.ts'
import { pdfLayout, type PdfLayout, type PdfSettings } from './pdfLayout.ts'
import type { EditorDocument } from './types.ts'

// Each strip of the picture is at most this many pixels, so even a big poster never needs one
// giant canvas (browsers refuse those).
const STRIP_PIXELS = 4_000_000

// Draws part of the design at the PDF's detail: rows `top` to `top + height` of the picture.
// Text and shapes are drawn again at this size, so they stay sharp however big it prints.
function drawStrip(doc: EditorDocument, layout: PdfLayout, top: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(layout.imageWidth, height)
  const ctx = getContext2d(canvas)
  // PDFs print on paper, so a see-through page comes out white.
  const { scale, area } = layout
  ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale - top)
  paintPage(ctx, doc, doc.width, doc.height, { x: area.x, y: area.y + top / scale, width: canvas.width / scale, height: canvas.height / scale }, '#ffffff')
  ctx.imageSmoothingQuality = 'high'
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    ctx.globalAlpha = layer.opacity
    drawLayer(ctx, doc, layer)
  }
  return canvas
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error(t('Export failed. The image may be too large for this browser.')))),
      'image/jpeg',
      0.92,
    )
  })
}

// The picture for paper: every pixel kept exactly (no JPG blur around letters), packed strip by strip.
async function losslessPicture(doc: EditorDocument, layout: PdfLayout): Promise<PdfImage> {
  const { imageWidth: width, imageHeight: height } = layout
  const packer = new CompressionStream('deflate')
  const packed = new Response(packer.readable).arrayBuffer()
  const writer = packer.writable.getWriter()
  const stripHeight = Math.max(1, Math.floor(STRIP_PIXELS / width))
  for (let top = 0; top < height; top += stripHeight) {
    const rows = Math.min(stripHeight, height - top)
    const rgba = getContext2d(drawStrip(doc, layout, top, rows)).getImageData(0, 0, width, rows).data
    const rgb = new Uint8Array(width * rows * 3)
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i]
      rgb[j + 1] = rgba[i + 1]
      rgb[j + 2] = rgba[i + 2]
    }
    await writer.write(rgb)
    // Lets the page breathe between strips of a big poster.
    await new Promise((resolve) => setTimeout(resolve))
  }
  await writer.close()
  return { width, height, data: new Uint8Array(await packed), filter: 'FlateDecode' }
}

// The text objects of a page, to lay invisibly over its picture so the text can be selected,
// searched and copied, Hebrew and Yiddish included.
function pageText(doc: EditorDocument, layout: PdfLayout): PdfTextLine[] {
  const { area, imageBox, pageHeight } = layout
  const k = imageBox.width / area.width
  const toPage = new DOMMatrix([k, 0, 0, -k, imageBox.x - area.x * k, pageHeight - imageBox.y + area.y * k])
  const lines: PdfTextLine[] = []
  for (const layer of doc.layers) {
    if (layer.kind !== 'text' || !layer.visible || layer.opacity <= 0 || !layer.text.trim()) continue
    const placed = placeText(layer)
    for (const line of placed.lines) {
      if (line.glyphs.length === 0) continue
      const m = toPage.multiply(placed.matrix).multiply(new DOMMatrix([1, 0, 0, -1, 0, line.baseline]))
      lines.push({ matrix: [m.a, m.b, m.c, m.d, m.e, m.f], size: layer.style.size, glyphs: line.glyphs })
    }
  }
  return lines
}

// Every page of the design, one after another, each the same size.
export async function exportPdf(doc: EditorDocument, settings: PdfSettings): Promise<Blob> {
  const layout = pdfLayout(doc.width, doc.height, settings)
  const print = settings.purpose === 'print'
  const pages: PdfPage[] = []
  for (const page of pageDocuments(doc)) {
    // For screens a JPG picture keeps the file small enough to send.
    const image: PdfImage = print
      ? await losslessPicture(page, layout)
      : { width: layout.imageWidth, height: layout.imageHeight, data: await canvasToJpeg(drawStrip(page, layout, 0, layout.imageHeight)), filter: 'DCTDecode' }
    pages.push({
      width: layout.pageWidth,
      height: layout.pageHeight,
      image,
      imageBox: layout.imageBox,
      trimBox: print ? layout.trimBox : undefined,
      bleedBox: print ? layout.bleedBox : undefined,
      marks: layout.marks,
      text: pageText(page, layout),
    })
  }
  return new Blob([buildPdf(pages, doc.name)], { type: 'application/pdf' })
}
