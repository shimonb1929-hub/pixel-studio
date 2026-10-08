import { describe, expect, it } from 'vitest'
import { hexToHsv, hexToRgb, hsvToHex, hsvToRgb, isLight, normalizeHex, rgbToHex, rgbToHsv } from './color.ts'

describe('normalizeHex', () => {
  it('accepts short and long codes, with or without #', () => {
    expect(normalizeHex('#3366FF')).toBe('#3366ff')
    expect(normalizeHex('3366ff')).toBe('#3366ff')
    expect(normalizeHex('#36f')).toBe('#3366ff')
    expect(normalizeHex(' 36F ')).toBe('#3366ff')
  })

  it('rejects anything that is not a color code', () => {
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('blue')).toBeNull()
    expect(normalizeHex('#gg0000')).toBeNull()
  })
})

describe('conversions', () => {
  it('round-trips hex and rgb', () => {
    expect(hexToRgb('#3366ff')).toEqual({ r: 51, g: 102, b: 255 })
    expect(rgbToHex({ r: 51, g: 102, b: 255 })).toBe('#3366ff')
    expect(rgbToHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080')
  })

  it('converts known colors to hsv', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 })
    expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 1 })
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('round-trips every swatch-like color through hsv', () => {
    for (const hex of ['#ef4444', '#14b8a6', '#8b5cf6', '#1b1d23', '#fbe7a1', '#808080']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })

  it('wraps hue around the color wheel', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 })
  })
})

describe('isLight', () => {
  it('tells light colors from dark ones', () => {
    expect(isLight('#ffffff')).toBe(true)
    expect(isLight('#facc15')).toBe(true)
    expect(isLight('#1b1d23')).toBe(false)
    expect(isLight('#3b5bfd')).toBe(false)
  })
})
