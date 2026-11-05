import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })
const panel = (page: Page) => page.getByRole('region', { name: 'Make copies' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

async function typeText(page: Page, size: Size, x: number, y: number, words: string) {
  await page.keyboard.press('t')
  await clickAt(page, size, x, y)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.type(words)
  await page.keyboard.press('Escape')
  await expect(typingBox(page)).toHaveCount(0)
}

test('make copies in a row: shown first, then kept together as one step', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size, [20, 20], [60, 60])
  await page.getByRole('toolbar').getByRole('button', { name: 'Make copies' }).click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toContainText('4 in all')
  // The copies show on the design right away: the first one sits a gap to the right.
  await expect.poll(async () => (await designPixel(page, size, 75, 40))[2]).toBeGreaterThan(200)
  expectColor(await designPixel(page, size, 75, 40), BLUE)
  // Esc leaves the design as it was.
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  expectColor(await designPixel(page, size, 75, 40), WHITE)
  expect(await layerNames(page)).toEqual(['Rectangle 1'])

  // A grid of 2 by 2, applied with the button.
  await page.getByRole('toolbar').getByRole('button', { name: 'Make copies' }).click()
  await panel(page).getByRole('radio', { name: 'Grid' }).click()
  const across = panel(page).getByRole('slider', { name: 'How many across' })
  await across.focus()
  // From 3 down to 2 across, and the same down.
  await page.keyboard.press('ArrowLeft')
  await expect(panel(page)).toContainText('6 in all')
  await panel(page).getByRole('slider', { name: 'How many down' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(panel(page)).toContainText('4 in all')
  await panel(page).getByRole('button', { name: 'Apply' }).click()
  await expect(panel(page)).toHaveCount(0)
  // The gap starts at a fifth of the size: 8 pixels.
  expectColor(await designPixel(page, size, 88, 40), BLUE)
  expectColor(await designPixel(page, size, 40, 88), BLUE)
  expectColor(await designPixel(page, size, 88, 88), BLUE)
  expectColor(await designPixel(page, size, 64, 40), WHITE)
  expectColor(await designPixel(page, size, 136, 40), WHITE)
  // Kept together with the original, all picked, and one undo step.
  await expect(page.getByRole('toolbar')).toContainText('Copies of Rectangle 1')
  expect(await undoLabel(page)).toContain('Undo make copies')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 88, 40), WHITE)
  expect(await layerNames(page)).toEqual(['Rectangle 1'])
})

test('copies around a circle turn to face the middle', async ({ page }) => {
  const size = await newDesign(page, 400, 400)
  await drawRectangle(page, size, [190, 40], [210, 80])
  await page.getByRole('toolbar').getByRole('button', { name: 'Make copies' }).click()
  await panel(page).getByRole('radio', { name: 'Circle' }).click()
  await expect(panel(page)).toContainText('8 in all')
  await page.keyboard.press('Enter')
  await expect(panel(page)).toHaveCount(0)
  // The circle's middle is below the original, as far down as the radius: the copy opposite the
  // original sits under the middle, and the one a quarter round is to the right, lying on its side.
  const radius = Math.round(Math.max(40, (8 * 40 * 1.25) / (2 * Math.PI)))
  const middle = { x: 200, y: 60 + radius }
  expectColor(await designPixel(page, size, middle.x, middle.y + radius), BLUE)
  expectColor(await designPixel(page, size, middle.x + radius, middle.y), BLUE)
  expectColor(await designPixel(page, size, middle.x + radius + 15, middle.y), BLUE)
  expectColor(await designPixel(page, size, middle.x + radius, middle.y + 15), WHITE)
})

test('find and change words in every text, on every page', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await typeText(page, size, 40, 60, 'Tea at five')
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Add page' }).click()
  await typeText(page, size, 40, 60, 'More tea')
  expect(await layerNames(page)).toEqual(['More tea'])

  await page.keyboard.press('Control+f')
  const dialog = page.getByRole('dialog', { name: 'Find and change words' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Find' }).fill('tea')
  await expect(dialog).toContainText('Found 2 times, on pages 1, 2.')
  await dialog.getByRole('checkbox', { name: /Same capital letters/ }).check()
  await expect(dialog).toContainText('Found once, on page 2.')
  await dialog.getByRole('checkbox', { name: /Same capital letters/ }).uncheck()
  await dialog.getByRole('textbox', { name: 'Change to' }).fill('Coffee')
  await dialog.getByRole('button', { name: 'Change all 2' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Changed in 2 places.' })).toBeVisible()
  expect(await layerNames(page)).toEqual(['More Coffee'])
  await page.keyboard.press('PageUp')
  await expect.poll(() => layerNames(page)).toEqual(['Coffee at five'])
  expect(await undoLabel(page)).toContain('Undo change words')
  // Undo brings back the old words everywhere, and the page where they were changed.
  await page.keyboard.press('Control+z')
  await expect.poll(() => layerNames(page)).toEqual(['More tea'])
  await page.keyboard.press('PageUp')
  await expect.poll(() => layerNames(page)).toEqual(['Tea at five'])
})
