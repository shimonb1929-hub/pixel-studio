import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Quick choices for what is picked' })
const layerButtons = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / })

async function rectangle(page: Page, size: Size) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [120, 80],
    [260, 160],
  ])
  await page.keyboard.press('v')
}

test('a bar next to the picked thing has the everyday choices, and More has the rest', async ({ page }) => {
  const size = await newDesign(page)
  await expect(bar(page)).toHaveCount(0)
  await rectangle(page, size)
  await expect(bar(page)).toBeVisible()
  // It sits just under the thing.
  const thing = (await page.locator('main canvas').first().boundingBox())!
  const box = (await bar(page).boundingBox())!
  expect(box.y).toBeGreaterThan(thing.y + (thing.height - size.height) / 2 + 160)

  await bar(page).getByRole('button', { name: 'Make a copy' }).click()
  await expect(layerButtons(page)).toHaveCount(2)
  await bar(page).getByRole('button', { name: 'Delete' }).click()
  await expect(layerButtons(page)).toHaveCount(1)

  await bar(page).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  // While the menu is open, the bar steps aside.
  await expect(bar(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(bar(page)).toBeVisible()

  // While dragging the thing, the bar is out of the way; it comes back where the thing lands.
  await page.keyboard.down('Control')
  await drag(page, size, [
    [190, 120],
    [190, 60],
  ])
  await page.keyboard.up('Control')
  expectColor(await designPixel(page, size, 190, 30), BLUE)
  expectColor(await designPixel(page, size, 190, 115), WHITE)
  await expect(bar(page)).toBeVisible()

  // Clicking empty paper lets go, and the bar goes too.
  await clickAt(page, size, 20, 280)
  await expect(bar(page)).toHaveCount(0)
})
