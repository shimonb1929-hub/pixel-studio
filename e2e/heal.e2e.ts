import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

const SAND: [number, number, number] = [214, 180, 120]

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A 400 × 300 photo of sand with a dark spot in it.
async function spottedPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d6b478'
    ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = '#202020'
    ctx.beginPath()
    ctx.arc(200, 150, 12, 0, Math.PI * 2)
    ctx.fill()
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  return Buffer.from(base64, 'base64')
}

test('Fix spots fills a spot in from around it, and Undo brings it back', async ({ page }) => {
  const size = await newDesign(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'sand.png', mimeType: 'image/png', buffer: await spottedPhoto(page) })
  await expect(page.getByRole('button', { name: 'Layer: sand' })).toBeVisible()
  expectColor(await designPixel(page, size, 200, 150), [32, 32, 32])

  await page.keyboard.press('j')
  await expect(page.getByRole('button', { name: 'Fix spots tool' })).toHaveAttribute('aria-pressed', 'true')
  await drag(page, size, [
    [190, 150],
    [210, 150],
  ])
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[0]).toBeGreaterThan(150)
  expectColor(await designPixel(page, size, 200, 150), SAND, 12)
  expectColor(await designPixel(page, size, 205, 145), SAND, 12)
  expectColor(await designPixel(page, size, 100, 100), SAND, 0)
  expect(await undoLabel(page)).toContain('Undo fix spots')

  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 150), [32, 32, 32])
})

test('Fix spots says what it needs when there is no picture under it', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('j')
  await drag(page, size, [
    [100, 100],
    [120, 100],
  ])
  await expect(page.getByRole('alert').filter({ hasText: 'Fix spots works on photos and drawings' })).toBeVisible()
})
