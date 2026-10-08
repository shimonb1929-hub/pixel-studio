import { describe, expect, it } from 'vitest'
import { floodRegion, growRegion } from './flood.ts'

// Builds RGBA pixels from rows like 'wwb', where w is white and b is black.
function image(rows: string[]) {
  const width = rows[0].length
  const height = rows.length
  const data = new Uint8ClampedArray(width * height * 4)
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const v = c === 'b' ? 0 : c === 'g' ? 120 : 255
      data.set([v, v, v, 255], (y * width + x) * 4)
    }),
  )
  return { data, width, height }
}

const masked = (mask: Uint8Array, width: number) =>
  Array.from({ length: mask.length / width }, (_, y) => Array.from(mask.slice(y * width, (y + 1) * width)).join(''))

describe('floodRegion', () => {
  it('fills the inside of an outline and stops at it', () => {
    const img = image(['bbbbb', 'bwwwb', 'bwwwb', 'bbbbb'])
    const region = floodRegion(img.data, img.width, img.height, 2, 1, 10)!
    expect(masked(region.mask, img.width)).toEqual(['00000', '01110', '01110', '00000'])
    expect(region.bounds).toEqual({ x: 1, y: 1, width: 3, height: 2 })
  })

  it('goes around corners and into every connected nook', () => {
    const img = image(['wwbww', 'wbbbw', 'wwwww'])
    const region = floodRegion(img.data, img.width, img.height, 0, 0, 10)!
    expect(masked(region.mask, img.width)).toEqual(['11011', '10001', '11111'])
  })

  it('treats similar colors as the same when the tolerance allows', () => {
    const img = image(['wgw'])
    expect(masked(floodRegion(img.data, 3, 1, 0, 0, 10)!.mask, 3)).toEqual(['100'])
    expect(masked(floodRegion(img.data, 3, 1, 0, 0, 200)!.mask, 3)).toEqual(['111'])
  })

  it('does nothing outside the picture', () => {
    const img = image(['w'])
    expect(floodRegion(img.data, 1, 1, 5, 0, 10)).toBeNull()
  })
})

describe('growRegion', () => {
  it('adds a one-pixel border around the region', () => {
    const img = image(['bbbbb', 'bbwbb', 'bbbbb'])
    const region = floodRegion(img.data, 5, 3, 2, 1, 10)!
    const grown = growRegion(region, 5, 3)
    expect(masked(grown.mask, 5)).toEqual(['01110', '01110', '01110'])
    expect(grown.bounds).toEqual({ x: 1, y: 0, width: 3, height: 3 })
  })
})
