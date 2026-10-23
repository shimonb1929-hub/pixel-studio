import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { makePdf, pdfPageSize } from './pdf.ts'

describe('PDF for printing', () => {
  it('prints an A4 design on an A4 page', () => {
    // A4 is 595.28 × 841.89 points.
    const page = pdfPageSize(2480, 3508)
    expect(page.width).toBeCloseTo(595.2, 0)
    expect(page.height).toBeCloseTo(841.9, 0)
  })

  it('makes a file whose index points at every part, with see-through printed as white', async () => {
    // Two pixels: solid red, and fully see-through.
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0])
    const bytes = new Uint8Array(await (await makePdf(pixels, 2, 1)).arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

    const xref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const entries = [...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    expect(entries).toHaveLength(5)
    entries.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`))

    const start = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 7
    const size = Number(text.match(/\/Image .*\/Length (\d+)/)![1])
    expect([...inflateSync(bytes.slice(start, start + size))]).toEqual([255, 0, 0, 255, 255, 255])
  })
})
