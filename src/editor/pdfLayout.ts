import type { PdfBox } from './pdf.ts'

// How a design is laid out on a PDF page: the paper size, how much detail to draw it at, and for
// print shops the extra strip around the edge and the lines that show where to cut.

export type PdfPurpose = 'screen' | 'print'

export interface PdfSettings {
  purpose: PdfPurpose
  // How wide the design is on paper; the height follows the design's shape. Only for print.
  widthInches: number
  // Adds a strip of the design past the edges, so no white line shows after cutting.
  bleed: boolean
  // Short lines in the corners that show where to cut.
  cropMarks: boolean
}

export interface PdfLayout {
  // The page, in points.
  pageWidth: number
  pageHeight: number
  // The part of the design drawn, in design pixels (bigger than the design when it bleeds).
  area: PdfBox
  // Picture pixels for each design pixel.
  scale: number
  imageWidth: number
  imageHeight: number
  imageBox: PdfBox
  trimBox: PdfBox
  bleedBox: PdfBox
  marks: [number, number, number, number][]
  // How sharp it prints: picture pixels for each inch of paper.
  pixelsPerInch: number
}

export const POINTS_PER_INCH = 72
// Screens show 96 pixels to the inch, so a design looks its own size in a PDF reader at 100%.
const SCREEN_PPI = 96
// Sharp on paper; the printed-page sizes are made at it.
export const PRINT_PPI = 300
// The usual strip print shops ask for: an eighth of an inch (about 3 mm).
export const BLEED_INCHES = 0.125
// The cut lines start this far from the cut and are this long.
const MARK_GAP_INCHES = 0.125
const MARK_LENGTH_INCHES = 0.25
// Pictures for screens are kept small enough to share.
const SCREEN_MAX_SIDE = 4096
// Above this the PDF gets too big to make in a browser.
const PRINT_MAX_PIXELS = 150_000_000

// The paper width that prints the design at 300 pixels per inch: A4 designs come out as A4.
export function defaultWidthInches(designWidth: number): number {
  return designWidth / PRINT_PPI
}

export function pdfLayout(designWidth: number, designHeight: number, settings: PdfSettings): PdfLayout {
  const print = settings.purpose === 'print'
  const widthInches = print ? (settings.widthInches > 0 ? settings.widthInches : designWidth / PRINT_PPI) : designWidth / SCREEN_PPI
  const inchesPerPixel = widthInches / designWidth
  const trimWidth = widthInches * POINTS_PER_INCH
  const trimHeight = designHeight * inchesPerPixel * POINTS_PER_INCH

  const bleedInches = print && settings.bleed ? BLEED_INCHES : 0
  const marks = print && settings.cropMarks
  const slug = marks ? Math.max(bleedInches, MARK_GAP_INCHES + MARK_LENGTH_INCHES) * POINTS_PER_INCH : bleedInches * POINTS_PER_INCH
  const bleed = bleedInches * POINTS_PER_INCH

  const trimBox = { x: slug, y: slug, width: trimWidth, height: trimHeight }
  const bleedBox = { x: slug - bleed, y: slug - bleed, width: trimWidth + 2 * bleed, height: trimHeight + 2 * bleed }

  const bleedPixels = bleedInches / inchesPerPixel
  const area = { x: -bleedPixels, y: -bleedPixels, width: designWidth + 2 * bleedPixels, height: designHeight + 2 * bleedPixels }

  let scale: number
  if (print) {
    scale = PRINT_PPI * inchesPerPixel
    const pixels = area.width * area.height * scale * scale
    if (pixels > PRINT_MAX_PIXELS) scale *= Math.sqrt(PRINT_MAX_PIXELS / pixels)
  } else {
    // Twice the detail, so text stays crisp when zoomed in.
    scale = Math.min(2, SCREEN_MAX_SIDE / Math.max(designWidth, designHeight))
  }
  const imageWidth = Math.max(1, Math.round(area.width * scale))
  const imageHeight = Math.max(1, Math.round(area.height * scale))

  const lines: [number, number, number, number][] = []
  if (marks) {
    const gap = MARK_GAP_INCHES * POINTS_PER_INCH
    const end = (MARK_GAP_INCHES + MARK_LENGTH_INCHES) * POINTS_PER_INCH
    const left = trimBox.x
    const right = trimBox.x + trimWidth
    const top = trimBox.y
    const bottom = trimBox.y + trimHeight
    for (const x of [left, right]) {
      const out = x === left ? -1 : 1
      for (const y of [top, bottom]) {
        const down = y === top ? -1 : 1
        lines.push([x + out * gap, y, x + out * end, y])
        lines.push([x, y + down * gap, x, y + down * end])
      }
    }
  }

  return {
    pageWidth: trimWidth + 2 * slug,
    pageHeight: trimHeight + 2 * slug,
    area,
    scale,
    imageWidth,
    imageHeight,
    imageBox: bleedBox,
    trimBox,
    bleedBox,
    marks: lines,
    pixelsPerInch: scale / inchesPerPixel,
  }
}
