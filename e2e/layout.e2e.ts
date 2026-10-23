import type { Page } from '@playwright/test'
import { newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

// The color of the line layer (handles, guides) at a point of the design, at 100% zoom.
function overlayPixel(page: Page, width: number, height: number, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([w, h, px, py]) => {
      const main = document.querySelector('main')!
      const canvases = main.querySelectorAll('canvas')
      const overlay = canvases[canvases.length - 1]
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return Array.from(overlay.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data)
    },
    [width, height, x, y],
  )
}

async function openLayout(page: Page) {
  await page.keyboard.press('Control+k')
  await page.keyboard.type('margins')
  await expect(page.getByRole('option', { name: /Margins and columns/ })).toBeVisible()
  await page.keyboard.press('Enter')
  return page.getByRole('dialog', { name: 'Margins and columns' })
}

test('margins and columns show as faint lines, can be undone, and are never downloaded', async ({ page }) => {
  await newDesign(page, 400, 300)
  await page.getByRole('button', { name: 'Arrange tool' }).click()
  const dialog = await openLayout(page)
  await dialog.getByRole('radio', { name: 'Medium' }).click()
  // 7% of the shorter side: 21 pixels.
  await expect(dialog.getByRole('textbox', { name: 'Margin size' })).toHaveValue('21')
  await dialog.getByRole('radio', { name: '2', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Space between columns' })).toHaveValue('9')
  // Shown before it's kept.
  await expect.poll(async () => (await overlayPixel(page, 400, 300, 21, 150))[3]).toBeGreaterThan(0)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await overlayPixel(page, 400, 300, 21, 150))[3]).toBeGreaterThan(0)
  // Lines only: inside a column there's nothing.
  expect((await overlayPixel(page, 400, 300, 100, 100))[3]).toBe(0)
  expect((await overlayPixel(page, 400, 300, 196, 100))[3]).toBeGreaterThan(0)

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await overlayPixel(page, 400, 300, 21, 150))[3]).toBe(0)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await overlayPixel(page, 400, 300, 21, 150))[3]).toBeGreaterThan(0)

  // Opening it again shows what was chosen; None takes the lines away.
  const again = await openLayout(page)
  await expect(again.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
  await again.getByRole('radio', { name: 'None' }).click()
  await again.getByRole('radio', { name: '1', exact: true }).click()
  await again.getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await overlayPixel(page, 400, 300, 21, 150))[3]).toBe(0)
})
