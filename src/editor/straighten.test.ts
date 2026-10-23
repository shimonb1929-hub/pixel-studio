import { describe, expect, it } from 'vitest'
import { findTilt, type Pixels } from './straighten.ts'
import { coverScale, frameRect, levelingTurn, needsTrim, quarterTurn, straightenedBox, trimmedSize } from './straightenBox.ts'
import { boxCorners } from './transform.ts'

// A drawn photo: `paint` gives each pixel's color.
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

// A little grain, the same every run, so the pictures aren't perfectly clean.
function grain(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return Math.round((n - Math.floor(n)) * 16) - 8
}

const clamp = (v: number) => Math.max(0, Math.min(255, v))

// Sky above a horizon that leans `degrees` clockwise (its right end lower), sea below.
function horizon(width: number, height: number, degrees: number): Pixels {
  const slope = Math.tan((degrees * Math.PI) / 180)
  return picture(width, height, (x, y) => {
    const line = height * 0.45 + (x - width / 2) * slope
    const g = grain(x, y)
    return y < line ? [clamp(150 + g), clamp(200 + g), clamp(235 + g)] : [clamp(30 + g), clamp(80 + g), clamp(120 + g)]
  })
}

describe('findTilt', () => {
  it('finds how far a horizon leans, either way', () => {
    for (const degrees of [5, -3.5, 12, 0.8]) {
      const tilt = findTilt(horizon(400, 300, degrees))
      expect(tilt).not.toBeNull()
      expect(tilt!.lines).toBe('across')
      expect(Math.abs(tilt!.angle - degrees)).toBeLessThan(0.3)
    }
  })

  it('says a level horizon is level', () => {
    const tilt = findTilt(horizon(400, 300, 0))
    expect(Math.abs(tilt!.angle)).toBeLessThan(0.15)
  })

  it('goes by upright walls too', () => {
    const slope = Math.tan((4 * Math.PI) / 180)
    // A light wall meeting a dark one, leaning 4° clockwise: turning clockwise moves the bottom of
    // an upright line to the left.
    const pixels = picture(300, 400, (x, y) => {
      const edge = 150 - (y - 200) * slope
      const g = grain(x, y)
      return x < edge ? [clamp(200 + g), clamp(190 + g), clamp(170 + g)] : [clamp(60 + g), clamp(50 + g), clamp(45 + g)]
    })
    const tilt = findTilt(pixels)
    expect(tilt!.lines).toBe('upright')
    expect(Math.abs(tilt!.angle - 4)).toBeLessThan(0.3)
  })

  it('finds nothing in a picture with no straight lines', () => {
    const smooth = picture(300, 300, (x, y) => [clamp(100 + x / 4), clamp(120 + y / 5), 140])
    expect(findTilt(smooth)).toBeNull()
    // A round ball has edges, but no long straight ones.
    const ball = picture(300, 300, (x, y) => (Math.hypot(x - 150, y - 150) < 60 ? [220, 40, 40] : [150, 200, 235]))
    expect(findTilt(ball)).toBeNull()
  })

  it('is not fooled by busy texture', () => {
    const speckle = (x: number, y: number) => {
      const n = Math.sin(x * 3.1 + y * 7.7) * 1000
      return n - Math.floor(n)
    }
    const noisy = picture(400, 300, (x, y) => {
      const v = speckle(x, y) * 200
      return [v, v, v]
    })
    expect(findTilt(noisy)).toBeNull()
    // A field of rough grass under a leaning horizon: the horizon still wins.
    const slope = Math.tan((6 * Math.PI) / 180)
    const field = picture(400, 300, (x, y) => {
      const v = speckle(x, y) * 90
      return y < 120 + (x - 200) * slope ? [150, 200, 235] : [40 + v, 90 + v, 40]
    })
    expect(Math.abs(findTilt(field)!.angle - 6)).toBeLessThan(0.3)
  })

  it('ignores the outline of a see-through cut-out', () => {
    // A level square photo on see-through: its edges are straight, but they are not in the photo.
    const cutout = picture(300, 300, (x, y) => (x > 50 && x < 250 && y > 50 && y < 250 ? [120, 120, 120, 255] : [0, 0, 0, 0]))
    expect(findTilt(cutout)).toBeNull()
  })
})

describe('straightening the box', () => {
  const box = { cx: 200, cy: 150, width: 400, height: 300, rotation: 0 }

  it('turns the other way from the lean, mirrored pictures the same way they lean', () => {
    expect(levelingTurn(box, 5)).toBe(-5)
    expect(levelingTurn({ ...box, width: -400 }, 5)).toBe(5)
    expect(levelingTurn({ ...box, width: -400, height: -300 }, 5)).toBe(-5)
  })

  it('grows just enough to cover its frame', () => {
    expect(coverScale(400, 300, 0)).toBe(1)
    const turned = straightenedBox(box, -5)
    expect(turned.rotation).toBeCloseTo((-5 * Math.PI) / 180)
    // Every corner of the frame is inside the turned picture.
    const cos = Math.cos(turned.rotation)
    const sin = Math.sin(turned.rotation)
    for (const [x, y] of [[0, 0], [400, 0], [400, 300], [0, 300]]) {
      const dx = x - turned.cx
      const dy = y - turned.cy
      const localX = dx * cos + dy * sin
      const localY = -dx * sin + dy * cos
      expect(Math.abs(localX)).toBeLessThanOrEqual(turned.width / 2 + 1e-6)
      expect(Math.abs(localY)).toBeLessThanOrEqual(turned.height / 2 + 1e-6)
    }
    // And not much more: one corner touches.
    expect(coverScale(400, 300, 5)).toBeLessThan(1.2)
  })

  it('keeps a quarter turn made on purpose', () => {
    expect(quarterTurn(Math.PI / 2 + 0.05)).toBeCloseTo(Math.PI / 2)
    const sideways = { ...box, rotation: Math.PI / 2 + 0.05 }
    expect(straightenedBox(sideways, 3).rotation).toBeCloseTo(Math.PI / 2 + (3 * Math.PI) / 180)
    expect(frameRect(sideways)).toEqual(expect.objectContaining({ width: expect.closeTo(300, 6), height: expect.closeTo(400, 6) }))
  })

  it('trims only when the grown picture would show outside its frame on the page', () => {
    const turned = straightenedBox(box, 5)
    // The photo fills the page: the page's edge trims it.
    expect(needsTrim(turned, frameRect(box), { width: 400, height: 300 })).toBe(false)
    // The photo sits on a bigger page: it would stick out.
    expect(needsTrim(turned, frameRect(box), { width: 1000, height: 1000 })).toBe(true)
    expect(boxCorners(turned)).toHaveLength(4)
  })

  it('trims to the part that shows, at the photo’s own detail', () => {
    // A 4000 × 3000 photo shown at 400 × 300: ten of its pixels for each design pixel.
    const size = trimmedSize(box, 4000, 3000, 5)
    const scale = coverScale(400, 300, 5)
    expect(size.density).toBeCloseTo(10 / scale)
    expect(size.width).toBe(Math.round(4000 / scale))
    expect(size.height).toBe(Math.round(3000 / scale))
  })
})
