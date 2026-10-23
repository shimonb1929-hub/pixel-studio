import type { Page } from '@playwright/test'
import { expect } from './setup.ts'

// Shared by the AI browser tests. They download the AI the first time, so they get more time.
export const AI_TIMEOUT = 180_000

export const SKY: [number, number, number] = [150, 200, 235]
export const BALL: [number, number, number] = [220, 40, 40]

// A 400 × 300 photo of a red ball on a sky, drawn in code (the site has no pictures of its own).
// `sky` paints the sky: plain by default, or with stripes so a blur shows. It is placed at 80% size,
// from (40, 30) to (360, 270) on a 400 × 300 design.
export async function addBallPhoto(page: Page, stripes = false) {
  const base64 = await page.evaluate(async (striped) => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(150, 200, 235)'
    ctx.fillRect(0, 0, 400, 300)
    if (striped) {
      // Dark blue stripes across the sky, 8 pixels wide: sharp lines a blur smooths away.
      ctx.fillStyle = 'rgb(40, 60, 140)'
      for (let x = 0; x < 400; x += 16) ctx.fillRect(x, 0, 8, 300)
    }
    ctx.fillStyle = 'rgb(220, 40, 40)'
    ctx.beginPath()
    ctx.arc(200, 150, 70, 0, Math.PI * 2)
    ctx.fill()
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, stripes)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'ball.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: ball' })).toBeVisible()
}
