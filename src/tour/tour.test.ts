import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { caption, readingTime, wordsSpoken } from './tour.ts'
import { detailTour, posterTour, showcaseTour, toolsTour, TOURS } from './tours.ts'

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
})

describe('tours', () => {
  it('every step is spoken from a recording that is there', () => {
    for (const tour of [toolsTour(), posterTour(), detailTour(), showcaseTour()]) {
      expect(tour.steps.length).toBeGreaterThan(5)
      for (const step of tour.steps) {
        expect(step.line, `${tour.id} ${step.id}`).toBeTruthy()
        expect(step.audio, `${tour.id} ${step.id}`).toBeTruthy()
        expect(existsSync(join(import.meta.dirname, '../../public', step.audio!)), step.audio).toBe(true)
      }
    }
  })

  it('every tour can be started from the list', () => {
    expect(TOURS.map((tour) => tour.start().id)).toEqual(TOURS.map((tour) => tour.id))
  })
})

describe('the deep dive and the showcase', () => {
  it('speak the recorded words, word for word', async () => {
    const { DETAIL, SHOWCASE } = await import('./lines.ts')
    expect(detailTour().steps.map((s) => s.line)).toEqual(Object.values(DETAIL))
    expect(showcaseTour().steps.map((s) => s.line)).toEqual(Object.values(SHOWCASE))
  })
})
