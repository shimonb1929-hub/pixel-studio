import { describe, expect, it } from 'vitest'
import { bestWindow, saliencyMap, slideFor } from './saliency.ts'
import type { Pixels } from './straighten.ts'

function picture(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

function grain(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return Math.round((n - Math.floor(n)) * 20) - 10
}

// A bright ball well off to the right on a plain, slightly grainy background.
const BALL = { x: 100, y: 30, r: 12 }
const ballPicture = picture(128, 72, (x, y) => {
  if (Math.hypot(x - BALL.x, y - BALL.y) < BALL.r) return [240, 200, 30]
  const g = grain(x, y)
  return [90 + g, 110 + g, 100 + g]
})

describe('saliencyMap', () => {
  it('finds the bright thing, not the plain middle', () => {
    const map = saliencyMap(ballPicture)
    const at = (x: number, y: number) => map.values[y * map.width + x]
    expect(at(BALL.x, BALL.y)).toBeGreaterThan(0.5)
    expect(at(64, 36)).toBeLessThan(0.2)
    expect(at(10, 60)).toBeLessThan(0.2)
  })

  it('pays no attention to see-through parts', () => {
    const map = saliencyMap(picture(40, 40, (x) => (x < 20 ? [255, 0, 0, 0] : [80, 80, 80, 255])))
    expect(map.values[20 * 40 + 5]).toBe(0)
  })
})

describe('bestWindow', () => {
  it('puts a square crop around the ball', () => {
    const map = saliencyMap(ballPicture)
    // A square as tall as the picture: 72 of 128 across.
    const window = bestWindow(map, 72 / 128, 1)
    const middle = (window.x + window.width / 2) * 128
    // As far right as it can go is 92 (128 - 36); the ball is at 100.
    expect(middle).toBeGreaterThan(84)
    expect(window.x + window.width).toBeLessThanOrEqual(1 + 1e-9)
    expect(window.y).toBe(0)
  })

  it('centers on the ball when the window has room around it', () => {
    const map = saliencyMap(ballPicture)
    const window = bestWindow(map, 0.4, 0.8)
    expect((window.x + window.width / 2) * 128).toBeCloseTo(BALL.x, -1)
    expect(Math.abs((window.y + window.height / 2) * 72 - BALL.y)).toBeLessThan(8)
  })

  it('stays inside the allowed area', () => {
    const map = saliencyMap(ballPicture)
    // The area takes in only the left part of the ball.
    const window = bestWindow(map, 0.3, 0.5, { x: 0, y: 0, width: 0.75, height: 1 })
    expect(window.x + window.width).toBeLessThanOrEqual(0.75 + 1e-9)
    // As near the ball as the area lets it go.
    expect(window.x + window.width).toBeCloseTo(0.75, 2)
  })

  it('keeps the middle for a plain picture', () => {
    const plain = saliencyMap(picture(100, 100, () => [128, 128, 128]))
    const window = bestWindow(plain, 0.5, 0.5)
    expect(window.x).toBeCloseTo(0.25, 1)
    expect(window.y).toBeCloseTo(0.25, 1)
  })
})

describe('slideFor', () => {
  it('slides the photo so the part in the middle of the shape is the one asked for', () => {
    expect(slideFor(0.5, 0.5)).toBe(0)
    // The right end of the photo, with half of it showing: slid all the way.
    expect(slideFor(0.75, 0.5)).toBe(-1)
    expect(slideFor(0.25, 0.5)).toBe(1)
    expect(slideFor(0.9, 0.5)).toBe(-1)
    expect(slideFor(0.6, 1)).toBe(0)
  })
})
