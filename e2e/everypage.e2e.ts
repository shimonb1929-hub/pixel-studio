import type { Page } from '@playwright/test'
import { clickAt, newDesign, screenPoint } from './helpers.ts'
import { expect, test } from './setup.ts'

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const pages = (page: Page) => page.getByRole('navigation', { name: 'Pages' })

async function pageMenu(page: Page, item: string) {
  await pages(page).getByRole('button', { name: 'Page options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('a thing and page numbers on every page', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await page.keyboard.press('t')
  await clickAt(page, size, 50, 50)
  await page.keyboard.type('Logo')
  await page.keyboard.press('Escape')
  await pages(page).getByRole('button', { name: 'Add page' }).click()
  await pages(page).getByRole('button', { name: 'Add page' }).click()
  expect(await layerNames(page)).toEqual([])

  // Put the logo on every page, from page 1.
  await pages(page).getByRole('button', { name: 'Page 1' }).click()
  await page.getByRole('button', { name: 'Layer: Logo' }).click()
  await pageMenu(page, 'Show on every page')
  await pages(page).getByRole('button', { name: 'Page 3' }).click()
  expect(await layerNames(page)).toEqual(['Logo'])
  await expect(page.getByRole('button', { name: 'Keep Logo on this page only' })).toBeVisible()

  // Page numbers count themselves.
  await pageMenu(page, 'Add page numbers')
  expect(await layerNames(page)).toEqual(['Page number', 'Logo'])
  await pages(page).getByRole('button', { name: 'Page 2' }).click()
  expect(await layerNames(page)).toEqual(['Page number', 'Logo'])
  await page.getByRole('button', { name: 'Arrange tool' }).click()
  const number = await screenPoint(page, size, 200, 286)
  await page.mouse.dblclick(number.x, number.y)
  await expect(page.getByRole('textbox', { name: 'Type your text' })).toHaveText('2')
  await page.keyboard.press('Escape')

  // Keeping the logo on page 2 only takes it off the other pages.
  await page.getByRole('button', { name: 'Keep Logo on this page only' }).click()
  await pages(page).getByRole('button', { name: 'Page 1' }).click()
  expect(await layerNames(page)).toEqual(['Page number'])
  // Undo puts it back on every page.
  await page.keyboard.press('Control+z')
  await expect.poll(() => layerNames(page)).toEqual(['Page number', 'Logo'])
})
