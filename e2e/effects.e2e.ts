import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const RED: [number, number, number] = [239, 68, 68]

const effectsPanel = (page: Page) => page.getByRole('region', { name: 'Effects' })

// The Effects panel starts folded into one line; this opens it if it isn't open yet.
async function openEffects(page: Page) {
  const header = effectsPanel(page).getByRole('button', { name: /^Effects:/ })
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

// How dark a pixel is, 0 (white) to 255 (black).
const darkness = (pixel: number[]) => 255 - (pixel[0] + pixel[1] + pixel[2]) / 3

test('shadow, glow and outline around a shape, changeable any time', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [100, 100], [200, 180])
  await expect(effectsPanel(page)).toContainText('Rectangle 1')
  expectColor(await designPixel(page, size, 203, 183), WHITE)
  await openEffects(page)

  // A ready-made shadow, falling down and to the right.
  await effectsPanel(page).getByRole('radio', { name: 'Bold shadow' }).click()
  await expect(effectsPanel(page).getByRole('radio', { name: 'Bold shadow' })).toHaveAttribute('aria-checked', 'true')
  expect(darkness(await designPixel(page, size, 202, 182))).toBeGreaterThan(180)
  expectColor(await designPixel(page, size, 97, 97), WHITE)
  expectColor(await designPixel(page, size, 150, 140), BLUE)
  expect(await undoLabel(page)).toContain('Undo bold shadow effect')

  // An outline of its own color, all the way around.
  await effectsPanel(page).getByRole('button', { name: 'Add outline' }).click()
  await effectsPanel(page).getByRole('button', { name: 'Outline color' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expectColor(await designPixel(page, size, 98, 140), RED)
  expectColor(await designPixel(page, size, 150, 98), RED)
  // The shape itself keeps its color.
  expectColor(await designPixel(page, size, 150, 140), BLUE)
  expect(await undoLabel(page)).toContain('Undo outline color')

  // A glow reaches out past the outline and fades.
  await effectsPanel(page).getByRole('button', { name: 'Add glow' }).click()
  const near = darkness(await designPixel(page, size, 150, 92))
  const far = darkness(await designPixel(page, size, 150, 86))
  expect(near).toBeGreaterThan(far)
  expect(near).toBeGreaterThan(10)

  // Taking them off brings back the plain shape.
  await effectsPanel(page).getByRole('radio', { name: 'None' }).click()
  expectColor(await designPixel(page, size, 98, 140), WHITE)
  expectColor(await designPixel(page, size, 202, 182), WHITE)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 98, 140), RED)
})

test('a layer can mix with what is below it, and it all comes back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [50, 50], [200, 200])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drawRectangle(page, size, [150, 100], [300, 250])
  await openEffects(page)
  await effectsPanel(page).getByRole('radio', { name: 'Soft shadow' }).click()
  // Where they overlap the blue one simply covers the red one.
  expectColor(await designPixel(page, size, 175, 150), BLUE)

  await effectsPanel(page).getByLabel("Mix with what's below").selectOption({ label: 'Darken only' })
  expect(await undoLabel(page)).toContain('Undo mix: darken only')
  // Darken only (multiply): red times blue is a dark purple, and blue over white stays blue.
  const mixed = await designPixel(page, size, 175, 150)
  expectColor(mixed, [Math.round((239 * 59) / 255), Math.round((68 * 91) / 255), Math.round((68 * 253) / 255)], 10)
  expectColor(await designPixel(page, size, 250, 220), BLUE)
  const shadowed = darkness(await designPixel(page, size, 225, 255))
  expect(shadowed).toBeGreaterThan(20)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'Mixed.pixel', mimeType: '', buffer: bytes })

  await expect(page.locator('header')).toContainText('My design 1')
  expectColor(await designPixel(page, size, 175, 150), mixed as [number, number, number], 3)
  expect(Math.abs(darkness(await designPixel(page, size, 225, 255)) - shadowed)).toBeLessThan(3)
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Layer: Rectangle 2' }).click()
  await openEffects(page)
  await expect(effectsPanel(page).getByLabel("Mix with what's below")).toHaveValue('multiply')
  await expect(effectsPanel(page).getByRole('radio', { name: 'Soft shadow' })).toHaveAttribute('aria-checked', 'true')
})

test('effects are also under the Adjust sliders', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [100, 100], [200, 180])
  await page.keyboard.press('a')
  await expect(page.getByRole('region', { name: 'Adjust' })).toBeVisible()
  await openEffects(page)
  await effectsPanel(page).getByRole('radio', { name: 'Bold shadow' }).click()
  expect(darkness(await designPixel(page, size, 202, 182))).toBeGreaterThan(180)
})

test('effects stay folded away until wanted, and the search box finds them', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [100, 100], [200, 180])
  // Folded, the panel is one line saying what's on it, and the layers stay in view.
  const header = effectsPanel(page).getByRole('button', { name: /^Effects:/ })
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  await expect(header).toContainText('None')
  await expect(effectsPanel(page).getByRole('radio', { name: 'Soft shadow' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Layer: Rectangle 1' })).toBeInViewport()

  // Typing "shadow" in the search box opens it.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('drop shadow')
  await page.getByRole('option', { name: /Shadow, glow or outline/ }).click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
  await effectsPanel(page).getByRole('radio', { name: 'Soft shadow' }).click()
  expect(darkness(await designPixel(page, size, 150, 186))).toBeGreaterThan(10)

  // Folded again, it still says what's on it.
  await header.click()
  await expect(header).toContainText('Soft shadow')
})
