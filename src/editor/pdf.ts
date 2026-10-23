// Writes a one-page PDF holding a picture of the design, and for print shops the lines that show
// where to cut. Sizes are in points (72 to the inch), measured from the page's top-left corner.

export interface PdfBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfImage {
  width: number
  height: number
  // RGB bytes, either a JPG file (DCTDecode) or zlib-packed rows (FlateDecode).
  data: Uint8Array
  filter: 'DCTDecode' | 'FlateDecode'
}

export interface PdfPage {
  width: number
  height: number
  image: PdfImage
  // Where the picture is drawn on the page.
  imageBox: PdfBox
  // Where the paper is cut, and how far the design runs past it, for print shops.
  trimBox?: PdfBox
  bleedBox?: PdfBox
  // Short black lines, each from (x1, y1) to (x2, y2).
  marks?: [number, number, number, number][]
  title: string
}

const encoder = new TextEncoder()

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

// A PDF rectangle from a top-left box: [left bottom right top], with y counted from the bottom.
function rect(box: PdfBox, pageHeight: number): string {
  return `[${num(box.x)} ${num(pageHeight - box.y - box.height)} ${num(box.x + box.width)} ${num(pageHeight - box.y)}]`
}

// Text such as the title, as UTF-16 so Hebrew and Yiddish names show correctly in PDF readers.
function textString(text: string): string {
  let hex = 'FEFF'
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `<${hex}>`
}

function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `(D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z)`
}

export function buildPdf(page: PdfPage, date = new Date()): Uint8Array<ArrayBuffer> {
  const h = page.height
  const { image, imageBox } = page

  let content = `q ${num(imageBox.width)} 0 0 ${num(imageBox.height)} ${num(imageBox.x)} ${num(h - imageBox.y - imageBox.height)} cm /Im0 Do Q\n`
  if (page.marks?.length) {
    content += '0 G 0.25 w\n'
    for (const [x1, y1, x2, y2] of page.marks) content += `${num(x1)} ${num(h - y1)} m ${num(x2)} ${num(h - y2)} l S\n`
  }

  const boxes = [
    `/MediaBox [0 0 ${num(page.width)} ${num(h)}]`,
    page.bleedBox && `/BleedBox ${rect(page.bleedBox, h)}`,
    page.trimBox && `/TrimBox ${rect(page.trimBox, h)}`,
  ].filter(Boolean)

  // Each object is text, or text around binary bytes for the picture.
  const objects: (string | [string, Uint8Array, string])[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R ${boxes.join(' ')} /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    [
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.data.length} >>\nstream\n`,
      image.data,
      '\nendstream',
    ],
    `<< /Title ${textString(page.title)} /Producer (Pixel Studio) /CreationDate ${pdfDate(date)} >>`,
  ]

  const chunks: Uint8Array[] = []
  let length = 0
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }

  // The bytes after the first line tell programs the file holds binary data.
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(length)
    add(`${i + 1} 0 obj\n`)
    if (typeof object === 'string') add(object)
    else object.forEach(add)
    add('\nendobj\n')
  })
  const xref = length
  add(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  for (const offset of offsets) add(`${String(offset).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
