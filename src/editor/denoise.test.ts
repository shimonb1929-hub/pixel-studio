import { describe, expect, it } from 'vitest'
import { denoiseLookAround, denoisePixels } from './denoise.ts'

// A steady stream of numbers that look random, the same every run.
function randomness(seed: number) {
  let s = seed
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return ((s >>> 8) & 0xffff) / 0xffff
  }
}

// A width × height picture: dark on the left half, light on the right, with speckles of light and
// of color, like a photo taken in low light.
function noisyPicture(width: number, height: number, noise: number, colorNoise: number, seed = 7): Uint8ClampedArray {
  const random = randomness(seed)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const base = x < width / 2 ? 60 : 190
      const light = (random() - 0.5) * 2 * noise
      data[i] = base + light + (random() - 0.5) * 2 * colorNoise
      data[i + 1] = base + light + (random() - 0.5) * 2 * colorNoise
      data[i + 2] = base + light + (random() - 0.5) * 2 * colorNoise
      data[i + 3] = 255
    }
  }
  return data
}

// How much each channel wanders around its own average, in a block of columns.
function spread(data: Uint8ClampedArray, width: number, height: number, fromX: number, toX: number): number {
  let total = 0
  for (let c = 0; c < 3; c++) {
    let sum = 0
    let squares = 0
    let n = 0
    for (let y = 0; y < height; y++) {
      for (let x = fromX; x < toX; x++) {
        const v = data[(y * width + x) * 4 + c]
        sum += v
        squares += v * v
        n++
      }
    }
    total += Math.sqrt(squares / n - (sum / n) ** 2)
  }
  return total / 3
}

// The average of a column of one channel.
function columnAverage(data: Uint8ClampedArray, width: number, height: number, x: number, c = 1): number {
  let sum = 0
  for (let y = 0; y < height; y++) sum += data[(y * width + x) * 4 + c]
  return sum / height
}

describe('clean grain', () => {
  it('takes most of the speckles out of an even area', () => {
    const width = 160
    const height = 120
    const data = noisyPicture(width, height, 14, 10)
    const before = spread(data, width, height, 10, 70)
    denoisePixels(data, width, height, 1, 1600)
    const after = spread(data, width, height, 10, 70)
    expect(after).toBeLessThan(before * 0.4)
    // The average light stays the same.
    expect(Math.abs(columnAverage(data, width, height, 40) - 60)).toBeLessThan(3)
  })

  it('more cleans more, and nothing changes nothing', () => {
    const width = 120
    const height = 80
    const original = noisyPicture(width, height, 12, 8)
    const none = original.slice()
    denoisePixels(none, width, height, 0, 1200)
    expect(none).toEqual(original)
    const little = original.slice()
    const lot = original.slice()
    denoisePixels(little, width, height, 0.25, 1200)
    denoisePixels(lot, width, height, 1, 1200)
    const before = spread(original, width, height, 5, 55)
    expect(spread(little, width, height, 5, 55)).toBeLessThan(before)
    expect(spread(lot, width, height, 5, 55)).toBeLessThan(spread(little, width, height, 5, 55))
  })

  it('keeps a sharp edge sharp', () => {
    const width = 160
    const height = 120
    const data = noisyPicture(width, height, 10, 6)
    denoisePixels(data, width, height, 1, 1600)
    // Two pixels either side of the edge are still nearly as dark and as light as before.
    expect(columnAverage(data, width, height, 78)).toBeLessThan(70)
    expect(columnAverage(data, width, height, 81)).toBeGreaterThan(180)
    // The jump still happens within a few pixels.
    expect(columnAverage(data, width, height, 82) - columnAverage(data, width, height, 77)).toBeGreaterThan(115)
  })

  it('cleans a big photo the quick way just as well, edges and all', () => {
    const width = 1800
    const height = 1450
    const data = noisyPicture(width, height, 14, 10)
    const before = spread(data, width, height, 100, 800)
    denoisePixels(data, width, height, 1, 1800)
    expect(spread(data, width, height, 100, 800)).toBeLessThan(before * 0.4)
    expect(columnAverage(data, width, height, 897)).toBeLessThan(72)
    expect(columnAverage(data, width, height, 902)).toBeGreaterThan(178)
  })

  it('removes colored speckles, so gray stays gray', () => {
    const width = 120
    const height = 80
    const data = noisyPicture(width, height, 0, 24)
    const colorfulness = () => {
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
      return sum / (data.length / 4)
    }
    const before = colorfulness()
    denoisePixels(data, width, height, 1, 1200)
    expect(colorfulness()).toBeLessThan(before * 0.35)
  })

  it('leaves see-through parts alone and keeps the edge of a photo from darkening', () => {
    const width = 80
    const height = 60
    const data = noisyPicture(width, height, 8, 4)
    // The left half is empty, see-through space.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < 40; x++) data.set([0, 0, 0, 0], (y * width + x) * 4)
    }
    denoisePixels(data, width, height, 1, 800)
    for (let y = 0; y < height; y++) expect(data[(y * width + 10) * 4 + 3]).toBe(0)
    expect(columnAverage(data, width, height, 40)).toBeGreaterThan(180)
  })

  it('looks further around for more cleaning and bigger pictures', () => {
    expect(denoiseLookAround(0, 1000)).toBe(0)
    expect(denoiseLookAround(1, 1000)).toBeGreaterThan(0)
    expect(denoiseLookAround(1, 4000)).toBeGreaterThan(denoiseLookAround(1, 1000))
    expect(denoiseLookAround(1, 4000)).toBeGreaterThanOrEqual(denoiseLookAround(0.2, 4000))
  })
})
