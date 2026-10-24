import type { Page } from '@playwright/test'
import { clickAt, designPixel, expectPickedSize, newDesign, photoTool } from './helpers.ts'
import { expect, test } from './setup.ts'

// Adds a photo drawn right here: dark and light stripes with a red square, `width` × `height`.
async function addPhoto(page: Page, width: number, height: number) {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'rgb(240, 240, 240)'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgb(30, 40, 60)'
      for (let x = 0; x < w / 2; x += 6) ctx.fillRect(x, 0, 3, h)
      ctx.fillStyle = 'rgb(210, 30, 40)'
      ctx.fillRect(w * 0.6, h * 0.3, w * 0.3, h * 0.4)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [width, height],
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'small.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: small' })).toBeVisible()
}

async function openUpscale(page: Page, size: { width: number; height: number }) {
  await page.keyboard.press('v')
  await clickAt(page, size, size.width / 2, size.height / 2)
  await photoTool(page, 'Bigger and sharper')
  return page.getByRole('dialog', { name: 'Bigger and sharper' })
}

test('Bigger and sharper gives a photo more pixels and keeps it in its place', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await addPhoto(page, 160, 120)
  const dialog = await openUpscale(page, size)
  await expectPickedSize(page, 160, 120)
  const before = await designPixel(page, size, 200 + 40, 150)

  // 2 times is picked to start with, and says how big the result is.
  await expect(dialog.getByRole('radio', { name: /2 times/ })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('radio', { name: /2 times/ })).toContainText('320 × 240')
  await expect(dialog.getByRole('radio', { name: /4 times/ })).toContainText('640 × 480')
  await expect(dialog.getByText(/now 300 dots per inch, after 600/)).toBeVisible()

  // Press and hold the preview to see the photo as it is now.
  const preview = dialog.getByTestId('upscale-preview')
  await expect(preview).toHaveAttribute('aria-label', 'After')
  const box = (await preview.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(preview).toHaveAttribute('aria-label', 'Before')
  await page.mouse.up()
  await expect(preview).toHaveAttribute('aria-label', 'After')

  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('“small” now has 320 × 240 pixels', { exact: false })).toBeVisible()
  // The same place and size on the design, looking the same.
  await expectPickedSize(page, 160, 120)
  expect(await designPixel(page, size, 200 + 40, 150)).toEqual(before)

  // One undo step, with a clear name.
  await page.getByRole('button', { name: 'Undo' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Undo bigger and sharper')
  await page.keyboard.press('Control+z')
  await expectPickedSize(page, 160, 120)
  await page.keyboard.press('Control+Shift+z')
  await expectPickedSize(page, 160, 120)
})

test('Bigger and sharper warns about very big results and refuses too big ones', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await addPhoto(page, 3000, 2200)
  const dialog = await openUpscale(page, size)
  await expect(dialog.getByText(/Too big/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Apply' })).not.toHaveAttribute('aria-disabled')

  await dialog.getByRole('radio', { name: /4 times/ }).click()
  await expect(dialog.getByText(/Too big: this would make a 105\.6-megapixel photo/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Apply' })).toHaveAttribute('aria-disabled', 'true')

  // Esc closes it and nothing changes.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Undo' }).hover()
  await expect(page.getByRole('tooltip')).not.toContainText('bigger and sharper')
})
