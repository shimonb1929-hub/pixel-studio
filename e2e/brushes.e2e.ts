import { drag, newDesign, paintedIn, pickBrush } from './helpers.ts'
import { expect, test } from './setup.ts'

// One straight stroke across the design, at y = 100.
const STROKE: [number, number][] = [
  [40, 100],
  [360, 100],
]

test('Drips run down from the line, and only down', async ({ page }) => {
  const size = await newDesign(page)
  await pickBrush(page, 'Drips')
  await drag(page, size, STROKE)
  // Size 24: the line covers y 88 to 112. Drips run below it, nothing goes above it.
  expect(await paintedIn(page, size, { x: 40, y: 120, width: 320, height: 60 })).toBeGreaterThan(10)
  expect(await paintedIn(page, size, { x: 40, y: 40, width: 320, height: 40 })).toBe(0)
})

test('Splatter throws drops around the line, with gaps between them', async ({ page }) => {
  const size = await newDesign(page)
  await pickBrush(page, 'Splatter')
  await drag(page, size, STROKE)
  // Drops land within the brush's reach, above and below the line, but never cover it solid.
  const near = await paintedIn(page, size, { x: 60, y: 70, width: 280, height: 60 })
  const all = (280 / 2) * (60 / 2)
  expect(near).toBeGreaterThan(all * 0.05)
  expect(near).toBeLessThan(all * 0.8)
  expect(await paintedIn(page, size, { x: 60, y: 200, width: 280, height: 60 })).toBe(0)
})

test('Oil paint makes a full streaky line in shades of the color', async ({ page }) => {
  const size = await newDesign(page)
  await pickBrush(page, 'Oil paint')
  await drag(page, size, STROKE)
  const shades = await page.evaluate(([w, h]) => {
    const main = document.querySelector('main')!
    const canvas = main.querySelector('canvas')!
    const dpr = devicePixelRatio
    const left = Math.round(((main.clientWidth - w) / 2) * dpr)
    const top = Math.round(((main.clientHeight - h) / 2) * dpr)
    const ctx = canvas.getContext('2d')!
    const seen = new Set<number>()
    let painted = 0
    let total = 0
    for (let y = 92; y <= 108; y += 2) {
      for (let x = 100; x < 300; x += 4) {
        const [r, g, b] = ctx.getImageData(left + Math.floor(x * dpr), top + Math.floor(y * dpr), 1, 1).data
        total++
        if (r + g + b < 600) painted++
        seen.add(Math.round((r + g + b) / 12))
      }
    }
    return { painted, total, shades: seen.size }
  }, [size.width, size.height])
  expect(shades.painted / shades.total).toBeGreaterThan(0.85)
  expect(shades.shades).toBeGreaterThan(4)
})
