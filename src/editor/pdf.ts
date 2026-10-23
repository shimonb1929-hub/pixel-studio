// A one-page PDF for printing: the finished design as one picture, kept at full detail (no JPG
// blur), on a page as big as the design is meant to print.

// Pixels per inch a design prints at when nothing else is said: the sharpness of the printed-page
// sizes (an A4 page is 2480 × 3508 pixels, which is A4 exactly at 300).
export const PRINT_PIXELS_PER_INCH = 300

// How big the printed page is, in PDF points (72 to an inch).
export function pdfPageSize(width: number, height: number, pixelsPerInch = PRINT_PIXELS_PER_INCH): { width: number; height: number } {
  const points = (pixels: number) => Math.round((pixels / pixelsPerInch) * 72 * 100) / 100
  return { width: points(width), height: points(height) }
}

// Packs the colors (red, green, blue; see-through parts already made white) the way PDF's
// FlateDecode expects: zlib, which is what CompressionStream calls 'deflate'.
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// `rgba` is the design's pixels, row by row from the top, four bytes each.
export async function makePdf(rgba: Uint8ClampedArray, width: number, height: number, pixelsPerInch = PRINT_PIXELS_PER_INCH): Promise<Blob> {
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    // Anything see-through is printed on white paper.
    const alpha = rgba[i + 3] / 255
    rgb[j] = Math.round(rgba[i] * alpha + 255 * (1 - alpha))
    rgb[j + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha))
    rgb[j + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha))
  }
  const picture = await deflate(rgb)
  const page = pdfPageSize(width, height, pixelsPerInch)
  const draw = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`

  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (body: string, stream?: Uint8Array) => {
    offsets.push(length)
    add(`${offsets.length} 0 obj\n${body}\n`)
    if (stream) {
      add('stream\n')
      add(stream)
      add('\nendstream\n')
    }
    add('endobj\n')
  }

  // The second line's high bytes tell programs that the file holds more than plain text.
  add('%PDF-1.4\n%âãÏÓ\n')
  object('<< /Type /Catalog /Pages 2 0 R >>')
  object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${picture.length} >>`, picture)
  object(`<< /Length ${draw.length} >>`, encoder.encode(draw))

  const xref = length
  add(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`)
  for (const offset of offsets) add(`${String(offset).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
