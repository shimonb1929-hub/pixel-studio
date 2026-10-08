import { designPixel, drag, expectColor, newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

// Puts a picture on the computer's clipboard, as if it had been copied in another program.
async function copyPictureFromElsewhere(page: import('@playwright/test').Page, width: number, height: number, color: string) {
  await page.evaluate(
    async ([w, h, c]) => {
      const canvas = new OffscreenCanvas(w as number, h as number)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c as string
      ctx.fillRect(0, 0, w as number, h as number)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    },
    [width, height, color] as const,
  )
}

test('Ctrl+V pastes a picture copied in another program, in the middle of the design', async ({ page }) => {
  const size = await newDesign(page)
  await copyPictureFromElsewhere(page, 60, 40, '#0000ff')
  await page.keyboard.press('Control+v')
  await expect(page.getByRole('button', { name: 'Layer: Pasted' })).toBeVisible()
  expectColor(await designPixel(page, size, 200, 150), [0, 0, 255])
  expectColor(await designPixel(page, size, 165, 150), [255, 255, 255])
})

test('Ctrl+V with no design open makes a new design from the picture', async ({ page }) => {
  await copyPictureFromElsewhere(page, 320, 200, '#ff8800')
  await page.keyboard.press('Control+v')
  await expect(page.getByText('320 × 200 px')).toBeVisible()
  await expect(page.locator('header')).toContainText('Pasted picture')
})

test('Ctrl+C then Ctrl+V puts the copy back exactly where it came from', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('m')
  await drag(page, size, [
    [40, 40],
    [100, 100],
  ])
  await page.keyboard.press('Alt+Backspace')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(page.getByRole('button', { name: 'Layer: Pasted' })).toBeVisible()
  // Hide the original, so only the pasted copy can be showing.
  await page.getByRole('button', { name: 'Hide Layer 1' }).click()
  expectColor(await designPixel(page, size, 70, 70), [239, 68, 68])
  expectColor(await designPixel(page, size, 200, 150), [255, 255, 255])
})
