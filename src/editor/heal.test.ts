import { describe, expect, it } from 'vitest'
import { healPixels } from './heal.ts'

function picture(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y)
      data.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return data
}

function circle(width: number, height: number, cx: number, cy: number, r: number): Uint8Array {
  const hole = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) hole[y * width + x] = (x - cx) ** 2 + (y - cy) ** 2 <= r * r ? 1 : 0
  return hole
}

const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('healPixels', () => {
  it('makes a spot on a plain background disappear', () => {
    const size = 80
    const data = picture(size, size, (x, y) => ((x - 40) ** 2 + (y - 40) ** 2 <= 64 ? [20, 20, 20] : [200, 120, 60]))
    expect(healPixels(data, size, size, circle(size, size, 40, 40, 10))).toBe(true)
    for (const [x, y] of [
      [40, 40],
      [35, 44],
      [46, 38],
    ]) {
      const [r, g, b, a] = at(data, size, x, y)
      expect(Math.abs(r - 200) + Math.abs(g - 120) + Math.abs(b - 60)).toBeLessThan(12)
      expect(a).toBe(255)
    }
  })

  it('carries on stripes through the hole', () => {
    const width = 96
    const height = 96
    // Horizontal stripes, 8 pixels each.
    const stripe = (y: number): [number, number, number] => (Math.floor(y / 8) % 2 ? [240, 240, 240] : [30, 60, 200])
    const data = picture(width, height, (_x, y) => stripe(y))
    const hole = new Uint8Array(width * height)
    for (let y = 36; y < 60; y++) for (let x = 36; x < 60; x++) hole[y * width + x] = 1
    healPixels(data, width, height, hole)
    let wrong = 0
    for (let y = 36; y < 60; y++) {
      for (let x = 36; x < 60; x++) {
        const [r, g, b] = at(data, width, x, y)
        const [er, eg, eb] = stripe(y)
        if (Math.abs(r - er) + Math.abs(g - eg) + Math.abs(b - eb) > 60) wrong++
      }
    }
    // Only the edges between stripes may be a little soft.
    expect(wrong / (24 * 24)).toBeLessThan(0.1)
  })

  it('leaves everything outside the hole exactly as it was', () => {
    const size = 48
    const data = picture(size, size, (x, y) => [x * 5, y * 5, 100])
    const before = Uint8ClampedArray.from(data)
    const hole = circle(size, size, 24, 24, 5)
    healPixels(data, size, size, hole)
    for (let i = 0; i < hole.length; i++) {
      if (hole[i]) continue
      expect(at(data, size, i % size, Math.floor(i / size))).toEqual(at(before, size, i % size, Math.floor(i / size)))
    }
  })
})
