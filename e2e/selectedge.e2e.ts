import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'
import type { Page } from '@playwright/test'

const GREEN: [number, number, number] = [34, 197, 94]


// How strongly the screen dims a point of the design (the overlay's see-through amount, 0–255).
function dimmedAt(page: Page, size: Size, x: number, y: number): Promise<number> {
  return page.evaluate(
    async ([w, h, px, py]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const overlay = main.querySelector('canvas[aria-label]') as HTMLCanvasElement
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return overlay.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data[3]
    },
    [size.width, size.height, x, y],
  )
}

async function selectRect(page: Page, size: Size, x0: number, y0: number, x1: number, y1: number) {
  await page.keyboard.press('m')
  await drag(page, size, [
    [x0, y0],
    [x1, y1],
  ])
}

test('Same color selects one color, touching or everywhere', async ({ page }) => {
  const size = await newDesign(page)
  // Two green blocks, apart from each other.
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await selectRect(page, size, 50, 50, 150, 150)
  await page.keyboard.press('Alt+Backspace')
  await selectRect(page, size, 250, 50, 350, 150)
  await page.keyboard.press('Alt+Backspace')
  await page.keyboard.press('Control+d')
  expectColor(await designPixel(page, size, 300, 100), GREEN)

  await page.keyboard.press('m')
  await page.getByRole('radio', { name: 'Same color' }).click()
  await expect(page.getByRole('button', { name: 'Only touching' })).toHaveAttribute('aria-pressed', 'true')
  await clickAt(page, size, 100, 100)
  await page.keyboard.press('Delete')
  expectColor(await designPixel(page, size, 100, 100), WHITE)
  expectColor(await designPixel(page, size, 300, 100), GREEN)
  await page.keyboard.press('Control+z')

  await page.getByRole('button', { name: 'Only touching' }).click()
  await clickAt(page, size, 100, 100)
  await page.keyboard.press('Delete')
  expectColor(await designPixel(page, size, 100, 100), WHITE)
  expectColor(await designPixel(page, size, 300, 100), WHITE)
  // The white page around them isn't part of it.
  await expect.poll(() => page.getByRole('button', { name: 'Undo', exact: true }).isEnabled()).toBe(true)
})

test('the edge of a selection can grow and be softened, seen before it is kept', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await selectRect(page, size, 100, 100, 200, 200)

  await page.getByRole('button', { name: 'Soften, grow or shrink the edge' }).click()
  const grow = page.getByLabel('Grow or shrink (Expand, Contract)')
  await grow.focus()
  // Each step right grows it by a pixel.
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('toolbar')).toContainText('+10 px')
  // The part left out is dimmed while trying it.
  expect(await dimmedAt(page, size, 50, 50)).toBeGreaterThan(80)
  // Inside shows only the light blue of a selection, not the dimming.
  expect(await dimmedAt(page, size, 150, 150)).toBeLessThan(60)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 95, 150), GREEN)
  expectColor(await designPixel(page, size, 85, 150), WHITE)
  expectColor(await designPixel(page, size, 50, 50), WHITE)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')

  // Softened, the fill fades out across the edge instead of stopping hard.
  await page.getByRole('button', { name: 'Soften, grow or shrink the edge' }).click()
  await page.getByLabel('Soften edge (Feather)').focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('toolbar')).toContainText('12 px')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 150, 150), GREEN)
  const edge = await designPixel(page, size, 100, 150)
  expect(edge[0]).toBeGreaterThan(GREEN[0] + 30)
  expect(edge[0]).toBeLessThan(240)
})
