import { describe, expect, it } from 'vitest'
import { fontFileFormat, nameFromFileName, nameInFontFile } from './ownFonts.ts'

// The smallest font file there can be for reading a name: a header, one table entry and a name table
// with the full name written the Windows way (two bytes a letter).
function fontWithName(name: string): Uint8Array {
  const text = [...name].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255])
  const table = [0, 0, 0, 1, 0, 18, 0, 3, 0, 1, 0x04, 0x09, 0, 4, 0, text.length, 0, 0, ...text]
  const file = new Uint8Array(12 + 16 + table.length)
  const view = new DataView(file.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, 1)
  file.set([...'name'].map((c) => c.charCodeAt(0)), 12)
  view.setUint32(20, 28)
  view.setUint32(24, table.length)
  file.set(table, 28)
  return file
}

describe('fonts of your own', () => {
  it('knows a font file by its first bytes, whatever its name', () => {
    expect(fontFileFormat(fontWithName('x'))).toBe('truetype')
    expect(fontFileFormat(new TextEncoder().encode('OTTO and more bytes'))).toBe('opentype')
    expect(fontFileFormat(new TextEncoder().encode('wOF2 and more bytes'))).toBe('woff2')
    expect(fontFileFormat(new TextEncoder().encode('\x89PNG\r\n\x1a\n and more'))).toBeNull()
  })

  it('reads the name its maker wrote inside, in any language', async () => {
    expect(await nameInFontFile(fontWithName('Frank Ruhl Bold'))).toBe('Frank Ruhl Bold')
    expect(await nameInFontFile(fontWithName('דוד חדש'))).toBe('דוד חדש')
    // A damaged file has no name to read.
    expect(await nameInFontFile(fontWithName('Frank').subarray(0, 30))).toBeNull()
  })

  it('makes a readable name from a file name', () => {
    expect(nameFromFileName('MyFont-Bold_Italic.ttf')).toBe('MyFont Bold Italic')
  })
})
