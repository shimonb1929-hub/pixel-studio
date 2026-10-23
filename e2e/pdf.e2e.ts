import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { clickAt, drag, expectColor, newDesign, WHITE } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]

test('a PDF for printing keeps every pixel, with an edge and cut lines for print shops', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])

  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('pdf')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Download as PDF')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await expect(dialog.getByRole('radio', { name: 'PDF' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByRole('radio', { name: 'Printing' })).toHaveAttribute('aria-checked', 'true')
  // 400 × 300 pixels prints at 300 per inch.
  await expect(dialog).toContainText('Prints 1.33 × 1 inches (3.4 × 2.5 cm).')
  await expect(dialog).toContainText('Saves as My design 1.pdf')

  // Typing one side keeps the shape.
  const width = dialog.getByRole('textbox', { name: 'Width in inches' })
  const height = dialog.getByRole('textbox', { name: 'Height in inches' })
  await height.fill('2')
  await expect(width).toHaveValue('2.67')
  await height.fill('1')
  await expect(width).toHaveValue('1.33')

  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'For print shops' }).click()
  await dialog.getByRole('checkbox', { name: /Extra edge for cutting/ }).check()
  await dialog.getByRole('checkbox', { name: /Cut lines/ }).check()

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  expect(download.suggestedFilename()).toBe('My design 1.pdf')
  const bytes = readFileSync((await download.path())!)
  const file = bytes.toString('latin1')
  expect(file.startsWith('%PDF-1.4')).toBe(true)
  // 1.33 × 1 inches and 3/8 of an inch around it for the cut lines, in points.
  expect(file).toContain('/MediaBox [0 0 150 126]')
  expect(file).toContain('/TrimBox [27 27 123 99]')
  expect(file).toContain('/BleedBox [18 18 132 108]')
  expect(file).toContain(' l S')

  // The picture: the design plus an eighth of an inch (37.5 pixels) all round, kept exactly.
  const head = /\/Width (\d+) \/Height (\d+) .*?\/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/.exec(file)!
  const [w, h, length] = [Number(head[1]), Number(head[2]), Number(head[3])]
  expect([w, h]).toEqual([475, 375])
  const start = head.index + head[0].length
  const rgb = inflateSync(bytes.subarray(start, start + length))
  expect(rgb.length).toBe(w * h * 3)
  const pixel = (x: number, y: number) => [...rgb.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)]
  expectColor(pixel(237, 137), RED)
  expectColor(pixel(237, 237), WHITE)
})

test('a PDF for screens is small and needs no print settings', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])
  await page.keyboard.press('Control+s')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await dialog.getByRole('radio', { name: 'PDF' }).click()
  await dialog.getByRole('radio', { name: 'Screen' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Width in inches' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'For print shops' })).toHaveCount(0)
  await expect(dialog).toContainText(/About \d+ KB/)

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  const file = readFileSync((await download.path())!).toString('latin1')
  // The design's own size on screen (96 pixels to the inch), drawn at twice the detail.
  expect(file).toContain('/MediaBox [0 0 300 225]')
  expect(file).toContain('/Width 800 /Height 600')
  expect(file).toContain('/DCTDecode')
  expect(file).not.toContain('/TrimBox')
})

test('text in a PDF can be found and copied, Hebrew included', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 340, 100)
  await page.keyboard.type('שלום Pixel')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+s')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await dialog.getByRole('radio', { name: /PDF/ }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  const file = readFileSync((await download.path())!).toString('latin1')
  // Invisible letters over the picture, and a list saying which letter each one is.
  expect(file).toContain('3 Tr')
  expect(file).toContain('/ToUnicode')
  for (const letter of 'שלוםPixel') expect(file).toContain(` <${letter.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}>`)
})
