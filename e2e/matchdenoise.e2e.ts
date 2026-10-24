import type { Page } from '@playwright/test'
import { designPixel, newDesign, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// Pictures are drawn here in code: a bluish one, a warm one, and a gray one full of speckles.
type Kind = 'cool' | 'warm' | 'noisy'

async function picture(page: Page, kind: Kind, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([kind, width, height]) => {
      const canvas = new OffscreenCanvas(width as number, height as number)
      const g = canvas.getContext('2d')!
      if (kind === 'noisy') {
        const image = g.createImageData(width as number, height as number)
        let seed = 12345
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 8) / 0xffffff
        for (let i = 0; i < image.data.length; i += 4) {
          const light = (random() - 0.5) * 50
          for (let c = 0; c < 3; c++) image.data[i + c] = 110 + light + (random() - 0.5) * 30
          image.data[i + 3] = 255
        }
        g.putImageData(image, 0, 0)
      } else {
        const fade = g.createLinearGradient(0, 0, width as number, 0)
        fade.addColorStop(0, kind === 'cool' ? 'rgb(20, 40, 90)' : 'rgb(90, 45, 15)')
        fade.addColorStop(1, kind === 'cool' ? 'rgb(150, 185, 245)' : 'rgb(250, 205, 140)')
        g.fillStyle = fade
        g.fillRect(0, 0, width as number, height as number)
      }
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [kind, width, height] as const,
  )
  return Buffer.from(base64, 'base64')
}

async function openPicture(page: Page, kind: Kind, width = 300, height = 200): Promise<Size> {
  await page.locator('input[type=file]').setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: await picture(page, kind, width, height) })
  await expect(page.getByText(`${width} × ${height} px`)).toBeVisible()
  return { width, height }
}

async function addPicture(page: Page, kind: Kind, width: number, height: number) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: await picture(page, kind, width, height) })
  await expect(page.getByRole('button', { name: `Layer: ${kind}` })).toBeVisible()
}

const panel = (page: Page) => page.getByRole('region', { name: 'Adjust' })
const undoTip = async (page: Page) => {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip')
}

// The preview can lag a moment behind a change, so pixels are checked until they settle.
async function expectPixel(page: Page, size: Size, x: number, y: number, check: (rgba: number[]) => boolean, what: string) {
  await expect.poll(async () => check(await designPixel(page, size, x, y)), { message: what }).toBe(true)
}

// How much the light wanders in a square of the design as shown on screen (at 100% zoom).
function speckles(page: Page, size: Size, x: number, y: number, side: number): Promise<number> {
  return page.evaluate(
    async ([w, h, px, py, n]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), Math.round(n * dpr), Math.round(n * dpr)).data
      let sum = 0
      let squares = 0
      for (let i = 0; i < data.length; i += 4) {
        const light = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        sum += light
        squares += light * light
      }
      const count = data.length / 4
      return Math.sqrt(squares / count - (sum / count) ** 2)
    },
    [size.width, size.height, x, y, side],
  )
}

test('match another photo: the picked photo takes on its light and colors, to fine-tune or take back', async ({ page }) => {
  const size = await openPicture(page, 'cool')
  // A warm photo, smaller, in the middle of the design: the cool photo's corners still show.
  await addPicture(page, 'warm', 120, 80)
  await page.getByRole('button', { name: 'Layer: Picture' }).click()
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  const before = await designPixel(page, size, 150, 15)
  expect(before[2]).toBeGreaterThan(before[0] + 40)

  const match = panel(page).getByRole('button', { name: 'Match another photo' })
  await match.hover()
  await expect(page.getByRole('tooltip')).toContainText('Match Color')
  await match.click()
  const tiles = panel(page).getByRole('radiogroup', { name: 'Match another photo' })
  // Only the other photo is offered, as a tile drawn from the photo itself.
  await expect(tiles.getByRole('radio')).toHaveCount(1)
  const warm = tiles.getByRole('radio', { name: 'warm' })
  await warm.click()
  await expect(warm).toHaveAttribute('aria-checked', 'true')
  await expectPixel(page, size, 150, 15, (rgba) => rgba[0] > rgba[2], 'the cool photo turns warm')
  // The warm photo itself stays as it is.
  const warmMiddle = await designPixel(page, size, 150, 100)
  expect(warmMiddle[0]).toBeGreaterThan(warmMiddle[2])

  // How much: all the way down changes nothing; halfway is in between.
  const amount = panel(page).getByRole('slider', { name: 'How much' })
  await expect(amount).toHaveAttribute('aria-valuetext', '100%')
  await amount.focus()
  for (let i = 0; i < 10; i++) await amount.press('Shift+ArrowLeft')
  await expect(amount).toHaveAttribute('aria-valuetext', '0%')
  await expectPixel(page, size, 150, 15, (rgba) => Math.abs(rgba[2] - before[2]) <= 4 && Math.abs(rgba[0] - before[0]) <= 4, 'back to how it was')
  for (let i = 0; i < 5; i++) await amount.press('Shift+ArrowRight')
  await expect(amount).toHaveAttribute('aria-valuetext', '50%')
  await expectPixel(page, size, 150, 15, (rgba) => rgba[0] > before[0] + 15 && rgba[2] < before[2] - 15, 'halfway warmer')

  // It's all ordinary light curves, ready to change: the light curve opens by itself.
  await expect(panel(page).getByRole('button', { name: 'Light curve' })).toHaveAttribute('aria-expanded', 'true')
  await panel(page).getByRole('radiogroup', { name: 'Which light' }).getByRole('radio', { name: 'Red' }).click()
  await expect(panel(page).getByRole('slider', { name: 'Point 5' })).toBeAttached()

  // Nothing is kept until Apply: Esc takes it back.
  await page.keyboard.press('Escape')
  await expectPixel(page, size, 150, 15, (rgba) => Math.abs(rgba[2] - before[2]) <= 4, 'Esc puts it back')

  await warm.click()
  await expectPixel(page, size, 150, 15, (rgba) => rgba[0] > rgba[2], 'warm again')
  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo')
  await expectPixel(page, size, 150, 15, (rgba) => rgba[0] > rgba[2], 'kept')
  await page.keyboard.press('Control+z')
  await expectPixel(page, size, 150, 15, (rgba) => Math.abs(rgba[2] - before[2]) <= 4, 'undo takes it back')
})

test('match another photo explains when there is no other photo', async ({ page }) => {
  await newDesign(page)
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  await page.keyboard.press('Alt+Backspace')
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  await panel(page).getByRole('button', { name: 'Match another photo' }).click()
  await expect(panel(page)).toContainText('There is no other photo on this design yet.')
})

test('clean grain takes the speckles out and stays changeable', async ({ page }) => {
  const size = await openPicture(page, 'noisy')
  await page.getByRole('button', { name: 'Adjust tool' }).click()
  const before = await speckles(page, size, 100, 60, 40)
  expect(before).toBeGreaterThan(10)

  const clean = panel(page).getByRole('slider', { name: 'Clean grain' })
  await expect(clean).toHaveAttribute('aria-valuetext', '0')
  await clean.focus()
  for (let i = 0; i < 10; i++) await clean.press('Shift+ArrowRight')
  await expect(clean).toHaveAttribute('aria-valuetext', '100')
  await clean.hover()
  await expect(page.getByRole('tooltip')).toContainText('Reduce Noise')
  await expect(page.getByRole('tooltip')).toContainText('Very smooth')
  await expect.poll(() => speckles(page, size, 100, 60, 40), { message: 'far fewer speckles' }).toBeLessThan(before * 0.5)

  await page.keyboard.press('Enter')
  await expect(await undoTip(page)).toContainText('Undo clean grain')
  // Kept as the photo's setting, at full detail: still clean, and still at 100 when coming back.
  await expect.poll(() => speckles(page, size, 100, 60, 40)).toBeLessThan(before * 0.5)
  await page.getByRole('button', { name: 'Brush tool' }).click()
  await page.getByRole('button', { name: 'Change adjustments of Picture' }).click()
  await expect(panel(page).getByRole('slider', { name: 'Clean grain' })).toHaveAttribute('aria-valuetext', '100')
})

test('search finds match colors and clean grain from everyday and pro words', async ({ page }) => {
  await openPicture(page, 'noisy')
  const search = page.getByRole('combobox', { name: 'What do you want to do?' })
  await page.keyboard.press('Control+k')
  await search.fill('reduce noise')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Clean grain')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Adjust tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel(page).getByRole('slider', { name: 'Clean grain' })).toBeFocused()

  await page.keyboard.press('Control+k')
  await search.fill('match color')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Match colors of another photo')
  await search.press('Enter')
  await expect(panel(page)).toContainText('There is no other photo on this design yet.')
})
