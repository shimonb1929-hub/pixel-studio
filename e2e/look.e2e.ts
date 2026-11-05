import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]
const BLUE: [number, number, number] = [59, 91, 253]

async function rectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await page.keyboard.down('Alt')
  await drag(page, size, [from, to])
  await page.keyboard.up('Alt')
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

test('Copy the look and Paste the look give one thing the look of another', async ({ page }) => {
  const size = await newDesign(page)
  await rectangle(page, size, [20, 20], [80, 80])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await rectangle(page, size, [200, 100], [260, 160])
  expectColor(await designPixel(page, size, 230, 130), BLUE)

  // Paste the look waits until a look was copied.
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('paste style')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Paste the look')
  await page.keyboard.press('Escape')

  await clickAt(page, size, 50, 50)
  await page.keyboard.press('ControlOrMeta+Alt+c')
  await expect(page.getByRole('status').filter({ hasText: 'Look copied' })).toBeVisible()
  await clickAt(page, size, 230, 130)
  await page.keyboard.press('ControlOrMeta+Alt+v')
  expectColor(await designPixel(page, size, 230, 130), RED)
  expect(await undoLabel(page)).toContain('Undo paste the look')
  await page.keyboard.press('ControlOrMeta+z')
  expectColor(await designPixel(page, size, 230, 130), BLUE)
})

test('Print draws every page sharp and hands it to the print window', async ({ page }) => {
  const size = await newDesign(page)
  await rectangle(page, size, [20, 20], [80, 80])
  await page.evaluate(() => {
    const w = window as unknown as { printed: number[][] | null; print: () => void }
    w.printed = null
    w.print = () => {
      const root = document.getElementById('pixel-studio-print')
      w.printed = [...(root?.querySelectorAll('img') ?? [])].map((img) => [img.naturalWidth, img.naturalHeight])
    }
  })
  await page.keyboard.press('ControlOrMeta+p')
  // A 400 × 300 design is drawn four times as big, so it prints sharp.
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number[][] | null }).printed)).toEqual([[1600, 1200]])
  expect(size.width).toBe(400)
})
