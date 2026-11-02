import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]

const layerList = (page: Page) => page.getByRole('list', { name: 'Layer list' })
const layerNames = (page: Page) => layerList(page).getByRole('button', { name: /^Layer: / }).allTextContents()
const layerButton = (page: Page, name: string) => layerList(page).getByRole('button', { name: `Layer: ${name}`, exact: true })

// Presses on a row in the list and lets go over another row: on its top half (above), bottom half
// (below), or on the page.
async function dragRow(page: Page, name: string, onto: string, side: 'above' | 'below') {
  const from = (await layerButton(page, name).boundingBox())!
  const to = (await (onto === 'Page' ? page.getByRole('button', { name: 'Page', exact: true }) : layerButton(page, onto)).boundingBox())!
  await page.mouse.move(from.x + 30, from.y + from.height / 2)
  await page.mouse.down()
  const y = side === 'above' ? to.y + 4 : to.y + to.height - 4
  await page.mouse.move(to.x + 30, (from.y + y) / 2, { steps: 4 })
  await page.mouse.move(to.x + 30, y, { steps: 4 })
  await page.mouse.up()
}

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

// Tall enough for the whole Layers list to show.
test.use({ viewport: { width: 1400, height: 1300 } })

test('drag a layer up or down the list to put it in front or behind', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])

  // Dropped on the top half of a row, it goes above it.
  await dragRow(page, 'Rectangle 1', 'Rectangle 3', 'above')
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Rectangle 3', 'Rectangle 2'])

  // Dropped on the bottom half, below it.
  await dragRow(page, 'Rectangle 1', 'Rectangle 2', 'below')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])

  // Dropped on the page, it goes to the back, right above the page.
  await dragRow(page, 'Rectangle 3', 'Page', 'above')
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1', 'Rectangle 3'])

  // Letting go doesn't pick what was dragged as a click would, and it is one step to undo.
  await expect(layerButton(page, 'Rectangle 3')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])
})

test('join a layer with the one below it, or several picked layers, into one', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  const join = page.getByRole('button', { name: 'Join into one layer' })

  // One picked: it joins with the layer below it, keeps its name, and looks just the same.
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 2' }).click()
  await join.click()
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2'])
  expectColor(await designPixel(page, size, 60, 60), BLUE)
  expectColor(await designPixel(page, size, 140, 80), BLUE)
  expectColor(await designPixel(page, size, 270, 220), BLUE)
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])

  // Several picked (Shift+click) join together; Ctrl+E does the same as the button.
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 3' }).click()
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 1' }).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+e')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2'])
  expectColor(await designPixel(page, size, 60, 60), BLUE)
  expectColor(await designPixel(page, size, 270, 220), BLUE)

  // The bottom layer has nothing below it to join with.
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 2' }).click()
  await expect(join).toHaveAttribute('aria-disabled', 'true')
})
