import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, drag, newDesign, paintedIn, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })
const textPanel = (page: Page) => page.getByRole('region', { name: 'Text' })

async function typeText(page: Page, size: Size, x: number, y: number, words: string) {
  await page.keyboard.press('t')
  await clickAt(page, size, x, y)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.insertText(words)
  await page.keyboard.press('Escape')
  await expect(typingBox(page)).toHaveCount(0)
}

// Moves the Bend slider by tenths: right bends up like a rainbow, left down like a smile.
async function bend(page: Page, tenths: number) {
  await textPanel(page).getByRole('slider', { name: 'Bend' }).focus()
  for (let i = 0; i < Math.abs(tenths); i++) await page.keyboard.press(tenths > 0 ? 'Shift+ArrowRight' : 'Shift+ArrowLeft')
}

// Ink in a strip of the design.
const inkIn = (page: Page, size: Size, x: number, y: number, width: number, height: number) => paintedIn(page, size, { x, y, width, height })

test('Bend arches words up like a rainbow or down like a smile, in English and Hebrew, and straightens again', async ({ page }) => {
  const size = await newDesign(page, 600, 400)
  await typeText(page, size, 100, 200, 'Happy birthday to you')
  // Straight: the words sit on one line, with nothing well above it.
  expect(await inkIn(page, size, 0, 100, 600, 60)).toBe(0)
  await bend(page, 4)
  await expect(textPanel(page).getByRole('slider', { name: 'Bend' })).toHaveAttribute('aria-valuetext', '+80%')
  // The middle of the arch rises above where the line was; its ends drop below it.
  expect(await inkIn(page, size, 0, 100, 600, 60)).toBeGreaterThan(0)
  // Bending doesn't move the text: its middle stays put, and arrow keys on the slider leave it alone.
  await expect(page.getByRole('button', { name: 'Layer: Happy birthday to you' })).toBeVisible()
  await page.getByRole('button', { name: 'Straight again' }).click()
  expect(await inkIn(page, size, 0, 100, 600, 60)).toBe(0)
  await page.keyboard.press('Control+z')
  expect(await inkIn(page, size, 0, 100, 600, 60)).toBeGreaterThan(0)
  await page.keyboard.press('Control+z')
  expect(await inkIn(page, size, 0, 100, 600, 60)).toBe(0)

  // Hebrew bends down like a smile too: its ends rise above the line, its middle drops below it.
  await typeText(page, size, 500, 300, 'שלום עולם 123')
  expect(await inkIn(page, size, 0, 330, 600, 70)).toBe(0)
  await bend(page, -4)
  await expect(textPanel(page).getByRole('slider', { name: 'Bend' })).toHaveAttribute('aria-valuetext', '-80%')
  expect(await inkIn(page, size, 0, 330, 600, 70)).toBeGreaterThan(0)
})

test('words run along the edge of a shape, on either side, and the shape inside can still be clicked', async ({ page }) => {
  const size = await newDesign(page, 500, 500)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Oval', exact: true }).click()
  await drag(page, size, [
    [180, 180],
    [320, 320],
  ])
  await typeText(page, size, 40, 470, 'AROUND THE CIRCLE')
  // Nothing above the circle yet.
  expect(await inkIn(page, size, 120, 100, 260, 70)).toBe(0)
  // The text is picked; Shift+click adds the circle, and the bar offers to put the words along it.
  await clickAt(page, size, 250, 250, ['Shift'])
  await page.getByRole('toolbar').getByRole('button', { name: 'Along the shape' }).click()
  // The words now arch over the top of the circle, outside it.
  expect(await inkIn(page, size, 120, 120, 260, 55)).toBeGreaterThan(0)
  expect(await inkIn(page, size, 0, 440, 500, 60)).toBe(0)
  await expect(textPanel(page).getByRole('slider', { name: 'Slide along' })).toBeVisible()

  // The other side puts them inside the circle.
  await page.getByRole('button', { name: 'Other side' }).click()
  expect(await inkIn(page, size, 120, 120, 260, 55)).toBe(0)
  await page.getByRole('button', { name: 'Other side' }).click()

  // Clicking the middle of the circle picks the circle, not the ring of words.
  await page.keyboard.press('Escape')
  await clickAt(page, size, 40, 40)
  await clickAt(page, size, 250, 250)
  await expect(page.getByRole('region', { name: 'Shape' })).toBeVisible()

  // Downloaded as SVG, the letters stay letters, each turned along the curve.
  await page.getByRole('button', { name: /What do you want to do/ }).click()
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('svg')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  const svg = readFileSync((await download.path())!, 'utf8')
  expect(svg).toMatch(/<text transform="translate\([^)]*\) rotate\([^)]*\)"[^>]*>A<\/text>/)
})
