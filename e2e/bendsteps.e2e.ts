import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

test('bend a shape into an arch, and make it straight again', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size, [100, 100], [300, 200])
  await page.keyboard.press('v')
  const bend = page.getByRole('region', { name: 'Shape' }).getByRole('radiogroup', { name: 'Bend shape' })
  await bend.getByRole('radio', { name: 'Arch' }).click()
  // Up in the middle, so the top corners drop away; it stays inside its box.
  expectColor(await designPixel(page, size, 200, 104), BLUE)
  expectColor(await designPixel(page, size, 104, 104), WHITE)
  expectColor(await designPixel(page, size, 200, 196), WHITE)
  expectColor(await designPixel(page, size, 104, 196), BLUE)
  expect(await undoLabel(page)).toContain('Undo bend shape')
  await expect(page.getByRole('slider', { name: 'How much bend' })).toBeVisible()

  await bend.getByRole('radio', { name: 'No bend' }).click()
  expectColor(await designPixel(page, size, 104, 104), BLUE)
  await expect(page.getByRole('slider', { name: 'How much bend' })).toHaveCount(0)
})

test('steps between two shapes: shown first, then kept together with them', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size, [20, 20], [60, 60])
  await drawRectangle(page, size, [300, 200], [380, 280])
  await page.keyboard.press('v')
  await clickAt(page, size, 40, 40)
  await clickAt(page, size, 340, 240, ['Shift'])
  await page.getByRole('toolbar').getByRole('button', { name: 'Steps between' }).click()
  const panel = page.getByRole('region', { name: 'Steps between' })
  await expect(panel).toContainText('6 in between')
  // The third step sits three sevenths of the way along.
  await expect.poll(async () => (await designPixel(page, size, 169, 126))[2]).toBeGreaterThan(200)
  expectColor(await designPixel(page, size, 169, 126), BLUE)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  expectColor(await designPixel(page, size, 169, 126), WHITE)

  await page.getByRole('toolbar').getByRole('button', { name: 'Steps between' }).click()
  await panel.getByRole('button', { name: 'Apply' }).click()
  await expect(panel).toHaveCount(0)
  expectColor(await designPixel(page, size, 169, 126), BLUE)
  await expect(page.getByRole('toolbar')).toContainText('Steps between Rectangle 1 and Rectangle 2')
  expect(await undoLabel(page)).toContain('Undo steps between')
})
