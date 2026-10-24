import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, expectDesignSize, newDesign, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]

const pagesBar = (page: Page) => page.getByRole('navigation', { name: 'Pages' })
const pageButtons = (page: Page) => pagesBar(page).getByRole('button', { name: /^Page \d+$/ })

async function expectPixel(page: Page, size: Size, x: number, y: number, color: [number, number, number]) {
  await expect.poll(async () => (await designPixel(page, size, x, y)).slice(0, 3).every((v, i) => Math.abs(v - color[i]) <= 8)).toBe(true)
}

test('one click makes the design again at other sizes, each a page of its own size', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])

  await pagesBar(page).getByRole('button', { name: 'Make other sizes' }).click()
  const dialog = page.getByRole('dialog', { name: 'Make other sizes' })
  // Each size shows a preview of the design at that size; nothing is made until asked.
  await expect(dialog.locator('canvas').first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Make this size' })).toHaveAttribute('aria-disabled', 'true')
  await dialog.getByRole('button', { name: /^Phone story/ }).click()
  await dialog.getByRole('button', { name: /^Website banner/ }).click()
  // A size of your own.
  await dialog.getByLabel('Width of your own size').fill('500')
  await dialog.getByLabel('Height of your own size').fill('500')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /^Your own size/ })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Make 3 sizes' }).click()

  await expect(pageButtons(page)).toHaveCount(4)
  await expect(pageButtons(page).nth(1)).toHaveAttribute('aria-current', 'page')
  await expectDesignSize(page, 1080, 1920)
  await pageButtons(page).nth(2).click()
  await expectDesignSize(page, 1200, 630)
  await pageButtons(page).nth(3).click()
  await expectDesignSize(page, 500, 500)

  // The first page is as it was, and the view fits it again.
  await pageButtons(page).nth(0).click()
  await expectDesignSize(page, 400, 300)
  await expect(page.getByRole('button', { name: 'Zoom level' })).toHaveText('100%')
  await expectPixel(page, size, 200, 150, RED)

  // Undo takes the new pages away in one step.
  await page.keyboard.press('Control+z')
  await expect(pageButtons(page)).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect(pageButtons(page)).toHaveCount(4)

  // Each page keeps its size in a project file.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await expect(page.getByRole('main').locator('canvas:not([data-preview])')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'Sizes.pixel', mimeType: '', buffer: bytes })
  await expect(pageButtons(page)).toHaveCount(4)
  await pageButtons(page).nth(2).click()
  await expectDesignSize(page, 1200, 630)

  // A PDF gives each page paper of its own shape.
  await page.keyboard.press('Control+s')
  const save = page.getByRole('dialog', { name: 'Download your design' })
  await save.getByRole('radio', { name: /PDF/ }).click()
  const [pdf] = await Promise.all([page.waitForEvent('download'), save.getByRole('button', { name: 'Download' }).click()])
  const file = readFileSync((await pdf.path())!).toString('latin1')
  expect(file).toContain('/Count 4')
  const boxes = [...file.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => Number(m[1]) / Number(m[2]))
  expect(boxes.map((r) => r.toFixed(2)).sort()).toEqual([400 / 300, 1080 / 1920, 1200 / 630, 1].map((r) => r.toFixed(2)).sort())
})
