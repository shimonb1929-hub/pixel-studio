// Writes a PDF with a picture of the design on each page, the text on top of it (invisible, so it
// can be selected and searched), and for print shops the lines that show where to cut. Sizes are in points (72 to the inch), measured from the page's top-left corner.

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
  // Text drawn invisibly over the picture, so it can be selected, searched and copied.
  text?: PdfTextLine[]
}

export interface PdfTextLine {
  // From the line's own space (x along the baseline, y up, in units of `size`) to the page, in
  // PDF coordinates (y counted from the bottom).
  matrix: [number, number, number, number, number, number]
  size: number
  // Left to right, each with where it starts along the line, in the same units as `size`.
  glyphs: { text: string; x: number; width: number }[]
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

type PdfObject = string | [string, Uint8Array, string]

function stream(dictionary: string, data: Uint8Array): PdfObject {
  return [`<< ${dictionary} /Length ${data.length} >>\nstream\n`, data, '\nendstream']
}

function hex4(value: number): string {
  return value.toString(16).padStart(4, '0').toUpperCase()
}

function utf16Hex(text: string): string {
  let hex = ''
  for (let i = 0; i < text.length; i++) hex += hex4(text.charCodeAt(i))
  return hex
}

export function buildPdf(pages: PdfPage[], title: string, date = new Date()): Uint8Array<ArrayBuffer> {
  const objects: PdfObject[] = []
  // Object numbers are handed out first and filled in later, so objects can point at each other.
  const reserve = () => objects.push('') // returns the new object's number
  const set = (ref: number, object: PdfObject) => (objects[ref - 1] = object)

  const catalog = reserve()
  const pageList = reserve()
  const info = reserve()
  set(catalog, `<< /Type /Catalog /Pages ${pageList} 0 R >>`)
  set(info, `<< /Title ${textString(title)} /Producer (Pixel Studio) /CreationDate ${pdfDate(date)} >>`)

  // Every letter gets a number of its own, for each width it's drawn at; the font says which letter
  // each number stands for and how wide it is.
  const codes = new Map<string, { code: number; letter: string; width: number }>()
  const code = (letter: string, width: number) => {
    const key = `${width}|${letter}`
    let found = codes.get(key)
    if (!found) {
      found = { code: codes.size + 1, letter, width }
      codes.set(key, found)
    }
    return found.code
  }
  const hasText = pages.some((page) => page.text?.length)
  const font = hasText ? reserve() : 0

  const pageRefs = pages.map((page) => {
    const ref = reserve()
    const contents = reserve()
    const picture = reserve()
    const h = page.height
    const { image, imageBox } = page
    let content = `q ${num(imageBox.width)} 0 0 ${num(imageBox.height)} ${num(imageBox.x)} ${num(h - imageBox.y - imageBox.height)} cm /Im0 Do Q\n`
    if (page.marks?.length) {
      content += '0 G 0.25 w\n'
      for (const [x1, y1, x2, y2] of page.marks) content += `${num(x1)} ${num(h - y1)} m ${num(x2)} ${num(h - y2)} l S\n`
    }
    if (page.text?.length) {
      // Render mode 3 draws nothing: the letters are only there to be found.
      content += 'BT 3 Tr\n'
      for (const line of page.text) {
        content += `/F1 ${num(line.size)} Tf ${line.matrix.map(num).join(' ')} Tm\n[`
        let at = 0
        for (const glyph of line.glyphs) {
          // Widths are in thousandths of the size; a number between letters moves the next one to
          // exactly where it's drawn.
          const width = Math.max(0, Math.round((glyph.width / line.size) * 1000))
          const gap = ((glyph.x - at) / line.size) * 1000
          if (Math.abs(gap) > 0.5) content += ` ${num(-gap)} `
          content += `<${hex4(code(glyph.text, width))}>`
          at = glyph.x + (width / 1000) * line.size
        }
        content += '] TJ\n'
      }
      content += 'ET\n'
    }
    const boxes = [
      `/MediaBox [0 0 ${num(page.width)} ${num(h)}]`,
      page.bleedBox && `/BleedBox ${rect(page.bleedBox, h)}`,
      page.trimBox && `/TrimBox ${rect(page.trimBox, h)}`,
    ].filter(Boolean)
    const fonts = page.text?.length ? ` /Font << /F1 ${font} 0 R >>` : ''
    set(ref, `<< /Type /Page /Parent ${pageList} 0 R ${boxes.join(' ')} /Resources << /XObject << /Im0 ${picture} 0 R >>${fonts} >> /Contents ${contents} 0 R >>`)
    set(contents, stream('', encoder.encode(content)))
    set(picture, stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter}`, image.data))
    return ref
  })
  set(pageList, `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pages.length} >>`)

  if (hasText) {
    const cidFont = reserve()
    const descriptor = reserve()
    const fontFile = reserve()
    const toUnicode = reserve()
    const toGlyph = reserve()
    set(font, `<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`)
    set(
      cidFont,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 [${[...codes.values()].map((c) => c.width).join(' ')}]] /CIDToGIDMap ${toGlyph} 0 R >>`,
    )
    set(descriptor, `<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 5 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 ${fontFile} 0 R >>`)
    const file = glyphlessFont()
    set(fontFile, stream(`/Length1 ${file.length}`, file))
    // Every letter number shows the font's one empty glyph.
    const map = new Uint8Array((codes.size + 1) * 2)
    for (let c = 1; c <= codes.size; c++) map[c * 2 + 1] = 1
    set(toGlyph, stream('', map))
    set(toUnicode, stream('', encoder.encode(unicodeMap(codes))))
  }

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
  add(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

// Tells PDF readers which letters the numbers in the text stand for, so copying gives real text.
function unicodeMap(codes: Map<string, { code: number; letter: string }>): string {
  const entries = [...codes.values()].map(({ code, letter }) => `<${hex4(code)}> <${utf16Hex(letter)}>`)
  let map =
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100)
    map += `${part.length} beginbfchar\n${part.join('\n')}\nendbfchar\n`
  }
  return `${map}endcmap\nCMapName currentdict /CIDFont defineresource pop\nend\nend`
}

// The smallest TrueType font there can be: an empty glyph 1000 units wide. Invisible text needs a
// font, and a real one would make the file big and might not have the letters.
function glyphlessFont(): Uint8Array {
  const u16 = (v: number) => [(v >> 8) & 255, v & 255]
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
  const tables: [string, number[]][] = [
    // head: units per em 1000, short glyph locations.
    ['head', [...u32(0x10000), ...u32(0x10000), ...u32(0), ...u32(0x5f0f3cf5), ...u16(11), ...u16(1000), ...new Array(16).fill(0), ...u16(0), ...u16(0xffff - 199), ...u16(1000), ...u16(800), ...u16(0), ...u16(3), ...u16(2), ...u16(0), ...u16(0)]],
    ['hhea', [...u32(0x10000), ...u16(800), ...u16(0xffff - 199), ...u16(0), ...u16(1000), ...u16(0), ...u16(0), ...u16(1000), ...u16(1), ...u16(0), ...u16(0), ...new Array(8).fill(0), ...u16(0), ...u16(2)]],
    ['hmtx', [...u16(1000), ...u16(0), ...u16(1000), ...u16(0)]],
    ['loca', [...u16(0), ...u16(0), ...u16(0)]],
    ['glyf', []],
    ['maxp', [...u32(0x10000), ...u16(2), ...new Array(26).fill(0)]],
    ['post', [...u32(0x30000), ...new Array(28).fill(0)]],
  ]
  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const checksum = (bytes: number[]) => {
    let sum = 0
    for (let i = 0; i < bytes.length; i += 4) sum = (sum + ((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))) >>> 0
    return sum
  }
  const count = tables.length
  const power = 2 ** Math.floor(Math.log2(count))
  const header = [...u32(0x10000), ...u16(count), ...u16(power * 16), ...u16(Math.log2(power)), ...u16(count * 16 - power * 16)]
  let offset = header.length + count * 16
  const directory: number[] = []
  const data: number[] = []
  for (const [tag, bytes] of tables) {
    directory.push(...[...tag].map((c) => c.charCodeAt(0)), ...u32(checksum(bytes)), ...u32(offset), ...u32(bytes.length))
    const padded = [...bytes, ...new Array((4 - (bytes.length % 4)) % 4).fill(0)]
    data.push(...padded)
    offset += padded.length
  }
  return new Uint8Array([...header, ...directory, ...data])
}
