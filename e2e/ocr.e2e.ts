import type { Page } from '@playwright/test'
import { clickAt, newDesign, photoTool } from './helpers.ts'
import { expect, test } from './setup.ts'

// Words from a picture reads the words with files from our own site only. These tests block every
// other site, as NetFree may, and check that nothing tried to reach one.
const OCR_TIMEOUT = 120_000

async function blockOtherSites(page: Page): Promise<string[]> {
  const outside: string[] = []
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    outside.push(url.href)
    return route.abort()
  })
  await page.reload()
  return outside
}

// Adds a photo drawn right here: a flyer with lines of words, in the app's own Heebo font (it has
// English and Hebrew letters), black on white.
async function addFlyer(page: Page, lines: { text: string; size: number; color?: string; x: number; y: number; rtl?: boolean }[], width = 900, height = 420) {
  const base64 = await page.evaluate(
    async ({ lines, width, height }) => {
      for (const file of ['heebo-latin-wght-normal.woff2', 'heebo-hebrew-wght-normal.woff2']) {
        const face = new FontFace('Flyer', `url(fonts/heebo/${file})`, { weight: '100 900' })
        document.fonts.add(await face.load())
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      for (const line of lines) {
        ctx.font = `600 ${line.size}px Flyer`
        ctx.fillStyle = line.color ?? '#111111'
        ctx.direction = line.rtl ? 'rtl' : 'ltr'
        ctx.textAlign = line.rtl ? 'right' : 'left'
        ctx.fillText(line.text, line.x, line.y)
      }
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    { lines, width, height },
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'flyer.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: flyer' })).toBeVisible()
}

async function openWords(page: Page, size: { width: number; height: number }) {
  await page.keyboard.press('v')
  await clickAt(page, size, size.width / 2, size.height / 2)
  await photoTool(page, 'Words from a picture')
  return page.getByRole('dialog', { name: 'Words from a picture' })
}

test('Words from a picture reads English and Hebrew with no other site', async ({ page }) => {
  test.setTimeout(OCR_TIMEOUT + 60_000)
  const outside = await blockOtherSites(page)
  const size = await newDesign(page, 600, 280)
  await addFlyer(page, [
    { text: 'Summer Sale', size: 64, x: 60, y: 110 },
    { text: 'שלום עולם', size: 64, x: 840, y: 250, rtl: true, color: '#b01020' },
    { text: 'Fresh bread daily', size: 52, x: 60, y: 360 },
  ])

  const dialog = await openWords(page, size)
  // English is picked to start with (the app is in English); Hebrew is added.
  await expect(dialog.getByRole('checkbox', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('checkbox', { name: 'Hebrew' }).click()
  await dialog.getByRole('button', { name: 'Find the words' }).click()

  const found = dialog.getByTestId('found-words')
  await expect(found).toBeVisible({ timeout: OCR_TIMEOUT })
  await expect(found).toContainText('Summer Sale')
  await expect(found).toContainText('שלום עולם')
  await expect(found).toContainText('Fresh bread daily')

  await dialog.getByRole('button', { name: 'Add as text' }).click()
  await expect(dialog).toBeHidden()
  // The words are real text, kept together above the photo, which stays.
  await expect(page.getByRole('button', { name: 'Kept together: Words from picture' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer: Summer Sale' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Layer: .?שלום עולם.?$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer: Fresh bread daily' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer: flyer' })).toBeVisible()

  // One undo takes all of it away again.
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: 'Kept together: Words from picture' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Layer: Summer Sale' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Layer: flyer' })).toBeVisible()

  expect(outside).toEqual([])
})

test('Words from a picture reads Yiddish', async ({ page }) => {
  test.setTimeout(OCR_TIMEOUT + 60_000)
  const outside = await blockOtherSites(page)
  const size = await newDesign(page, 600, 200)
  await addFlyer(page, [{ text: 'מיר זיינען דא', size: 72, x: 640, y: 130, rtl: true }], 700, 220)

  const dialog = await openWords(page, size)
  await dialog.getByRole('checkbox', { name: 'English' }).click()
  await dialog.getByRole('checkbox', { name: 'Yiddish' }).click()
  await dialog.getByRole('button', { name: 'Find the words' }).click()
  const found = dialog.getByTestId('found-words')
  await expect(found).toBeVisible({ timeout: OCR_TIMEOUT })
  await expect(found).toContainText('מיר זיינען דא')
  expect(outside).toEqual([])
})
