import { loadDesignFonts } from '../text/textLayer.ts'
import { flattenDocument } from './compose.ts'
import { createCanvas, createDocumentFromImage, createId, getContext2d, MAX_DOCUMENT_SIDE } from './document.ts'
import { EXPORT_FORMATS, type ExportFormat } from './fileNames.ts'
import { decodeHeic, isHeic } from './heic.ts'
import { exportPdf } from './pdfExport.ts'
import { isPdf, pdfToDocument } from './pdfImport.ts'
import { exportSvg } from './svgExport.ts'
import { svgToShapes } from './svgImport.ts'
import type { PdfSettings } from './pdfLayout.ts'
import { decodeProject, encodeProject, isProjectFile } from './project.ts'
import type { EditorDocument } from './types.ts'
import { msg, t } from '../i18n/i18n.ts'

const CANNOT_OPEN = msg("This file couldn't be opened. Try a PNG, JPG, HEIC, GIF, WebP or BMP image.")

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    // Some formats (SVG, for one) can't go through createImageBitmap, but <img> can decode them.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      }
    } catch {
      URL.revokeObjectURL(url)
      // Phone photos (HEIC) open in Safari by themselves; other browsers read them with libheif.
      if (await isHeic(file)) return decodeHeicImage(file)
      throw new Error(t(CANNOT_OPEN))
    }
  }
}

async function decodeHeicImage(file: Blob): Promise<DecodedImage> {
  let result: Awaited<ReturnType<typeof decodeHeic>>
  try {
    result = await decodeHeic(file, MAX_DOCUMENT_SIDE)
  } catch {
    throw new Error(t(CANNOT_OPEN))
  }
  // Too big to open: only its size comes back, so the usual message can say how big it is.
  if (!(result instanceof HTMLCanvasElement)) return { source: createCanvas(1, 1), width: result.width, height: result.height, release: () => {} }
  return { source: result, width: result.width, height: result.height, release: () => {} }
}

// Decodes a picture file into a canvas, checking that it's a size Pixel Studio can handle.
export async function imageFileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const image = await decodeImage(file)
  try {
    if (image.width < 1 || image.height < 1) throw new Error(t(CANNOT_OPEN))
    if (image.width > MAX_DOCUMENT_SIDE || image.height > MAX_DOCUMENT_SIDE) {
      throw new Error(
        t('This image is {width} × {height} pixels. Pixel Studio can open images up to {max} pixels on each side.', {
          width: image.width,
          height: image.height,
          max: MAX_DOCUMENT_SIDE.toLocaleString('en-US'),
        }),
      )
    }
    const canvas = createCanvas(image.width, image.height)
    getContext2d(canvas).drawImage(image.source, 0, 0, image.width, image.height)
    return canvas
  } finally {
    image.release()
  }
}

// Opens a picture as a new design, a PDF with each of its pages, or a project file with all its
// layers. skipped counts the pages of a very long PDF that were left out.
export async function openDesignFileWithNote(file: File): Promise<{ doc: EditorDocument; skipped: number }> {
  if (await isProjectFile(file)) return { doc: await decodeProject(file), skipped: 0 }
  if (await isPdf(file)) {
    try {
      return await pdfToDocument(file)
    } catch {
      throw new Error(t("This PDF couldn't be opened. It may be locked with a password or damaged."))
    }
  }
  if (file.type && !file.type.startsWith('image/') && !(await isHeic(file))) {
    throw new Error(`"${file.name}" is not a picture or a Pixel Studio project.`)
  }
  const canvas = await imageFileToCanvas(file)
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const opened = await svgDesign(file, canvas)
    if (opened) return { doc: opened, skipped: 0 }
  }
  return { doc: createDocumentFromImage(file.name, canvas, canvas.width, canvas.height), skipped: 0 }
}

// An SVG opens as shapes that stay sharp and editable, kept together. The picture it makes stays
// hidden below them, so nothing is lost (words in the SVG, for one, show only in the picture).
async function svgDesign(file: File, picture: HTMLCanvasElement): Promise<EditorDocument | null> {
  const result = await svgToShapes(await file.text(), { id: createId('group'), name: file.name.replace(/\.svg$/i, '') || t('Drawing') })
  if (!result) return null
  const doc = createDocumentFromImage(file.name, picture, result.width, result.height)
  const original = { ...doc.layers[0], name: t('Original picture'), visible: false }
  return { ...doc, layers: [original, ...result.shapes], activeLayerId: result.shapes[result.shapes.length - 1].id }
}

// quality is 0–1 and only affects JPG; pdf says how a PDF is laid out.
export async function exportDocument(doc: EditorDocument, format: ExportFormat, quality: number, pdf?: PdfSettings): Promise<Blob> {
  if (format === 'project') return encodeProject(doc)
  await loadDesignFonts(doc)
  if (format === 'pdf') return exportPdf(doc, pdf ?? { purpose: 'print', widthInches: 0, bleed: false, cropMarks: false })
  if (format === 'svg') return exportSvg(doc)
  // JPG has no transparency, so see-through areas become white instead of black.
  const canvas = flattenDocument(doc, format === 'jpeg' ? '#ffffff' : undefined)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error(t('Export failed. The image may be too large for this browser.'))),
      EXPORT_FORMATS[format].mime,
      quality,
    )
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
