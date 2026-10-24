import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]

const pagesBar = (page: Page) => page.getByRole('navigation', { name: 'Pages' })
const pageButtons = (page: Page) => pagesBar(page).getByRole('button', { name: /^Page \d+$/ })

async function redLine(page: Page, size: Size, y: number) {
  await page.getByRole('button', { name: 'Brush tool' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drag(page, size, [
    [50, y],
    [350, y],
  ])
}

// Waits for the design to be drawn with this color at a point.
async function expectPixel(page: Page, size: Size, x: number, y: number, color: [number, number, number]) {
  await expect.poll(async () => (await designPixel(page, size, x, y)).slice(0, 3).every((v, i) => Math.abs(v - color[i]) <= 8)).toBe(true)
}

async function pageMenu(page: Page, item: string) {
  await pagesBar(page).getByRole('button', { name: 'Page options' }).click()
  await pagesBar(page).getByRole('menuitem', { name: item }).click()
}

test('a design can have several pages, each with its own things', async ({ page }) => {
  const size = await newDesign(page)
  await redLine(page, size, 100)
  // One page: only a button to add more.
  await expect(pageButtons(page)).toHaveCount(0)
  await pagesBar(page).getByRole('button', { name: 'Add page' }).click()
  await expect(pageButtons(page)).toHaveCount(2)
  await expect(pageButtons(page).nth(1)).toHaveAttribute('aria-current', 'page')
  // The new page is empty and shows the first steps.
  await expect(page.getByRole('group', { name: 'Start here' })).toBeVisible()
  expectColor(await designPixel(page, size, 200, 100), WHITE)

  await redLine(page, size, 200)
  await pageButtons(page).nth(0).click()
  expectColor(await designPixel(page, size, 200, 100), RED)
  expectColor(await designPixel(page, size, 200, 200), WHITE)
  await page.keyboard.press('PageDown')
  await expect(pageButtons(page).nth(1)).toHaveAttribute('aria-current', 'page')
  expectColor(await designPixel(page, size, 200, 200), RED)

  // Undo takes back the line on page 2, then goes to page 1 to take back its line.
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 200), WHITE)
  await page.keyboard.press('Control+z')
  await expect(pageButtons(page)).toHaveCount(0)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 100), WHITE)
  await page.keyboard.press('Control+Shift+z')
  await page.keyboard.press('Control+Shift+z')
  await page.keyboard.press('Control+Shift+z')
  await expect(pageButtons(page)).toHaveCount(2)
  expectColor(await designPixel(page, size, 200, 200), RED)

  // Copy, move and delete from the page menu.
  await pageMenu(page, 'Copy this page')
  await expect(pageButtons(page)).toHaveCount(3)
  await expect(pageButtons(page).nth(2)).toHaveAttribute('aria-current', 'page')
  expectColor(await designPixel(page, size, 200, 200), RED)
  await pageMenu(page, 'Move page earlier')
  await expect(pageButtons(page).nth(1)).toHaveAttribute('aria-current', 'page')
  await pageMenu(page, 'Delete this page')
  await expect(pageButtons(page)).toHaveCount(2)

  // The PDF has every page.
  await page.keyboard.press('Control+s')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await expect(dialog).toContainText('A picture holds one page, so this saves page 2 of 2.')
  await dialog.getByRole('radio', { name: /PDF/ }).click()
  await expect(dialog).toContainText('All 2 pages go into one PDF.')
  const [pdf] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  const file = readFileSync((await pdf.path())!).toString('latin1')
  expect(file).toContain('/Count 2')
  expect(file.match(/\/Subtype \/Image/g)).toHaveLength(2)
})

test('pages come back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await redLine(page, size, 100)
  await pagesBar(page).getByRole('button', { name: 'Add page' }).click()
  await redLine(page, size, 200)
  await pageButtons(page).nth(0).click()
  await expectPixel(page, size, 200, 100, RED)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  // The design takes a moment to close; opening the file before then would race it.
  await expect(page.getByRole('main').locator('canvas:not([data-preview])')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })

  await expect(pageButtons(page)).toHaveCount(2)
  await expect(pageButtons(page).nth(0)).toHaveAttribute('aria-current', 'page')
  // The design is drawn a moment after it opens.
  await expectPixel(page, size, 200, 100, RED)
  await expectPixel(page, size, 200, 200, WHITE)
  await pageButtons(page).nth(1).click()
  await expectPixel(page, size, 200, 100, WHITE)
  await expectPixel(page, size, 200, 200, RED)
})
