import { createCanvas, createDocumentFromImage, flattenDocument, getContext2d, MAX_DOCUMENT_SIDE } from './document.ts'
import { EXPORT_FORMATS, type ExportFormat } from './fileNames.ts'
import type { EditorDocument } from './types.ts'

const CANNOT_OPEN = "This file couldn't be opened. Try a PNG, JPG, GIF, WebP or BMP image."

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
      throw new Error(CANNOT_OPEN)
    }
  }
}

// Decodes a picture file into a canvas, checking that it's a size Pixel Studio can handle.
export async function imageFileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const image = await decodeImage(file)
  try {
    if (image.width < 1 || image.height < 1) throw new Error(CANNOT_OPEN)
    if (image.width > MAX_DOCUMENT_SIDE || image.height > MAX_DOCUMENT_SIDE) {
      throw new Error(
        `This image is ${image.width} × ${image.height} pixels. Pixel Studio can open images up to ` +
          `${MAX_DOCUMENT_SIDE.toLocaleString('en-US')} pixels on each side.`,
      )
    }
    const canvas = createCanvas(image.width, image.height)
    getContext2d(canvas).drawImage(image.source, 0, 0, image.width, image.height)
    return canvas
  } finally {
    image.release()
  }
}

export async function openImageFile(file: File): Promise<EditorDocument> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image file.`)
  }
  const canvas = await imageFileToCanvas(file)
  return createDocumentFromImage(file.name, canvas, canvas.width, canvas.height)
}

// quality is 0–1 and only affects JPG.
export function exportDocument(doc: EditorDocument, format: ExportFormat, quality: number): Promise<Blob> {
  // JPG has no transparency, so see-through areas become white instead of black.
  const canvas = flattenDocument(doc, format === 'jpeg' ? '#ffffff' : undefined)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Export failed. The image may be too large for this browser.')),
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
