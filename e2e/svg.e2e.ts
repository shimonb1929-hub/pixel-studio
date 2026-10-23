import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const distance = (a: number[], b: number[]) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))

// Draws an SVG file in the page, the way another program would show it, and reads its pixels.
async function svgPixels(page: Page, svg: string, size: Size, points: [number, number][]): Promise<number[][]> {
  return page.evaluate(
    async ({ text, w, h, at }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
      const img = new Image()
      img.src = url
      await img.decode()
      // Fonts inside an SVG picture can take a moment more.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      return at.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data))
    },
    { text: svg, w: size.width, h: size.height, at: points },
  )
}

// One row of the design as it shows on screen.
function designRow(page: Page, size: Size, y: number): Promise<number[][]> {
  return page.evaluate(
    ([w, h, py]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const ctx = canvas.getContext('2d')!
      return Array.from({ length: w }, (_, x) => Array.from(ctx.getImageData(left + Math.floor(x * dpr), top + Math.floor(py * dpr), 1, 1).data))
    },
    [size.width, size.height, y],
  )
}

// Where the dark letters are along a row, in an SVG and on the design.
async function inkSpan(page: Page, svg: string | null, size: Size, y: number): Promise<[number, number]> {
  const xs = Array.from({ length: size.width }, (_, x) => x)
  const pixels = svg ? await svgPixels(page, svg, size, xs.map((x) => [x, y])) : await designRow(page, size, y)
  const dark = xs.filter((x) => Math.max(...pixels[x].slice(0, 3)) < 120)
  return [dark[0], dark[dark.length - 1]]
}

test('a design downloads as SVG with sharp shapes, gradients and Hebrew text that look the same', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [
    [20, 20],
    [180, 120],
  ])
  await page.keyboard.press('v')
  await page.getByRole('region', { name: 'Shape' }).getByRole('radio', { name: 'Gradient' }).click()

  await page.keyboard.press('t')
  const at = await screenPoint(page, size, 380, 220)
  await page.mouse.click(at.x, at.y)
  await page.keyboard.insertText('שלום 123 עולם')
  await page.keyboard.press('Escape')
  const textPanel = page.getByRole('region', { name: 'Text' })
  await textPanel.getByLabel('Text size in pixels').fill('40')
  await textPanel.getByLabel('Text size in pixels').press('Enter')

  await page.getByRole('button', { name: /What do you want to do/ }).click()
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('svg')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Download as SVG')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await expect(dialog.getByRole('radio', { name: /SVG/ })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog).toContainText('Saves as My design 1.svg')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  expect(download.suggestedFilename()).toBe('My design 1.svg')
  const svg = readFileSync((await download.path())!, 'utf8')

  // Shapes and words are real shapes and words, not a picture, and the fonts come along.
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400" height="300"/)
  expect(svg).toContain('<linearGradient')
  expect(svg).toContain('<path d="M')
  expect(svg).toContain('direction="rtl"')
  expect(svg).toContain('שלום')
  expect(svg).toContain('@font-face')
  expect(svg).not.toContain('<image')

  // Shown by the browser as a picture, it looks like the design.
  const points: [number, number][] = [
    [40, 30],
    [100, 70],
    [160, 110],
    [300, 50],
  ]
  const shown = await svgPixels(page, svg, size, points)
  for (const [i, [x, y]] of points.entries()) expect(distance(shown[i], await designPixel(page, size, x, y)), `at ${x}, ${y}`).toBeLessThan(10)

  // The text sits in the same place, right to left with its number in the middle.
  let best = 0
  let bestY = 0
  for (let y = 150; y < 300; y += 5) {
    const [a, b] = await inkSpan(page, null, size, y)
    if (a !== undefined && b - a > best) {
      best = b - a
      bestY = y
    }
  }
  expect(best).toBeGreaterThan(100)
  const [designLeft, designRight] = await inkSpan(page, null, size, bestY)
  const [svgLeft, svgRight] = await inkSpan(page, svg, size, bestY)
  expect(Math.abs(svgLeft - designLeft)).toBeLessThanOrEqual(3)
  expect(Math.abs(svgRight - designRight)).toBeLessThanOrEqual(3)
  // Letter by letter: the dark columns across the text line up, so the words are in the same order.
  const dark = (pixels: number[][]) => pixels.map((p) => Math.max(...p.slice(0, 3)) < 120)
  const xs = Array.from({ length: size.width }, (_, x) => x)
  const designInk = dark(await designRow(page, size, bestY))
  const svgInk = dark(await svgPixels(page, svg, size, xs.map((x) => [x, bestY])))
  const near = (ink: boolean[], x: number) => ink.slice(Math.max(0, x - 1), x + 2).some(Boolean)
  const misses = xs.filter((x) => designInk[x] !== svgInk[x] && !(designInk[x] ? near(svgInk, x) : near(designInk, x)))
  expect(misses.length, `columns that differ: ${misses.join(', ')}`).toBeLessThan(6)
})
