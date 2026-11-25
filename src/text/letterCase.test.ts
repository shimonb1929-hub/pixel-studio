import { describe, expect, it } from 'vitest'
import { changeCase, hasCase } from './letterCase.ts'

describe('changing letters', () => {
  it('makes capitals, small letters, each word or the first word capital', () => {
    expect(changeCase('hello big World', 'upper')).toBe('HELLO BIG WORLD')
    expect(changeCase('Hello BIG World', 'lower')).toBe('hello big world')
    expect(changeCase("the cat's café-bar", 'title')).toBe("The Cat's Café-Bar")
    expect(changeCase('ONE TWO. three! four?\nfive', 'sentence')).toBe('One two. Three! Four?\nFive')
  })

  it('keeps every letter one letter, so styled words stay in place', () => {
    expect(changeCase('straße', 'upper')).toBe('STRAßE')
    expect(changeCase('straße', 'upper').length).toBe('straße'.length)
  })

  it('leaves Hebrew and Yiddish letters as they are', () => {
    expect(changeCase('שלום abc', 'upper')).toBe('שלום ABC')
    expect(hasCase('שלום עולם')).toBe(false)
    expect(hasCase('שלום abc')).toBe(true)
    expect(hasCase('123')).toBe(false)
  })
})
