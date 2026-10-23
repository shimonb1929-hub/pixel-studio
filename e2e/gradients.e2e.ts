import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, expectDesignSize, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const pagePanel = (page: Page) => page.getByRole('region', { name: 'Page' })
const shapePanel = (page: Page) => page.getByRole('region', { name: 'Shape' })

// How far apart two colors are.
const distance = (a: number[], b: number[]) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))

// Drags a gradient dot to a point of the design.
async function dragDot(page: Page, size: Size, name: string, to: [number, number]) {
  const dot = page.getByRole('slider', { name })
  const box = (await dot.boundingBox())!
  const target = await screenPoint(page, size, to[0], to[1])
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move((box.x + target.x) / 2, (box.y + target.y) / 2, { steps: 4 })
  await page.mouse.move(target.x, target.y, { steps: 4 })
  await page.mouse.up()
}

test('the page can be a gradient, turned with the dots on it, and it comes back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Page', exact: true }).click()
  await pagePanel(page).getByRole('radio', { name: 'Gradient' }).click()

  // A new gradient runs top to bottom, so the top and bottom differ and left and right match.
  const top = await designPixel(page, size, 200, 10)
  const bottom = await designPixel(page, size, 200, 290)
  expect(distance(top, bottom)).toBeGreaterThan(40)
  expect(distance(await designPixel(page, size, 10, 150), await designPixel(page, size, 390, 150))).toBeLessThan(4)
  await expect(page.getByRole('slider', { name: 'Gradient end' })).toHaveAttribute('aria-valuenow', '90')

  // Dragging the end dot to the right edge turns it to run left to right.
  await dragDot(page, size, 'Gradient end', [380, 150])
  await expect(page.getByRole('slider', { name: 'Gradient end' })).toHaveAttribute('aria-valuenow', '0')
  expect(distance(await designPixel(page, size, 10, 150), await designPixel(page, size, 390, 150))).toBeGreaterThan(40)
  expect(distance(await designPixel(page, size, 200, 10), await designPixel(page, size, 200, 290))).toBeLessThan(4)
  const left = await designPixel(page, size, 10, 150)

  // One undo puts the whole drag back.
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('slider', { name: 'Gradient end' })).toHaveAttribute('aria-valuenow', '90')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByRole('slider', { name: 'Gradient end' })).toHaveAttribute('aria-valuenow', '0')

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
  await expect(page.getByRole('main').locator('canvas')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'Faded.pixel', mimeType: '', buffer: bytes })
  await expectDesignSize(page, size.width, size.height)
  await expect.poll(async () => distance(await designPixel(page, size, 10, 150), left)).toBeLessThan(4)

  // Back to one plain color.
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Page', exact: true }).click()
  await pagePanel(page).getByRole('radio', { name: 'Color' }).click()
  await expect(page.getByRole('slider', { name: 'Gradient end' })).toBeHidden()
  expect(distance(await designPixel(page, size, 10, 150), await designPixel(page, size, 390, 150))).toBeLessThan(4)
})

test('a shape gradient turns with the dots on the shape', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [
    [100, 50],
    [300, 250],
  ])
  await page.keyboard.press('v')
  await shapePanel(page).getByRole('radio', { name: 'Gradient' }).click()
  const start = page.getByRole('slider', { name: 'Gradient start' })
  await expect(start).toHaveAttribute('aria-valuenow', '90')
  expect(distance(await designPixel(page, size, 200, 60), await designPixel(page, size, 200, 240))).toBeGreaterThan(30)

  // The start dot dragged to the right turns the gradient to run right to left.
  await dragDot(page, size, 'Gradient start', [290, 150])
  await expect(start).toHaveAttribute('aria-valuenow', '180')
  expect(distance(await designPixel(page, size, 110, 150), await designPixel(page, size, 290, 150))).toBeGreaterThan(30)
  expect(distance(await designPixel(page, size, 200, 60), await designPixel(page, size, 200, 240))).toBeLessThan(4)

  // Arrow keys turn it too, one degree at a time.
  await start.focus()
  await page.keyboard.press('ArrowRight')
  await expect(start).toHaveAttribute('aria-valuenow', '181')
})
