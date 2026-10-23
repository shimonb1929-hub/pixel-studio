import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// A field of grass with a dark box (the "house") in it. No people, just shapes.
const GRASS: [number, number, number] = [96, 160, 72]
const HOUSE: [number, number, number] = [60, 40, 30]

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function addField(page: Page) {
  const base64 = await page.evaluate(async () => {
    // Small enough to be added at its real size, centered: it covers 40-360 across, 30-270 down.
    const canvas = new OffscreenCanvas(320, 240)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#60a048'
    ctx.fillRect(0, 0, 320, 240)
    // On the design, the house covers 100-140 across and down.
    ctx.fillStyle = '#3c281e'
    ctx.fillRect(60, 70, 40, 40)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'field.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: field' })).toBeVisible()
}

async function selectHouse(page: Page, size: Size) {
  await page.keyboard.press('m')
  await drag(page, size, [
    [92, 92],
    [148, 148],
  ])
  await page.keyboard.press('v')
}

test('moving a selected thing in a photo fills the gap it leaves, and Undo puts it back', async ({ page }) => {
  const size = await newDesign(page)
  await addField(page)
  await selectHouse(page, size)
  await expect(page.getByRole('button', { name: 'Fill the gap' })).toHaveAttribute('aria-pressed', 'true')
  await drag(page, size, [
    [120, 120],
    [200, 160],
    [300, 200],
  ])
  // The house is in its new place, and where it stood is grass again.
  await expect.poll(async () => (await designPixel(page, size, 120, 120))[1]).toBeGreaterThan(130)
  expectColor(await designPixel(page, size, 120, 120), GRASS, 16)
  expectColor(await designPixel(page, size, 102, 102), GRASS, 16)
  expectColor(await designPixel(page, size, 300, 200), HOUSE)
  expect(await undoLabel(page)).toMatch(/Undo (move and fill the gap|fill the gap)/)

  await page.keyboard.press('Control+z')
  // If the gap was filled a moment after the move, that's a step of its own.
  if ((await designPixel(page, size, 300, 200))[1] < 100) await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 102, 102), HOUSE)
  expectColor(await designPixel(page, size, 120, 120), HOUSE)
  expectColor(await designPixel(page, size, 300, 200), GRASS)
})

test('with Fill the gap off, the place a part came from is left see-through', async ({ page }) => {
  const size = await newDesign(page)
  await addField(page)
  await selectHouse(page, size)
  await page.getByRole('button', { name: 'Fill the gap' }).click()
  await expect(page.getByRole('button', { name: 'Fill the gap' })).toHaveAttribute('aria-pressed', 'false')
  await drag(page, size, [
    [120, 120],
    [300, 200],
  ])
  expectColor(await designPixel(page, size, 120, 120), WHITE)
  expectColor(await designPixel(page, size, 300, 200), HOUSE)
})

test('resizing a selected part with Arrange fills the gap behind it too', async ({ page }) => {
  const size = await newDesign(page)
  await addField(page)
  await selectHouse(page, size)
  await expect(page.getByRole('button', { name: 'Fill the gap' })).toBeVisible()
  // Wait for the gap to be ready, then shrink the part from its bottom-right corner.
  await page.waitForTimeout(500)
  await drag(page, size, [
    [148, 148],
    [125, 125],
    [110, 110],
  ])
  await expect.poll(async () => (await designPixel(page, size, 135, 135))[1]).toBeGreaterThan(130)
  expectColor(await designPixel(page, size, 135, 135), GRASS, 16)
})
