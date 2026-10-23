import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// The design helpers: colors from a photo, matching the design to it, words that are always
// readable, and tidying the whole page.

const BLUE: [number, number, number] = [59, 91, 253]
const layerList = (page: Page) => page.getByRole('list', { name: 'Layer list' })

// A photo drawn here: navy on the left, orange on the right, with a cream stripe. Added at the
// size it is, in the middle of the design.
async function addPhoto(page: Page, width: number, height: number, name = 'sunset') {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'rgb(24, 40, 82)'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgb(232, 120, 32)'
      ctx.fillRect(w * 0.6, 0, w * 0.4, h)
      ctx.fillStyle = 'rgb(246, 236, 210)'
      ctx.fillRect(0, h * 0.85, w, h * 0.15)
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [width, height],
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: `Layer: ${name}` })).toBeVisible()
}

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  // Alt places it freely, so smart guides don't line it up before Tidy gets the chance.
  await page.keyboard.down('Alt')
  await drag(page, size, [from, to])
  await page.keyboard.up('Alt')
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function runAction(page: Page, title: string) {
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'What do you want to do?' })
  await search.fill(title)
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText(title)
  await search.press('Enter')
}

const differs = (a: number[], b: [number, number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 30

test('the Color panel shows the photo’s colors, and Match design recolors the page after a preview', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, 200, 140)
  const row = page.getByTestId('photo-colors')
  await expect(row).toBeVisible()
  const swatches = row.getByRole('button', { name: /^Photo color / })
  await expect.poll(() => swatches.count()).toBeGreaterThanOrEqual(3)

  // A click uses the color.
  const label = (await swatches.first().getAttribute('aria-label'))!
  await swatches.first().click()
  await expect(page.getByRole('textbox', { name: 'Color code' })).toHaveValue(label.replace('Photo color #', ''))

  // A blue rectangle above the photo.
  await drawRectangle(page, size, [10, 10], [120, 50])
  expectColor(await designPixel(page, size, 60, 30), BLUE)

  await row.getByRole('button', { name: 'Match design' }).click()
  const bar = page.getByRole('dialog', { name: 'Match design to photo' })
  await expect(bar).toContainText('Things changing color: 1')
  await expect.poll(async () => differs(await designPixel(page, size, 60, 30), BLUE)).toBe(true)
  // Esc puts it back.
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  await expect.poll(async () => differs(await designPixel(page, size, 60, 30), BLUE)).toBe(false)

  await row.getByRole('button', { name: 'Match design' }).click()
  await bar.getByRole('button', { name: 'Apply' }).click()
  await expect(bar).toBeHidden()
  await expect.poll(async () => differs(await designPixel(page, size, 60, 30), BLUE)).toBe(true)
  expect(await undoLabel(page)).toContain('Undo match design to photo')
  await page.keyboard.press('Control+z')
  await expect.poll(async () => differs(await designPixel(page, size, 60, 30), BLUE)).toBe(false)
})

test('words that are hard to read on a photo get a quiet note with fixes', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, 400, 300, 'night')
  // Dark words on the navy part of the photo. Hebrew grows to the left of the click.
  await page.keyboard.press('t')
  await clickAt(page, size, 220, 100)
  await page.keyboard.type('שלום 2024 hello')
  await page.keyboard.press('Escape')
  const note = page.getByRole('note', { name: 'Hard to read here' })
  await expect(note).toBeVisible()

  // Pointing at a fix shows it on the design; moving away puts it back.
  const before = await layerList(page).getByRole('button', { name: /^Layer: / }).count()
  await note.getByRole('button', { name: 'White words' }).hover()
  await note.getByRole('button', { name: 'White words' }).click()
  await expect(note).toBeHidden()
  expect(await undoLabel(page)).toContain('Undo make words readable')

  await page.keyboard.press('Control+z')
  await expect(note).toBeVisible()
  await note.getByRole('button', { name: 'Box behind' }).click()
  await expect(note).toBeHidden()
  await expect(layerList(page).getByRole('button', { name: /^Layer: / })).toHaveCount(before + 1)
  await expect(layerList(page)).toContainText('Box behind words')

  // Dark words below the photo, on the white page and the cream stripe, are fine: no note.
  await page.keyboard.press('Control+z')
  await page.keyboard.press('t')
  await clickAt(page, size, 300, 285)
  await page.keyboard.type('Hi')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Text' })).toBeVisible()
  await expect(page.getByRole('note', { name: 'Hard to read here' })).toHaveCount(0)
})

test('Tidy the whole page nudges things that are almost in line, after a preview', async ({ page }) => {
  const size = await newDesign(page, 600, 400)
  await drawRectangle(page, size, [40, 40], [240, 80])
  await drawRectangle(page, size, [42, 150], [122, 190])
  await page.keyboard.press('Escape')
  expectColor(await designPixel(page, size, 40.5, 170), WHITE)

  await runAction(page, 'Tidy the whole page')
  const bar = page.getByRole('dialog', { name: 'Tidy the whole page' })
  await expect(bar).toContainText('Things moving: 1')
  await expect.poll(async () => designPixel(page, size, 40.5, 170)).toEqual([...BLUE, 255])
  await bar.getByRole('button', { name: 'Cancel' }).click()
  await expect(bar).toBeHidden()
  expectColor(await designPixel(page, size, 40.5, 170), WHITE)

  await runAction(page, 'Tidy the whole page')
  await page.keyboard.press('Enter')
  await expect(bar).toBeHidden()
  expectColor(await designPixel(page, size, 40.5, 170), BLUE)
  expectColor(await designPixel(page, size, 121.5, 170), WHITE)
  expect(await undoLabel(page)).toContain('Undo tidy the whole page')

  // Once tidy, there is nothing left to do.
  await runAction(page, 'Tidy the whole page')
  await expect(page.getByText('The page is already tidy')).toBeVisible()
})

test('the helpers speak Hebrew', async ({ page }) => {
  const he: Record<string, string> = JSON.parse(readFileSync('src/i18n/messages/he.json', 'utf8'))
  const size = await newDesign(page)
  await addPhoto(page, 200, 140)
  await drawRectangle(page, size, [10, 10], [120, 50])
  await page.getByRole('button', { name: /^Language: / }).click()
  await page.getByRole('menuitemradio', { name: 'עברית' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('photo-colors')).toContainText(he['Colors from your photos'])
  await page.getByTestId('photo-colors').getByRole('button', { name: he['Match design'] }).click()
  await expect(page.getByRole('dialog', { name: he['Match design to photo'] })).toBeVisible()
  await page.keyboard.press('Escape')
})
