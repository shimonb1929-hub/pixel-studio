import { describe, expect, it } from 'vitest'
import { blurPixels } from '../editor/adjust.ts'
import { backgroundBlurSigma, backgroundWeight, blurredBackground, softMask, usableSubject } from './blurBackground.ts'

// A 60 × 20 picture: a red main thing on the left third, and a background of blue and white
// stripes (4 pixels wide) on the rest.
const W = 60
const H = 20
function picture() {
  const data = new Uint8ClampedArray(W * H * 4)
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const subject = x < 20
      mask[i] = subject ? 1 : 0
      const color = subject ? [220, 30, 30] : Math.floor(x / 4) % 2 ? [255, 255, 255] : [30, 60, 200]
      data.set([...color, 255], i * 4)
    }
  }
  return { data, mask }
}
const at = (data: Uint8ClampedArray, x: number, y: number) => Array.from(data.slice((y * W + x) * 4, (y * W + x) * 4 + 4))

describe('Blur the background', () => {
  it('blurs more for higher slider positions, and the same amount for any photo size', () => {
    expect(backgroundBlurSigma(0, 1000)).toBe(0)
    expect(backgroundBlurSigma(0.3, 1000)).toBeLessThan(backgroundBlurSigma(0.6, 1000))
    expect(backgroundBlurSigma(1, 4000) / 4000).toBeCloseTo(backgroundBlurSigma(1, 400) / 400)
  })

  it('gives the main thing a soft edge', () => {
    const { mask } = picture()
    const soft = softMask(mask, W, H, 2)
    expect(soft[10 * W + 5]).toBe(255)
    expect(soft[10 * W + 40]).toBe(0)
    // Across the edge it fades from the main thing to the background.
    expect(soft[10 * W + 18]).toBeGreaterThan(soft[10 * W + 20])
    expect(soft[10 * W + 20]).toBeGreaterThan(soft[10 * W + 22])
    expect(soft[10 * W + 19]).toBeGreaterThan(100)
    expect(soft[10 * W + 19]).toBeLessThan(250)
  })

  it('counts nothing that is mostly the main thing as background', () => {
    expect(backgroundWeight(255)).toBe(0)
    expect(backgroundWeight(128)).toBe(0)
    expect(backgroundWeight(0)).toBe(255)
    expect(backgroundWeight(64)).toBeGreaterThan(0)
  })

  it("never smears the main thing's color into the background, as a plain blur would", () => {
    const { data, mask } = picture()
    const soft = softMask(mask, W, H, 1)
    const blurred = blurredBackground(data, soft, W, H, 4)
    // Right next to the main thing, the background has no red in it.
    const [r, g, b] = at(blurred, 22, 10)
    expect(r).toBeLessThan(g + 5)
    expect(b).toBeGreaterThan(r + 40)
    // A plain blur pulls the red in.
    const plain = data.slice()
    blurPixels(plain, W, H, 4)
    const [pr, pg] = at(plain, 22, 10)
    expect(pr).toBeGreaterThan(pg + 20)
  })

  it('smooths the stripes behind into an even mix', () => {
    const { data, mask } = picture()
    const blurred = blurredBackground(data, softMask(mask, W, H, 1), W, H, 4)
    // Blue (30, 60, 200) and white stripes, evenly mixed, away from the edges.
    for (const x of [36, 38, 40, 42]) {
      const [r, g, b] = at(blurred, x, 10)
      expect(Math.abs(r - 142)).toBeLessThan(25)
      expect(Math.abs(g - 157)).toBeLessThan(25)
      expect(Math.abs(b - 227)).toBeLessThan(15)
    }
  })

  it('fills in under the soft edge from the background nearby, never with black', () => {
    const { data, mask } = picture()
    const soft = softMask(mask, W, H, 3)
    // A tiny blur reaches hardly anywhere, so the inside of the edge needs filling in.
    const blurred = blurredBackground(data, soft, W, H, 0.5)
    for (let x = 0; x < W; x++) {
      if (soft[10 * W + x] === 255) continue
      const [r, g, b, a] = at(blurred, x, 10)
      expect(a).toBe(255)
      expect(r + g + b, `x = ${x}`).toBeGreaterThan(200)
      // Where it shows at all, it's background color (blue or white), not the main thing's red.
      expect(b, `x = ${x}`).toBeGreaterThan(150)
    }
  })

  it('keeps how see-through each pixel is', () => {
    const { data, mask } = picture()
    for (let i = 0; i < W * H; i++) if (i % W > 50) data[i * 4 + 3] = 0
    const blurred = blurredBackground(data, softMask(mask, W, H, 1), W, H, 3)
    expect(at(blurred, 55, 5)[3]).toBe(0)
    expect(at(blurred, 30, 5)[3]).toBe(255)
  })

  it('only works when the AI found a main thing that is not the whole photo', () => {
    expect(usableSubject(picture().mask)).toBe(true)
    expect(usableSubject(new Uint8Array(100))).toBe(false)
    expect(usableSubject(new Uint8Array(100).fill(1))).toBe(false)
  })
})
