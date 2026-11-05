import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
// The soft tint of that blue that starts behind a pattern.
const TINT: [number, number, number] = [216, 222, 255]

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

test('fill a shape with a pattern, change it, and see through behind it', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size, [100, 70], [300, 230])
  const shapePanel = page.getByRole('region', { name: 'Shape' })
  // New shapes start plain: a pattern is for a shape on the design.
  await page.keyboard.press('v')
  await shapePanel.getByRole('radio', { name: 'Pattern' }).click()
  await expect(shapePanel.getByRole('radiogroup', { name: 'Pattern' })).toBeVisible()
  // Dots, about eight across the short side (20 px apart), one right in the middle.
  expectColor(await designPixel(page, size, 200, 150), BLUE)
  expectColor(await designPixel(page, size, 210, 150), TINT, 12)
  expectColor(await designPixel(page, size, 220, 150), BLUE)
  expectColor(await designPixel(page, size, 60, 150), WHITE)
  expect(await undoLabel(page)).toContain('Undo pattern fill')

  // Checks: the middle square is filled, the one beside it is not.
  await shapePanel.getByRole('radio', { name: 'Checks' }).click()
  expectColor(await designPixel(page, size, 195, 145), BLUE)
  expectColor(await designPixel(page, size, 215, 145), TINT, 12)

  // The Color panel colors what is behind the little shapes once Behind is picked.
  await shapePanel.getByRole('button', { name: 'Behind color' }).click()
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  const behind = await designPixel(page, size, 215, 145)
  expect(behind[1]).toBeGreaterThan(behind[2] + 40)
  expectColor(await designPixel(page, size, 195, 145), BLUE)

  // See-through behind: the page shows between the squares.
  await shapePanel.getByRole('button', { name: 'See-through behind' }).click()
  expectColor(await designPixel(page, size, 215, 145), WHITE)
  expectColor(await designPixel(page, size, 195, 145), BLUE)

  // Back to one color: the little shapes' color fills it all.
  await shapePanel.getByRole('radio', { name: 'Color' }).click()
  expectColor(await designPixel(page, size, 215, 145), BLUE)
})
