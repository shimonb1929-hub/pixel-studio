import { describe, expect, it } from 'vitest'
import { FONT_PURPOSES } from './fontPurposes.ts'
import { fontInfo } from './fonts.ts'

describe('font purposes', () => {
  it('name only fonts that come with the program, each once per purpose', () => {
    for (const purpose of FONT_PURPOSES) {
      expect(purpose.fonts.filter((id) => !fontInfo(id)), purpose.value).toEqual([])
      expect(new Set(purpose.fonts).size, purpose.value).toBe(purpose.fonts.length)
    }
  })

  it('offer only Hebrew fonts for Torah and seforim', () => {
    const torah = FONT_PURPOSES.find((purpose) => purpose.value === 'torah')!
    expect(torah.fonts.filter((id) => !fontInfo(id)?.hebrew)).toEqual([])
  })
})
