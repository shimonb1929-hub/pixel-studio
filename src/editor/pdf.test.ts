import { describe, expect, it } from 'vitest'
import { buildPdf } from './pdf.ts'
import { BLEED_INCHES, defaultWidthInches, pdfLayout, POINTS_PER_INCH, PRINT_PPI } from './pdfLayout.ts'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('pdf file', () => {
  const image = { width: 2, height: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]), filter: 'FlateDecode' as const }

  it('writes a page with the picture, and an index that points at every part', () => {
    const bytes = buildPdf([{ width: 200, height: 100, image, imageBox: { x: 0, y: 0, width: 200, height: 100 } }], 'Card')
    const file = text(bytes)
    expect(file.startsWith('%PDF-1.4')).toBe(true)
    expect(file).toContain('/MediaBox [0 0 200 100]')
    expect(file).toContain('/Width 2 /Height 1')
    expect(file.trimEnd().endsWith('%%EOF')).toBe(true)
    const xref = Number(/startxref\n(\d+)/.exec(file)![1])
    expect(file.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...file.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(6)
    expect(file).toContain('/Kids [4 0 R] /Count 1')
    offsets.forEach((offset, i) => expect(file.slice(offset)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })

  it('puts each page in order, each with its own picture', () => {
    const page = { width: 10, height: 10, image, imageBox: { x: 0, y: 0, width: 10, height: 10 } }
    const file = text(buildPdf([page, page, page], 'Menu'))
    expect(file).toContain('/Kids [4 0 R 7 0 R 10 0 R] /Count 3')
    expect(file.match(/\/Type \/Page /g)).toHaveLength(3)
    expect(file).toContain('/XObject << /Im0 12 0 R >> >> /Contents 11 0 R')
  })

  it('keeps a Hebrew title readable', () => {
    const file = text(buildPdf([{ width: 10, height: 10, image, imageBox: { x: 0, y: 0, width: 10, height: 10 } }], 'שלום'))
    expect(file).toContain('/Title <FEFF05E905DC05D505DD>')
  })

  it('turns top-left boxes and lines into PDF coordinates, counted from the bottom', () => {
    const file = text(
      buildPdf(
        [
          {
            width: 100,
            height: 100,
            image,
            imageBox: { x: 10, y: 20, width: 50, height: 30 },
            trimBox: { x: 10, y: 20, width: 50, height: 30 },
            marks: [[0, 20, 5, 20]],
          },
        ],
        '',
      ),
    )
    expect(file).toContain('50 0 0 30 10 50 cm')
    expect(file).toContain('/TrimBox [10 50 60 80]')
    expect(file).toContain('0 80 m 5 80 l S')
  })
})

describe('pdf layout', () => {
  const a4 = { width: 2480, height: 3508 }

  it('prints an A4 design as A4 at full detail', () => {
    const layout = pdfLayout(a4.width, a4.height, { purpose: 'print', widthInches: defaultWidthInches(a4.width), bleed: false, cropMarks: false })
    expect(layout.pageWidth / POINTS_PER_INCH).toBeCloseTo(8.27, 2)
    expect(layout.pageHeight / POINTS_PER_INCH).toBeCloseTo(11.69, 2)
    expect(layout.pixelsPerInch).toBeCloseTo(PRINT_PPI, 0)
    expect(layout.marks).toEqual([])
  })

  it('draws text and shapes again at 300 per inch when a small design prints big', () => {
    const layout = pdfLayout(1080, 1080, { purpose: 'print', widthInches: 10, bleed: false, cropMarks: false })
    expect(layout.imageWidth).toBe(3000)
    expect(layout.scale).toBeCloseTo(3000 / 1080)
  })

  it('adds an eighth of an inch of design around the edge for cutting', () => {
    const layout = pdfLayout(3000, 3000, { purpose: 'print', widthInches: 10, bleed: true, cropMarks: false })
    const bleed = BLEED_INCHES * POINTS_PER_INCH
    expect(layout.pageWidth).toBeCloseTo(720 + 2 * bleed)
    expect(layout.trimBox).toEqual({ x: bleed, y: bleed, width: 720, height: 720 })
    expect(layout.area.x).toBeCloseTo(-BLEED_INCHES * 300)
    expect(layout.imageWidth).toBe(3075)
  })

  it('puts two cut lines at each corner, outside the design', () => {
    const layout = pdfLayout(3000, 3000, { purpose: 'print', widthInches: 10, bleed: true, cropMarks: true })
    expect(layout.marks).toHaveLength(8)
    const { trimBox } = layout
    for (const [x1, y1, x2, y2] of layout.marks) {
      const inside = (x: number, y: number) => x > trimBox.x && x < trimBox.x + trimBox.width && y > trimBox.y && y < trimBox.y + trimBox.height
      expect(inside(x1, y1) || inside(x2, y2)).toBe(false)
      expect(Math.min(x1, x2, y1, y2)).toBeGreaterThanOrEqual(0)
      expect(Math.max(x1, x2)).toBeLessThanOrEqual(layout.pageWidth)
    }
  })

  it('keeps screen PDFs small and the design at its own size', () => {
    const layout = pdfLayout(1920, 1080, { purpose: 'screen', widthInches: 50, bleed: true, cropMarks: true })
    expect(layout.pageWidth).toBe(1440)
    expect(layout.imageWidth).toBe(3840)
    expect(layout.marks).toEqual([])
    expect(pdfLayout(4000, 3000, { purpose: 'screen', widthInches: 0, bleed: false, cropMarks: false }).imageWidth).toBe(4096)
  })

  it('stays within what a browser can make for a huge poster', () => {
    const layout = pdfLayout(1000, 1000, { purpose: 'print', widthInches: 100, bleed: false, cropMarks: false })
    expect(layout.imageWidth * layout.imageHeight).toBeLessThanOrEqual(150_000_001)
  })
})
