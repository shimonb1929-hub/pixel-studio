import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, expectColor, INK, newDesign, screenPoint, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const shapePanel = (page: Page) => page.getByRole('region', { name: 'Shape' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// Presses at one design point and lets go at another, as when pulling out a curve.
async function pressAndDrag(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await drag(page, size, [from, to])
}

test('the Curve tool draws a closed shape point by point, filled with the shape color', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('p')
  await expect(page.getByRole('button', { name: 'Curve tool' })).toHaveAttribute('aria-pressed', 'true')
  await clickAt(page, size, 100, 60)
  await clickAt(page, size, 200, 220)
  await expect(page.getByRole('toolbar')).toContainText('Close shape')
  await clickAt(page, size, 40, 220)
  // Clicking the first point closes the shape.
  await clickAt(page, size, 100, 60)
  expect(await layerNames(page)).toEqual(['Drawn shape 1'])
  expect(await undoLabel(page)).toContain('Undo draw shape')
  // A triangle: inside is filled, outside stays white.
  expectColor(await designPixel(page, size, 110, 180), BLUE)
  expectColor(await designPixel(page, size, 180, 100), WHITE)
  // The Pen stays on, and the new shape's points show for reshaping.
  await expect(page.getByRole('button', { name: 'Curve tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(shapePanel(page)).toContainText('Drawn shape 1')
  // Effects can be added right away, without switching tools.
  await expect(page.getByRole('region', { name: 'Effects' })).toBeVisible()
  // With Arrange, a double-click on a pen shape shows its points again.
  await page.keyboard.press('v')
  const inside = await screenPoint(page, size, 110, 180)
  await page.mouse.dblclick(inside.x, inside.y)
  await expect(page.getByRole('button', { name: 'Curve tool' })).toHaveAttribute('aria-pressed', 'true')
})

test('pressing and dragging makes a smooth curve; Enter finishes an open line', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('p')
  await clickAt(page, size, 40, 150)
  // Dragging up from the middle point bends the line over the top, like a hill.
  await pressAndDrag(page, size, [200, 80], [280, 80])
  await clickAt(page, size, 360, 150)
  await page.keyboard.press('Enter')
  expect(await layerNames(page)).toEqual(['Curve 1'])
  // The line goes through the middle point up at y 80, not straight across at y 150.
  expectColor(await designPixel(page, size, 200, 80), INK, 40)
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  // The Shape panel treats it as a line: a color and a thickness, and an arrow head if wanted.
  await expect(shapePanel(page).getByRole('button', { name: 'Line color' })).toBeVisible()
  await shapePanel(page).getByRole('button', { name: 'Arrow head' }).click()
  expect(await undoLabel(page)).toContain('Undo arrow head')
})

test('points of a drawn shape can be moved, added, made smooth and deleted', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('p')
  for (const [x, y] of [
    [100, 50],
    [300, 50],
    [300, 250],
    [100, 250],
    [100, 50],
  ] as [number, number][]) {
    await clickAt(page, size, x, y)
  }
  expect(await layerNames(page)).toEqual(['Drawn shape 1'])
  expectColor(await designPixel(page, size, 200, 150), BLUE)

  // Drag a corner point outwards.
  await drag(page, size, [
    [300, 250],
    [360, 280],
  ])
  expect(await undoLabel(page)).toContain('Undo move point')
  expectColor(await designPixel(page, size, 340, 265), BLUE)
  await expect(page.getByRole('radiogroup', { name: 'Point' })).toBeVisible()

  // Drag the top side up: it bends into a curve.
  await drag(page, size, [
    [200, 50],
    [200, 15],
  ])
  expect(await undoLabel(page)).toContain('Undo bend curve')
  expectColor(await designPixel(page, size, 200, 30), BLUE)

  // Click the left side to add a point there, then delete it again.
  await clickAt(page, size, 100, 150)
  expect(await undoLabel(page)).toContain('Undo add point')
  await page.keyboard.press('Delete')
  expect(await undoLabel(page)).toContain('Undo delete point')
  expect(await layerNames(page)).toEqual(['Drawn shape 1'])

  // Double-click a corner to make it smooth.
  const corner = await screenPoint(page, size, 100, 250)
  await page.mouse.dblclick(corner.x, corner.y)
  expect(await undoLabel(page)).toContain('Undo smooth curve')
})

test('any shape can be reshaped point by point with Edit points', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [100, 100],
    [300, 200],
  ])
  await shapePanel(page).getByRole('button', { name: 'Edit points' }).click()
  await expect(page.getByRole('button', { name: 'Curve tool' })).toHaveAttribute('aria-pressed', 'true')
  expectColor(await designPixel(page, size, 200, 150), BLUE)
  // Pull a corner far out.
  await drag(page, size, [
    [300, 200],
    [380, 280],
  ])
  expectColor(await designPixel(page, size, 330, 220), BLUE)
  expect(await undoLabel(page)).toContain('Undo move point')
})

test('a shape can be filled with a gradient, from a ready-made one', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [0, 0],
    [400, 300],
  ])
  await shapePanel(page).getByRole('radio', { name: 'Gradient' }).click()
  await shapePanel(page).getByRole('radio', { name: 'Sunset' }).click()
  expect(await undoLabel(page)).toContain('Undo sunset gradient')
  // Sunset runs top to bottom, from #ff7e5f to #feb47b.
  expectColor(await designPixel(page, size, 200, 2), [255, 127, 96], 10)
  expectColor(await designPixel(page, size, 200, 297), [254, 179, 123], 10)
  // The Color panel colors the picked gradient color.
  await shapePanel(page).getByRole('button', { name: 'Gradient color 2' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expectColor(await designPixel(page, size, 200, 297), [239, 68, 68], 10)
  // Round gradients fade out from the middle.
  await shapePanel(page).getByRole('radio', { name: 'Round' }).click()
  expectColor(await designPixel(page, size, 200, 150), [255, 126, 95], 10)
  // Back to one color.
  await shapePanel(page).getByRole('radio', { name: 'Color' }).click()
  const middle = await designPixel(page, size, 200, 150)
  const corner = await designPixel(page, size, 5, 5)
  expect(middle).toEqual(corner)
})

test('drawn shapes and gradients come back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('p')
  for (const [x, y] of [
    [50, 50],
    [350, 50],
    [200, 250],
    [50, 50],
  ] as [number, number][]) {
    await clickAt(page, size, x, y)
  }
  await shapePanel(page).getByRole('radio', { name: 'Gradient' }).click()
  await shapePanel(page).getByRole('radio', { name: 'Ocean' }).click()
  const before = await designPixel(page, size, 200, 100)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })
  await expect.poll(() => layerNames(page)).toEqual(['Drawn shape 1'])
  expect(await designPixel(page, size, 200, 100)).toEqual(before)
  expectColor(await designPixel(page, size, 200, 280), WHITE)
})
