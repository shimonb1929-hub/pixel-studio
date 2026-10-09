import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, INK, newDesign, screenPoint, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Adjust settings' })
const undoTip = async (page: Page) => {
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip')
}

// The preview can lag a moment behind a slider, so pixels are checked until they settle.
async function expectPixel(page: Page, size: Size, x: number, y: number, check: (rgba: number[]) => boolean, what: string) {
  await expect.poll(async () => check(await designPixel(page, size, x, y)), { message: what }).toBe(true)
}

const isGray = (rgba: number[]) => Math.abs(rgba[0] - rgba[1]) <= 3 && Math.abs(rgba[1] - rgba[2]) <= 3
const isColor = (color: [number, number, number], tolerance = 8) => (rgba: number[]) => color.every((c, i) => Math.abs(rgba[i] - c) <= tolerance)

// A design whose drawing layer is filled with blue.
async function blueDesign(page: Page): Promise<Size> {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 200, 150), BLUE)
  return size
}

test('a look shows first; Apply keeps it, Esc and undo take it back', async ({ page }) => {
  const size = await blueDesign(page)
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await expect(toolbar(page)).toContainText('Changes “Layer 1”')
  await expect(toolbar(page).getByRole('button', { name: 'Apply' })).toHaveAttribute('aria-disabled', 'true')

  const mono = page.getByRole('radio', { name: 'Black & white' })
  await mono.click()
  await expect(mono).toHaveAttribute('aria-checked', 'true')
  await expectPixel(page, size, 200, 150, isGray, 'black and white preview')
  // Nothing is kept yet: Esc puts it back.
  await expect(await undoTip(page)).toContainText('Undo adjustments')
  await page.keyboard.press('Escape')
  await expectPixel(page, size, 200, 150, isColor(BLUE), 'back to blue')
  await expect(page.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')

  await mono.click()
  await expectPixel(page, size, 200, 150, isGray, 'black and white again')
  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo black & white look')
  await expect(page.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')
  expect(isGray(await designPixel(page, size, 200, 150))).toBe(true)
  await page.keyboard.press('Control+z')
  await expectPixel(page, size, 200, 150, isColor(BLUE), 'undo brings blue back')
})

test('press and hold to compare with how it was', async ({ page }) => {
  const size = await blueDesign(page)
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await page.getByRole('radio', { name: 'Black & white' }).click()
  await expectPixel(page, size, 200, 150, isGray, 'preview')

  const point = await screenPoint(page, size, 100, 100)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await expectPixel(page, size, 200, 150, isColor(BLUE), 'holding on the design shows the original')
  await page.mouse.up()
  await expectPixel(page, size, 200, 150, isGray, 'letting go shows the preview again')

  await toolbar(page).getByRole('button', { name: 'Hold to compare' }).hover()
  await page.mouse.down()
  await expectPixel(page, size, 200, 150, isColor(BLUE), 'holding the button shows the original')
  await page.mouse.up()
  await expectPixel(page, size, 200, 150, isGray, 'and back')
})

test('sliders explain themselves, and switching tools keeps the change', async ({ page }) => {
  const size = await blueDesign(page)
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  const brightness = page.getByRole('slider', { name: 'Brightness' })
  await brightness.focus()
  for (let i = 0; i < 3; i++) await brightness.press('Shift+ArrowRight')
  await expect(brightness).toHaveAttribute('aria-valuetext', '+30')
  await brightness.hover()
  await expect(page.getByRole('tooltip')).toContainText('Lighter.')
  await expectPixel(page, size, 200, 150, (rgba) => rgba[0] > BLUE[0] + 20 && rgba[1] > BLUE[1] + 20, 'lighter')

  await page.getByRole('button', { name: 'Brush tool' }).click()
  await expect(await undoTip(page)).toContainText('Undo brightness')
  const kept = await designPixel(page, size, 200, 150)
  expect(kept[0]).toBeGreaterThan(BLUE[0] + 20)
})

test('blur softens a line, and a full picture keeps solid edges', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [20, 150],
    [380, 150],
  ])
  expectColor(await designPixel(page, size, 200, 150), INK)
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  const blur = page.getByRole('slider', { name: 'Blur' })
  await blur.focus()
  for (let i = 0; i < 5; i++) await blur.press('Shift+ArrowRight')
  await expect(blur).toHaveAttribute('aria-valuetext', '50')
  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo blur')
  const middle = await designPixel(page, size, 200, 150)
  const beside = await designPixel(page, size, 200, 158)
  expect(middle[0], 'the line is softer').toBeGreaterThan(INK[0] + 30)
  expect(beside[0], 'and spreads out').toBeLessThan(250)

  // The white paper, blurred all over, stays solid white right into its corners.
  await page.getByRole('button', { name: 'Layer: Background' }).click()
  await blur.focus()
  for (let i = 0; i < 10; i++) await blur.press('Shift+ArrowRight')
  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo blur')
  for (const [x, y] of [[1, 1], [398, 298]]) expectColor(await designPixel(page, size, x, y), WHITE, 2)
})

test('with a selection, only the selected part changes', async ({ page }) => {
  const size = await blueDesign(page)
  await page.getByRole('button', { name: 'Select tool' }).click()
  await drag(page, size, [
    [0, 0],
    [200, 300],
  ])
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await expect(toolbar(page)).toContainText('Changes the selected part of “Layer 1”')
  await expect(page.getByRole('status').filter({ hasText: 'Only the selected area changes.' })).toBeVisible()
  await page.getByRole('radio', { name: 'Black & white' }).click()
  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo black & white look')
  expect(isGray(await designPixel(page, size, 100, 150))).toBe(true)
  expectColor(await designPixel(page, size, 300, 150), BLUE)
})

test('Adjust starts on a layer with something on it, and explains when there is nothing', async ({ page }) => {
  const size = await newDesign(page)
  // Layer 1 is empty, so Adjust picks the white paper underneath.
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await expect(toolbar(page)).toContainText('Changes “Background”')
  await expect(page.getByRole('button', { name: 'Layer: Background' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Hide Background' }).click()
  await expect(toolbar(page)).toContainText('“Background” is hidden')
  await expect(page.getByRole('region', { name: 'Adjust' })).toContainText('is hidden')
  await page.getByRole('button', { name: 'Show Background' }).click()

  await page.getByRole('button', { name: 'Layer: Layer 1' }).click()
  await expect(toolbar(page)).toContainText('There is nothing on “Layer 1” to adjust yet.')
  await clickAt(page, size, 200, 150)
  expectColor(await designPixel(page, size, 200, 150), WHITE)
})

test('search finds looks from everyday words', async ({ page }) => {
  const size = await blueDesign(page)
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox')
  await search.fill('sepia')
  await expect(page.getByRole('option').first()).toContainText('Old photo look')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Adjust tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'Old photo' })).toHaveAttribute('aria-checked', 'true')
  await expectPixel(page, size, 200, 150, (rgba) => rgba[0] > rgba[1] && rgba[1] > rgba[2], 'brownish')

  await page.keyboard.press('Control+k')
  await search.fill('blur')
  await expect(page.getByRole('option').first()).toContainText('Adjust tool')
})

test('adjust settings fit on common laptop screens', async ({ page }) => {
  await blueDesign(page)
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await page.getByRole('radio', { name: 'Warm' }).click()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    const bar = toolbar(page)
    const { scroll, client } = await bar.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(scroll, `Adjust settings at ${width}px wide`).toBeLessThanOrEqual(client)
    await expect(page.getByRole('region', { name: 'Adjust' }).getByRole('slider', { name: 'Sharpen' })).toBeAttached()
  }
})
