import type { Page } from '@playwright/test'
import { clickAt, designPixel, expectColor, newDesign, photoTool, screenPoint, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// Test pictures are drawn in code: plain shapes and colors, never real photos.
const GRAY: [number, number, number] = [200, 200, 200]
const BLUE: [number, number, number] = [30, 60, 160]

// A 400 × 300 PNG: plain gray, or gray with a blue four-cornered "page" photographed at a slant,
// its corners at (100, 60), (300, 40), (320, 250) and (80, 230).
async function drawnPhoto(page: Page, slanted: boolean): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([withPage, gray, blue]) => {
      const canvas = new OffscreenCanvas(400, 300)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = `rgb(${gray.join(',')})`
      ctx.fillRect(0, 0, 400, 300)
      if (withPage) {
        ctx.fillStyle = `rgb(${blue.join(',')})`
        ctx.beginPath()
        ctx.moveTo(100, 60)
        ctx.lineTo(300, 40)
        ctx.lineTo(320, 250)
        ctx.lineTo(80, 230)
        ctx.closePath()
        ctx.fill()
      }
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [slanted, GRAY, BLUE] as const,
  )
  return Buffer.from(base64, 'base64')
}

// Adds a photo; a 400 × 300 one is placed at 80% size, from (40, 30) to (360, 270), so a photo
// pixel (x, y) is at (40 + 0.8x, 30 + 0.8y) on the design.
async function addPhoto(page: Page, slanted: boolean) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'card.png', mimeType: 'image/png', buffer: await drawnPhoto(page, slanted) })
  await expect(page.getByRole('button', { name: 'Layer: card' })).toBeVisible()
  await page.keyboard.press('v')
  await clickAt(page, { width: 400, height: 300 }, 200, 150)
}

const panel = (page: Page) => page.getByRole('region', { name: 'Move the corners' })

// Drags a corner dot to a point of the design.
async function dragDot(page: Page, size: Size, name: string, x: number, y: number) {
  const dot = page.getByRole('button', { name, exact: true })
  const from = (await dot.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  const to = await screenPoint(page, size, x, y)
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('Fit to a place moves a photo’s corner, shows it live, and keeps it with one undo step', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, false)
  await photoTool(page, 'Move the corners')
  await expect(panel(page)).toContainText('Drag the dots on the corners')
  await expect(panel(page).getByRole('radio', { name: 'Fit to a place' })).toHaveAttribute('aria-checked', 'true')

  // Pull the bottom right corner in toward the middle: the photo bends, right there on the design.
  await dragDot(page, size, 'Bottom right corner', 260, 200)
  await expect.poll(async () => (await designPixel(page, size, 340, 255))[0]).toBeGreaterThan(240)
  expectColor(await designPixel(page, size, 60, 50), GRAY)
  expectColor(await designPixel(page, size, 240, 190), GRAY)
  // Nothing shows past the moved corner, even where the bent photo's far side would land.
  expectColor(await designPixel(page, size, 300, 240), WHITE)
  await panel(page).getByRole('button', { name: 'Apply' }).click()
  await expect(panel(page)).toBeHidden()
  expectColor(await designPixel(page, size, 340, 255), WHITE)
  expectColor(await designPixel(page, size, 60, 50), GRAY)
  // The other corners stayed where they were.
  expectColor(await designPixel(page, size, 355, 35), GRAY)
  expectColor(await designPixel(page, size, 45, 265), GRAY)

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await designPixel(page, size, 340, 255))[0]).toBeLessThan(230)
  expectColor(await designPixel(page, size, 340, 255), GRAY)
})

test('Face front makes a page photographed at a slant flat and square', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, true)
  await photoTool(page, 'Move the corners')
  await panel(page).getByRole('radio', { name: 'Face front' }).click()
  await expect(panel(page)).toContainText('slanted page')

  // The page's corners on the design.
  const corners: [string, number, number][] = [
    ['Top left corner', 120, 78],
    ['Top right corner', 280, 62],
    ['Bottom right corner', 296, 230],
    ['Bottom left corner', 104, 214],
  ]
  for (const [name, x, y] of corners) await dragDot(page, size, name, x, y)
  // Every dot is where it was dragged, even one that started under the card.
  for (const [name, x, y] of corners) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
    const at = await screenPoint(page, size, x, y)
    expect(Math.abs(box.x + box.width / 2 - at.x)).toBeLessThan(2)
    expect(Math.abs(box.y + box.height / 2 - at.y)).toBeLessThan(2)
  }
  // The result shows small in the card first; the photo itself has not changed.
  await expect(panel(page).getByLabel('How it will look')).toBeVisible()
  expectColor(await designPixel(page, size, 60, 150), GRAY)

  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeHidden()
  // Now only the page is left, upright and all blue to its edges, standing where it was.
  // Middle (200, 146); about 177 wide and 153 tall.
  for (const [x, y] of [
    [116, 74],
    [284, 74],
    [116, 218],
    [284, 218],
    [200, 146],
  ]) {
    expectColor(await designPixel(page, size, x, y), BLUE, 14)
  }
  // The gray around it is gone.
  expectColor(await designPixel(page, size, 60, 150), WHITE)
  expectColor(await designPixel(page, size, 200, 40), WHITE)
})

test('search finds Move the corners by its pro word, and Esc leaves the photo as it was', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, false)
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'What do you want to do?' })
  await search.fill('perspective')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Move the corners')
  await search.press('Enter')
  await expect(panel(page)).toBeVisible()
  await dragDot(page, size, 'Top left corner', 150, 120)
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0]).toBeGreaterThan(240)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0]).toBeLessThan(230)
})
