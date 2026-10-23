import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, expectDesignSize, newDesign, screenPoint, WHITE, type Size, photoTool } from './helpers.ts'
import { expect, test } from './setup.ts'

// Test pictures are drawn in code: plain shapes and colors, never real photos.
type Drawing = 'horizon' | 'ball' | 'wide-ball'

// A PNG drawn in the page. 'horizon' is sky over sea with the horizon leaning 6° clockwise (its
// right end lower); 'ball' is a red ball in the middle of a blue sky (no straight lines);
// 'wide-ball' is 400 × 200 with a red ball far to the right.
async function drawnPhoto(page: Page, drawing: Drawing): Promise<Buffer> {
  const base64 = await page.evaluate(async (kind) => {
    const width = 400
    const height = kind === 'wide-ball' ? 200 : 300
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(150, 200, 235)'
    ctx.fillRect(0, 0, width, height)
    if (kind === 'horizon') {
      const slope = Math.tan((6 * Math.PI) / 180)
      const y = (x: number) => 135 + (x - 200) * slope
      ctx.fillStyle = 'rgb(30, 80, 120)'
      ctx.beginPath()
      ctx.moveTo(-10, y(-10))
      ctx.lineTo(410, y(410))
      ctx.lineTo(410, 310)
      ctx.lineTo(-10, 310)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgb(220, 40, 40)'
      ctx.beginPath()
      if (kind === 'ball') ctx.arc(200, 150, 70, 0, Math.PI * 2)
      else ctx.arc(330, 100, 40, 0, Math.PI * 2)
      ctx.fill()
    }
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, drawing)
  return Buffer.from(base64, 'base64')
}

// Adds a photo; a 400 × 300 one is placed at 80% size, from (40, 30) to (360, 270).
async function addPhoto(page: Page, drawing: Drawing) {
  const buffer = await drawnPhoto(page, drawing)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: `${drawing}.png`, mimeType: 'image/png', buffer })
  await expect(page.getByRole('button', { name: `Layer: ${drawing}` })).toBeVisible()
}

// Where the horizon is in one column of the design: the first sea-colored pixel from the top.
async function horizonAt(page: Page, size: Size, x: number): Promise<number> {
  return page.evaluate(
    async ([w, h, px]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const ctx = canvas.getContext('2d')!
      for (let y = 35; y < 265; y++) {
        const [, , b] = ctx.getImageData(left + Math.floor(px * dpr), top + Math.floor(y * dpr), 1, 1).data
        if (b < 180) return y
      }
      return -1
    },
    [size.width, size.height, x],
  )
}

async function lean(page: Page, size: Size): Promise<number> {
  return (await horizonAt(page, size, 300)) - (await horizonAt(page, size, 100))
}

const panel = (page: Page) => page.getByRole('region', { name: 'Straighten' })

test('Straighten finds a leaning horizon, shows it level, and keeps it with one undo step', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, 'horizon')
  // 200 design pixels across, a 6° lean drops the horizon about 21 pixels.
  await expect.poll(() => lean(page, size)).toBeGreaterThan(17)

  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await photoTool(page, 'Straighten')
  await expect(panel(page)).toContainText(/Turned \u2066?−(5\.[89]|6\.[01])°/)
  // The preview is level already, and the photo still fills its frame: no empty corners, and
  // nothing sticks out past it.
  await expect.poll(async () => Math.abs(await lean(page, size))).toBeLessThanOrEqual(2)
  expectColor(await designPixel(page, size, 43, 33), [150, 200, 235], 12)
  expectColor(await designPixel(page, size, 357, 267), [30, 80, 120], 12)
  expectColor(await designPixel(page, size, 20, 150), WHITE)
  expectColor(await designPixel(page, size, 200, 15), WHITE)

  // Fine-tune: turning it further makes it lean the other way.
  const slider = panel(page).getByRole('slider', { name: 'How much' })
  await slider.focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft')
  await expect(panel(page).getByRole('slider')).toHaveAttribute('aria-valuetext', /−(9\.[89]|10\.[01])°/)
  await expect.poll(() => lean(page, size)).toBeLessThan(-10)
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => Math.abs(await lean(page, size))).toBeLessThanOrEqual(2)

  await panel(page).getByRole('button', { name: 'Apply' }).click()
  await expect(panel(page)).toBeHidden()
  await expect.poll(async () => Math.abs(await lean(page, size))).toBeLessThanOrEqual(2)
  expectColor(await designPixel(page, size, 43, 33), [150, 200, 235], 12)

  // One undo step brings the leaning photo back.
  await page.keyboard.press('Control+z')
  await expect.poll(() => lean(page, size)).toBeGreaterThan(17)
})

test('Esc leaves the photo as it was; search finds Straighten', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, 'horizon')
  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'What do you want to do?' })
  await search.fill('crooked horizon')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Straighten photo')
  await search.press('Enter')
  await expect(panel(page)).toBeVisible()
  await expect.poll(async () => Math.abs(await lean(page, size))).toBeLessThanOrEqual(2)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect.poll(() => lean(page, size)).toBeGreaterThan(17)
})

test('Straighten says so when a photo has no clear straight lines', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, 'ball')
  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await photoTool(page, 'Straighten')
  await expect(panel(page)).toContainText('No clear straight lines')
  await panel(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(panel(page)).toBeHidden()
})

test('a ready-made crop shape starts over the main thing, not the plain middle', async ({ page }) => {
  const size = await newDesign(page)
  // A blue square well to the right: from 300 to 360 across.
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [300, 120],
    [360, 180],
  ])
  await page.keyboard.press('c')
  await page.getByRole('radio', { name: 'Square' }).click()
  await expect(page.getByRole('toolbar')).toContainText('300 × 300 px')
  await page.keyboard.press('Enter')
  await expectDesignSize(page, 300, 300)
  // The frame went as far right as it could (100 in), so the square is now 200 to 260 across.
  // From the plain middle (50 in), it would be 250 to 310.
  const cropped = { width: 300, height: 300 }
  await page.keyboard.press('Control+0')
  await page.keyboard.press('Control+Alt+0')
  expectColor(await designPixel(page, cropped, 215, 150), [59, 91, 253])
  expectColor(await designPixel(page, cropped, 280, 150), WHITE)
})

// Drops a picture file onto a point of the design, as if dragged there from the computer.
async function dropPhoto(page: Page, size: Size, x: number, y: number, buffer: Buffer) {
  const point = await screenPoint(page, size, x, y)
  await page.evaluate(
    ([data, clientX, clientY]) => {
      const bytes = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'wide-ball.png', { type: 'image/png' }))
      const target = document.querySelector('main')!
      for (const type of ['dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: clientX as number, clientY: clientY as number }))
      }
    },
    [buffer.toString('base64'), point.x, point.y] as const,
  )
}

test('a photo dropped into a shape starts on its main thing, and can be centered on it again', async ({ page }) => {
  const size = await newDesign(page)
  // A 100 × 100 square from (150, 100) to (250, 200).
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [150, 100],
    [250, 200],
  ])
  await dropPhoto(page, size, 200, 150, await drawnPhoto(page, 'wide-ball'))
  // The ball sits far to the right of the photo; the plain middle would show only sky.
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[0]).toBeGreaterThan(200)
  expectColor(await designPixel(page, size, 200, 150), [220, 40, 40])

  // Slide the photo to its other end, then ask for the main thing again.
  await page.getByRole('button', { name: 'Move photo', exact: true }).click()
  await drag(page, size, [
    [160, 150],
    [245, 150],
  ])
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[0]).toBeLessThan(200)
  await page.getByRole('button', { name: 'Center on the main thing' }).click()
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[0]).toBeGreaterThan(200)
})
