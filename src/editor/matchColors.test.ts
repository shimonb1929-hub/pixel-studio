import { describe, expect, it } from 'vitest'
import { adjustColors, curveTable, NO_ADJUSTMENTS, type Adjustments } from './adjust.ts'
import { matchColors, matchCurve, toneAt } from './matchColors.ts'

// A picture of `count` pixels: a smooth run of tones from `dark` to `light` (each an RGB color).
function gradient(count: number, dark: number[], light: number[], alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    const k = i / (count - 1)
    for (let c = 0; c < 3; c++) data[i * 4 + c] = dark[c] + (light[c] - dark[c]) * k
    data[i * 4 + 3] = alpha
  }
  return data
}

function averages(data: Uint8ClampedArray): number[] {
  const sums = [0, 0, 0]
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    for (let c = 0; c < 3; c++) sums[c] += data[i + c]
    n++
  }
  return sums.map((s) => s / n)
}

const withSettings = (data: Uint8ClampedArray, patch: Partial<Adjustments>) => {
  const out = data.slice()
  adjustColors(out, { ...NO_ADJUSTMENTS, ...patch })
  return out
}

const counts = (values: number[]) => {
  const list = new Uint32Array(256)
  for (const v of values) list[v]++
  return list
}

describe('match colors', () => {
  it('finds the tone a share of the pixels is darker than', () => {
    const list = counts(Array.from({ length: 256 }, (_, i) => i))
    expect(toneAt(list, 256, 0.5)).toBeCloseTo(0.5, 1)
    expect(toneAt(list, 256, 0.02)).toBeLessThan(0.03)
    expect(toneAt(list, 256, 0.98)).toBeGreaterThan(0.97)
  })

  it('a bluish picture matched to a warm one gets warm averages', () => {
    const bluish = gradient(4000, [10, 30, 70], [150, 180, 240])
    const warm = gradient(4000, [60, 30, 10], [250, 200, 140])
    const settings = matchColors(bluish, warm)
    const [r, g, b] = averages(withSettings(bluish, settings))
    const goal = averages(warm)
    expect(r).toBeGreaterThan(b)
    expect(Math.abs(r - goal[0])).toBeLessThan(10)
    expect(Math.abs(g - goal[1])).toBeLessThan(10)
    expect(Math.abs(b - goal[2])).toBeLessThan(10)
    // Each curve has a handful of points, from the darkest tone to the brightest.
    for (const points of [settings.curve!.red!, settings.curve!.green!, settings.curve!.blue!]) {
      expect(points.length).toBeGreaterThanOrEqual(5)
      expect(points.length).toBeLessThanOrEqual(7)
      expect(points[0][0]).toBe(0)
      expect(points[points.length - 1][0]).toBe(1)
    }
  })

  it('"How much" moves the curves back toward straight', () => {
    const bluish = gradient(2000, [10, 30, 70], [150, 180, 240])
    const warm = gradient(2000, [60, 30, 10], [250, 200, 140])
    const full = averages(withSettings(bluish, matchColors(bluish, warm, 1)))
    const half = averages(withSettings(bluish, matchColors(bluish, warm, 0.5)))
    const before = averages(bluish)
    expect(half[0]).toBeGreaterThan(before[0] + 10)
    expect(half[0]).toBeLessThan(full[0] - 10)
    const none = matchColors(bluish, warm, 0)
    expect(none.saturation).toBe(0)
    for (const points of Object.values(none.curve!)) expect(points.every(([x, y]) => x === y)).toBe(true)
  })

  it('a picture matched to itself hardly changes', () => {
    const photo = gradient(3000, [20, 40, 60], [230, 210, 190])
    const settings = matchColors(photo, photo)
    expect(settings.saturation).toBe(0)
    const after = withSettings(photo, settings)
    let worst = 0
    for (let i = 0; i < photo.length; i++) worst = Math.max(worst, Math.abs(after[i] - photo[i]))
    expect(worst).toBeLessThanOrEqual(4)
  })

  it('see-through pixels are not measured', () => {
    const photo = gradient(1000, [40, 40, 40], [200, 200, 200])
    const other = new Uint8ClampedArray([...gradient(1000, [40, 40, 40], [200, 200, 200]), ...gradient(1000, [255, 0, 0], [255, 0, 0], 0)])
    const after = averages(withSettings(photo, matchColors(photo, other)))
    expect(Math.abs(after[0] - after[2])).toBeLessThan(4)
    // Nothing solid to match to: nothing changes.
    expect(matchColors(photo, gradient(100, [0, 0, 0], [255, 255, 255], 0))).toEqual({})
  })

  it('never makes a curve go flat or wildly steep, and keeps it going up', () => {
    // A dull photo of a narrow range of tones, matched to a photo of every tone.
    const dull = counts(Array.from({ length: 1000 }, (_, i) => 120 + (i % 20)))
    const full = counts(Array.from({ length: 1000 }, (_, i) => Math.round((i / 999) * 255)))
    const points = matchCurve(dull, full, 1000, 1000)
    const table = curveTable(points)
    for (let i = 1; i < 256; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1] - 1e-6)
    for (let i = 1; i < points.length; i++) {
      const slope = (points[i][1] - points[i - 1][1]) / (points[i][0] - points[i - 1][0])
      expect(slope).toBeLessThanOrEqual(4.2)
    }
  })

  it('a dull photo matched to a colorful one gets more color strength', () => {
    const dull = gradient(2000, [100, 95, 90], [160, 150, 145])
    const colorful = new Uint8ClampedArray([...gradient(1000, [200, 20, 20], [250, 80, 60]), ...gradient(1000, [20, 60, 200], [90, 120, 250])])
    expect(matchColors(dull, colorful).saturation).toBeGreaterThan(0)
  })
})
