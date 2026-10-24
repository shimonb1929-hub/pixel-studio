import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [220, 40, 40]
const BLUE: [number, number, number] = [40, 60, 220]
const GREEN: [number, number, number] = [40, 180, 80]

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A 400 × 300 photo: red on the left, blue on the right, with a green square at the top left. It
// is placed at 80%, so on the design it covers 40–360 across and 30–270 down, red up to 200 and
// the green square at 56–104 across and 46–94 down.
async function addPhoto(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#dc2828'
    ctx.fillRect(0, 0, 200, 300)
    ctx.fillStyle = '#283cdc'
    ctx.fillRect(200, 0, 200, 300)
    ctx.fillStyle = '#28b450'
    ctx.fillRect(20, 20, 60, 60)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'halves.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: halves' })).toBeVisible()
}

test('Copy paint copies the clicked part to where you paint, and Undo takes it back', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page)
  await page.keyboard.press('s')
  await expect(page.getByRole('button', { name: 'Copy paint (Clone) tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('toolbar')).toContainText('Click the part of your photo you want to copy.')

  // The first click picks the spot to copy; painting over the blue then copies the red.
  await clickAt(page, size, 100, 150)
  await expect(page.getByRole('toolbar')).toContainText('Paint where the copy should go.')
  expectColor(await designPixel(page, size, 300, 150), BLUE)
  await drag(page, size, [
    [300, 150],
    [320, 150],
  ])
  expectColor(await designPixel(page, size, 300, 150), RED, 12)
  expectColor(await designPixel(page, size, 310, 150), RED, 12)
  expectColor(await designPixel(page, size, 352, 150), BLUE, 0)
  expect(await undoLabel(page)).toContain('Undo copy paint')

  // Following along, the next stroke keeps the same distance: 200 to the left of it is copied.
  await drag(page, size, [
    [280, 70],
    [290, 70],
  ])
  expectColor(await designPixel(page, size, 285, 70), GREEN, 12)

  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 300, 150), BLUE, 0)
  expectColor(await designPixel(page, size, 285, 70), BLUE, 0)
})

test('Copy paint can copy from a new spot, and starts over each stroke when not following along', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page)
  await page.keyboard.press('s')
  await clickAt(page, size, 80, 70)
  await page.getByRole('button', { name: 'Follow along (Aligned)' }).click()
  await expect(page.getByRole('button', { name: 'Follow along (Aligned)' })).toHaveAttribute('aria-pressed', 'false')
  await drag(page, size, [
    [300, 200],
    [304, 200],
  ])
  expectColor(await designPixel(page, size, 300, 200), GREEN, 12)
  // A new stroke far away copies the green again.
  await drag(page, size, [
    [330, 240],
    [334, 240],
  ])
  expectColor(await designPixel(page, size, 330, 240), GREEN, 12)

  // Holding Alt and clicking picks another spot.
  await clickAt(page, size, 150, 200, ['Alt'])
  await drag(page, size, [
    [250, 120],
    [254, 120],
  ])
  expectColor(await designPixel(page, size, 250, 120), RED, 12)
})

test('Copy paint says what it needs when there is no picture under it', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('s')
  await clickAt(page, size, 100, 100)
  await expect(page.getByRole('alert').filter({ hasText: 'Copy paint works on photos and drawings' })).toBeVisible()
})
