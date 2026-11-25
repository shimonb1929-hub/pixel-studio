import { describe, expect, it } from 'vitest'
import { caption, readingTime, wordsSpoken } from './tour.ts'
import { RECORDED } from './lines.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('tour words', () => {
  it('leaves out how-to-sound notes', () => {
    expect(caption('[excited] Hey! Let us go.')).toBe('Hey! Let us go.')
  })

  it('lights up words in order as the voice goes on', () => {
    const words = 'Brush paints by hand, just like on paper.'.split(' ')
    expect(wordsSpoken(words, 0)).toBe(0)
    expect(wordsSpoken(words, 1)).toBe(words.length)
    let before = 0
    for (let f = 0; f <= 1; f += 0.05) {
      const now = wordsSpoken(words, f)
      expect(now).toBeGreaterThanOrEqual(before)
      before = now
    }
    expect(wordsSpoken(words, 0.5)).toBeGreaterThan(1)
    expect(wordsSpoken(words, 0.5)).toBeLessThan(words.length - 1)
  })

  it('gives words without a recording time to be read', () => {
    expect(readingTime('Hi')).toBe(2.5)
    expect(readingTime('one two three four five six seven eight nine ten eleven twelve')).toBeGreaterThan(4)
  })

  it('every recorded line has its recording', () => {
    for (const id of Object.keys(RECORDED)) expect(existsSync(join(import.meta.dirname, '../../public/tour', `tools-${id}.mp3`)), id).toBe(true)
  })
})
