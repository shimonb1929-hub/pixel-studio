import type { Page } from '@playwright/test'
import { drag, inkIn, newDesign, pickBrush } from './helpers.ts'
import { expect, test } from './setup.ts'

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

test('push and pull moves the pixels of a drawing along with the brush', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await page.keyboard.press('b')
  await pickBrush(page, 'Marker')
  // A dark line straight down the middle.
  await drag(page, size, [
    [200, 60],
    [200, 240],
  ])
  expect(await inkIn(page, size, 230, 120, 40, 60)).toBe(0)

  await page.keyboard.press('w')
  await expect(page.getByRole('radiogroup', { name: 'What the brush does' })).toBeVisible()
  // Push the middle of the line to the right.
  await drag(page, size, [
    [185, 150],
    [215, 150],
    [245, 150],
  ])
  expect(await inkIn(page, size, 230, 130, 40, 40)).toBeGreaterThan(20)
  // The ends of the line stay where they were.
  expect(await inkIn(page, size, 190, 62, 20, 10)).toBeGreaterThan(10)
  expect(await undoLabel(page)).toContain('Undo push and pull')
  await page.keyboard.press('Control+z')
  expect(await inkIn(page, size, 230, 130, 40, 40)).toBe(0)
})
