import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

async function menu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

// The color of the overlay (where guides and the grid are drawn) at a point of the design.
function overlayPixel(page: Page, size: Size, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([w, h, px, py]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas[aria-label]') as HTMLCanvasElement
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return Array.from(canvas.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data)
    },
    [size.width, size.height, x, y],
  )
}

async function rectangle(page: Page, size: Size) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [20, 20],
    [60, 60],
  ])
}

test('the grid shows squared paper, and things click onto its lines', async ({ page }) => {
  const size = await newDesign(page)
  await rectangle(page, size)
  // Without the grid, a thing goes where it is dropped (left edge at 77).
  await drag(page, size, [
    [40, 40],
    [97, 140],
  ])
  expectColor(await designPixel(page, size, 78, 140), BLUE)
  await page.keyboard.press('ControlOrMeta+z')

  await menu(page, 'Show the grid')
  // A 400 × 300 design gets squares of 20 pixels: a faint line at x = 100, none at x = 110.
  expect((await overlayPixel(page, size, 100, 150))[3]).toBeGreaterThan(0)
  expect((await overlayPixel(page, size, 110, 150))[3]).toBe(0)
  await drag(page, size, [
    [40, 40],
    [97, 140],
  ])
  // The left edge clicked onto the line at 80.
  expectColor(await designPixel(page, size, 78, 140), WHITE)
  expectColor(await designPixel(page, size, 81, 140), BLUE)

  // It is still on next time, and Ctrl+' takes it away.
  await page.reload()
  await page.getByRole('region', { name: 'Your designs' }).getByRole('button', { name: 'Open My design 1' }).click()
  await expect.poll(async () => (await overlayPixel(page, size, 100, 150))[3]).toBeGreaterThan(0)
  await page.keyboard.press("ControlOrMeta+'")
  await expect.poll(async () => (await overlayPixel(page, size, 100, 150))[3]).toBe(0)
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Show the grid' })).toBeVisible()
})

test('rulers measure from the corner of the page, in the unit chosen for sizes', async ({ page }) => {
  await newDesign(page)
  await expect(page.locator('[data-rulers]')).toHaveCount(0)
  await menu(page, 'Show the rulers')
  const rulers = page.locator('[data-rulers]')
  await expect(rulers).toBeVisible()
  const top = rulers.locator('canvas').first()
  const box = (await top.boundingBox())!
  const main = (await page.locator('main').boundingBox())!
  // It runs the whole width of the view, and is drawn (not empty).
  expect(Math.round(box.width)).toBe(Math.round(main.width - 2))
  const drawn = await top.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] < 160 && data[i + 3] > 0) dark++
    return dark
  })
  expect(drawn).toBeGreaterThan(50)
  await menu(page, 'Hide the rulers')
  await expect(page.locator('[data-rulers]')).toHaveCount(0)
})
