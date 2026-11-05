import type { Page } from '@playwright/test'
import { designPixel, drag, newDesign, pickBrush, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

const sum = (p: number[]) => p[0] + p[1] + p[2]

async function drawRectangle(page: Page, size: Size) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [
    [60, 60],
    [340, 240],
  ])
}

test('Lighten and Darken brush light and shade onto one layer of their own', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size)
  const before = await designPixel(page, size, 120, 100)

  await page.keyboard.press('b')
  await pickBrush(page, 'Lighten')
  await drag(page, size, [
    [90, 100],
    [160, 100],
  ])
  const lighter = await designPixel(page, size, 120, 100)
  expect(sum(lighter)).toBeGreaterThan(sum(before) + 15)
  expect(await undoLabel(page)).toContain('Undo lighten')
  // Away from the stroke, nothing changed.
  expect(sum(await designPixel(page, size, 300, 200))).toBe(sum(before))

  await pickBrush(page, 'Darken')
  await drag(page, size, [
    [240, 200],
    [310, 200],
  ])
  expect(sum(await designPixel(page, size, 270, 200))).toBeLessThan(sum(before) - 15)
  expect(await undoLabel(page)).toContain('Undo darken')

  // Both strokes went on the same Light and shade layer, above the shape.
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('Light and shade', { exact: true })).toHaveCount(1)
})
