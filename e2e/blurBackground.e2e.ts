import type { Page } from '@playwright/test'
import { addBallPhoto, AI_TIMEOUT, BALL } from './aiPhoto.ts'
import { clickAt, designPixel, expectColor, newDesign, type Size, photoTool } from './helpers.ts'
import { expect, test } from './setup.ts'

// The striped sky photo is placed at 80% size from (40, 30). In the photo, x 16–24 is a dark
// stripe and x 24–32 is light sky: on the design, x 54 and x 62 fall inside them.
async function stripeContrast(page: Page, size: Size) {
  const dark = await designPixel(page, size, 54, 50)
  const light = await designPixel(page, size, 62, 50)
  return light[0] - dark[0]
}

test('Blur the background keeps the main thing sharp and softens what is behind it', async ({ page }) => {
  test.setTimeout(AI_TIMEOUT + 60_000)
  const size = await newDesign(page)
  await addBallPhoto(page, true)
  await expect.poll(() => stripeContrast(page, size)).toBeGreaterThan(90)

  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await photoTool(page, 'Blur the background')
  const slider = page.getByRole('slider', { name: 'How much blur' })
  await expect(slider).toBeVisible({ timeout: AI_TIMEOUT })

  // The preview shows on the design right away: the stripes go soft, the ball stays sharp.
  await expect.poll(() => stripeContrast(page, size)).toBeLessThan(50)
  expectColor(await designPixel(page, size, 200, 150), BALL)
  expectColor(await designPixel(page, size, 200, 100), BALL)
  // Just outside the ball, the background has none of the ball's red smeared into it.
  const beside = await designPixel(page, size, 263, 150)
  expect(beside[2]).toBeGreaterThan(beside[0] + 40)

  // Esc puts it back as it was, and nothing was kept.
  await page.keyboard.press('Escape')
  await expect(slider).toBeHidden()
  await expect.poll(() => stripeContrast(page, size)).toBeGreaterThan(90)

  // More blur, then Apply: one step to undo.
  await photoTool(page, 'Blur the background')
  await expect(slider).toBeVisible({ timeout: AI_TIMEOUT })
  await slider.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '70%')
  // The arrow keys moved the slider, not the photo.
  await expect.poll(() => stripeContrast(page, size)).toBeLessThan(40)
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(slider).toBeHidden()
  await expect.poll(() => stripeContrast(page, size)).toBeLessThan(25)
  expectColor(await designPixel(page, size, 200, 150), BALL)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Undo blur the background')

  await page.keyboard.press('Control+z')
  await expect.poll(() => stripeContrast(page, size)).toBeGreaterThan(90)
})
