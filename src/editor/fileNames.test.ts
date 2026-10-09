import { describe, expect, it } from 'vitest'
import { validateDocumentSize } from './document.ts'
import { exportFileName, formatFileSize, nextNumberedName, sanitizeFileName, stripExtension, uniqueName } from './fileNames.ts'

describe('file names', () => {
  it('strips only the last extension', () => {
    expect(stripExtension('photo.jpg')).toBe('photo')
    expect(stripExtension('my.photo.png')).toBe('my.photo')
    expect(stripExtension('Untitled-1')).toBe('Untitled-1')
    expect(stripExtension('.hidden')).toBe('.hidden')
  })

  it('replaces characters that file systems reject', () => {
    expect(sanitizeFileName(' a/b:c? ')).toBe('a-b-c-')
  })

  it('adds the right extension and never returns an empty name', () => {
    expect(exportFileName('photo', 'jpeg')).toBe('photo.jpg')
    expect(exportFileName('photo', 'png')).toBe('photo.png')
    expect(exportFileName('Birthday card', 'project')).toBe('Birthday card.pixel')
    expect(exportFileName('   ', 'png')).toBe('image.png')
  })

  it('gives new designs names that are not taken yet', () => {
    expect(uniqueName('Square post', [])).toBe('Square post')
    expect(uniqueName('Square post', ['Square post', 'Square post 2'])).toBe('Square post 3')
    expect(nextNumberedName('My design', [])).toBe('My design 1')
    expect(nextNumberedName('My design', ['My design 3', 'My design 10x', 'Card'])).toBe('My design 4')
    expect(nextNumberedName('My design', ['My design 1'], 4)).toBe('My design 5')
  })

  it('formats file sizes for people', () => {
    expect(formatFileSize(900)).toBe('900 bytes')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB')
  })
})

describe('validateDocumentSize', () => {
  it('accepts normal sizes', () => {
    expect(validateDocumentSize(1920, 1080)).toBeNull()
    expect(validateDocumentSize(1, 10000)).toBeNull()
  })

  it('rejects sizes a browser cannot handle', () => {
    expect(validateDocumentSize(0, 100)).toMatch(/at least 1/)
    expect(validateDocumentSize(10001, 100)).toMatch(/at most 10,000/)
    expect(validateDocumentSize(10.5, 100)).toMatch(/whole numbers/)
    expect(validateDocumentSize(Number.NaN, 100)).toMatch(/whole numbers/)
  })
})
