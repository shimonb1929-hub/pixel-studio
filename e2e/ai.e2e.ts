import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// These tests download the AI the first time, so they get more time.
const AI_TIMEOUT = 180_000

const SKY: [number, number, number] = [150, 200, 235]
const BALL: [number, number, number] = [220, 40, 40]

// A 400 × 300 photo of a red ball on a blue sky. It is placed at 80% size, from (40, 30) to (360, 270).
async function addBallPhoto(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(150, 200, 235)'
    ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = 'rgb(220, 40, 40)'
    ctx.beginPath()
    ctx.arc(200, 150, 70, 0, Math.PI * 2)
    ctx.fill()
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'ball.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: ball' })).toBeVisible()
}

async function expectBallOnly(page: Page, size: Size, around: [number, number, number]) {
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0], { timeout: AI_TIMEOUT }).toBeGreaterThan(around[0] - 10)
  expectColor(await designPixel(page, size, 60, 50), around)
  expectColor(await designPixel(page, size, 340, 250), around)
  expectColor(await designPixel(page, size, 200, 150), BALL)
  expectColor(await designPixel(page, size, 200, 110), BALL)
}

test('Remove background keeps the main thing and clears the rest', async ({ page }) => {
  test.setTimeout(AI_TIMEOUT + 30_000)
  const size = await newDesign(page)
  await addBallPhoto(page)
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0]).toBe(SKY[0])

  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await page.getByRole('button', { name: 'Remove background' }).click()
  // The page is white, so where the sky was now shows white.
  await expectBallOnly(page, size, WHITE)

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0]).toBe(SKY[0])
})

test('Magic select picks the thing that was clicked', async ({ page }) => {
  test.setTimeout(AI_TIMEOUT + 30_000)
  const size = await newDesign(page)
  await addBallPhoto(page)

  await page.keyboard.press('m')
  await page.getByRole('radio', { name: 'Magic' }).click()
  await clickAt(page, size, 200, 150)
  // Inverting the selection and deleting leaves just the ball.
  await expect(page.getByRole('button', { name: 'Select everything else' })).toBeVisible()
  await expect.poll(async () => page.getByRole('button', { name: 'Delete selected area' }).isEnabled(), { timeout: AI_TIMEOUT }).toBe(true)
  await page.getByRole('button', { name: 'Select everything else' }).click()
  await page.getByRole('button', { name: 'Delete selected area' }).click()
  await expectBallOnly(page, size, WHITE)
})

test('Magic select also finds the thing inside a dragged box', async ({ page }) => {
  test.setTimeout(AI_TIMEOUT + 30_000)
  const size = await newDesign(page)
  await addBallPhoto(page)

  await page.keyboard.press('m')
  await page.getByRole('radio', { name: 'Magic' }).click()
  await drag(page, size, [
    [120, 70],
    [280, 230],
  ])
  await expect.poll(async () => page.getByRole('button', { name: 'Delete selected area' }).isEnabled(), { timeout: AI_TIMEOUT }).toBe(true)
  await page.getByRole('button', { name: 'Delete selected area' }).click()
  // The ball is gone and the sky around it stays.
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[1]).toBeGreaterThan(240)
  expectColor(await designPixel(page, size, 200, 110), WHITE)
  expectColor(await designPixel(page, size, 60, 50), SKY)
  expectColor(await designPixel(page, size, 130, 150), SKY)
})
