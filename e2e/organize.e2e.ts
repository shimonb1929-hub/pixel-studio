import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, expectColor, expectPickedSize, newDesign, screenPoint, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const RED: [number, number, number] = [239, 68, 68]

const layerList = (page: Page) => page.getByRole('list', { name: 'Layer list' })
const layerNames = (page: Page) => layerList(page).getByRole('button', { name: /^Layer: / }).allTextContents()
const bar = (page: Page) => page.getByRole('toolbar')

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// Drags with Alt held, so nothing lines up by itself.
async function dragFreely(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.down('Alt')
  await drag(page, size, [from, to])
  await page.keyboard.up('Alt')
}

test('drag a box to pick several things and move them together', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  // A box from empty paper picks what it touches, and nothing else.
  await drag(page, size, [
    [20, 20],
    [130, 120],
  ])
  await expect(bar(page)).toContainText('2 things')
  await expectPickedSize(page, 120, 60)
  await expect(layerList(page).getByRole('button', { name: 'Layer: Rectangle 1' })).toHaveAttribute('aria-pressed', 'true')
  await expect(layerList(page).getByRole('button', { name: 'Layer: Rectangle 2' })).toHaveAttribute('aria-pressed', 'true')
  await expect(layerList(page).getByRole('button', { name: 'Layer: Rectangle 3' })).toHaveAttribute('aria-pressed', 'false')

  // Dragging one of them moves both, as one step.
  await dragFreely(page, size, [60, 60], [80, 160])
  expectColor(await designPixel(page, size, 62, 142), BLUE)
  expectColor(await designPixel(page, size, 58, 142), WHITE)
  expectColor(await designPixel(page, size, 142, 162), BLUE)
  expectColor(await designPixel(page, size, 60, 60), WHITE)
  expectColor(await designPixel(page, size, 270, 220), BLUE)
  expect(await undoLabel(page)).toContain('Undo move')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 60, 60), BLUE)
  expectColor(await designPixel(page, size, 140, 80), BLUE)

  // The arrow keys nudge them all.
  await page.keyboard.press('ArrowRight')
  expectColor(await designPixel(page, size, 40.5, 60), WHITE)
  expectColor(await designPixel(page, size, 120.5, 80), WHITE)
  expectColor(await designPixel(page, size, 80.5, 60), BLUE)

  // A click on empty paper lets go, and picks the page.
  await clickAt(page, size, 200, 280)
  await expect(page.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(bar(page)).not.toContainText('2 things')
})

test('Shift+click adds and takes away; Delete removes them all, and undo brings them back', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  await clickAt(page, size, 60, 60)
  await clickAt(page, size, 270, 220, ['Shift'])
  await expect(bar(page)).toContainText('2 things')
  await clickAt(page, size, 140, 80, ['Shift'])
  await expect(bar(page)).toContainText('3 things')
  await clickAt(page, size, 60, 60, ['Shift'])
  await expect(bar(page)).toContainText('2 things')
  // In the Layers panel too.
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 1' }).click({ modifiers: ['Shift'] })
  await expect(bar(page)).toContainText('3 things')

  await page.keyboard.press('Delete')
  expect(await layerNames(page)).toEqual([])
  expect(await undoLabel(page)).toContain('Undo delete')
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])
  expectColor(await designPixel(page, size, 60, 60), BLUE)
})

test('keep things together: they pick and move as one; double-click picks one part; take them apart', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  await drag(page, size, [
    [20, 20],
    [130, 120],
  ])
  await bar(page).getByRole('button', { name: 'Keep together' }).click()
  // One row in the Layers panel, folded.
  const group = layerList(page).getByRole('button', { name: 'Kept together: Rectangle 2 + Rectangle 1' })
  await expect(group).toBeVisible()
  expect(await layerNames(page)).toEqual(['Rectangle 3'])
  await expect(bar(page)).toContainText('Rectangle 2 + Rectangle 1')
  await expect(bar(page).getByRole('button', { name: 'Take apart' })).toBeVisible()

  // Clicking one part picks the whole thing.
  await clickAt(page, size, 200, 280)
  await clickAt(page, size, 60, 60)
  await expect(bar(page)).toContainText('Rectangle 2 + Rectangle 1')
  await expectPickedSize(page, 120, 60)
  await dragFreely(page, size, [140, 80], [140, 180])
  expectColor(await designPixel(page, size, 60, 160), BLUE)
  expectColor(await designPixel(page, size, 140, 180), BLUE)
  expectColor(await designPixel(page, size, 60, 60), WHITE)

  // A double-click picks just one part, which then moves on its own; the panel opens to show it.
  const one = await screenPoint(page, size, 60, 160)
  await page.mouse.dblclick(one.x, one.y)
  await expectPickedSize(page, 40, 40)
  await expect(layerList(page).getByRole('button', { name: 'Layer: Rectangle 1' })).toHaveAttribute('aria-pressed', 'true')
  await dragFreely(page, size, [60, 160], [60, 260])
  expectColor(await designPixel(page, size, 60, 260), BLUE)
  expectColor(await designPixel(page, size, 140, 180), BLUE)

  // Clicking the row in the panel picks it all again; Take apart lets the parts go.
  await group.click()
  await expect(bar(page)).toContainText('Rectangle 2 + Rectangle 1')
  await page.keyboard.press('Control+Shift+g')
  await expect(group).toHaveCount(0)
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 2', 'Rectangle 1'])
  // Still both picked, now as separate things.
  await expect(bar(page)).toContainText('2 things')
  await page.keyboard.press('Control+g')
  await expect(group).toBeVisible()
})

test('line things up and tidy them into a neat row', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [20, 100], [60, 140])
  await drawRectangle(page, size, [100, 120], [140, 160])
  await drawRectangle(page, size, [300, 90], [340, 130])
  await drag(page, size, [
    [10, 80],
    [350, 170],
  ])
  await expect(bar(page)).toContainText('3 things')

  // Tidy up: even gaps between them (x 20, 160, 300), lined up through their middles (y 105 to 145).
  await bar(page).getByRole('button', { name: 'Tidy up' }).click()
  for (const x of [20, 160, 300]) {
    expectColor(await designPixel(page, size, x + 1, 106), BLUE)
    expectColor(await designPixel(page, size, x + 1, 144), BLUE)
    expectColor(await designPixel(page, size, x + 1, 103), WHITE)
    expectColor(await designPixel(page, size, x - 2, 125), WHITE)
  }
  expect(await undoLabel(page)).toContain('Undo tidy up')

  // Line up their tops after moving one down on its own.
  await clickAt(page, size, 200, 280)
  await dragFreely(page, size, [180, 125], [180, 205])
  await drag(page, size, [
    [10, 80],
    [350, 240],
  ])
  await expect(bar(page)).toContainText('3 things')
  await bar(page).getByRole('button', { name: 'Line up' }).click()
  await page.getByRole('menuitem', { name: 'Line up tops' }).click()
  for (const x of [40, 180, 320]) {
    expectColor(await designPixel(page, size, x, 106), BLUE)
    expectColor(await designPixel(page, size, x, 103), WHITE)
  }

  // One thing on its own lines up with the page.
  await clickAt(page, size, 320, 125)
  await bar(page).getByRole('button', { name: 'Line up' }).click()
  await page.getByRole('menuitem', { name: 'Move to bottom' }).click()
  expectColor(await designPixel(page, size, 320, 298), BLUE)
  expectColor(await designPixel(page, size, 320, 125), WHITE)
})

test('the Color panel colors everything picked, and copies come out picked', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 40], [160, 80])
  await drag(page, size, [
    [20, 20],
    [180, 100],
  ])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expectColor(await designPixel(page, size, 60, 60), RED)
  expectColor(await designPixel(page, size, 140, 60), RED)

  await page.getByRole('region', { name: 'Layers' }).getByRole('button', { name: 'Duplicate', exact: true }).click()
  expect(await layerNames(page)).toEqual(['Rectangle 2 copy', 'Rectangle 1 copy', 'Rectangle 2', 'Rectangle 1'])
  await expect(bar(page)).toContainText('2 things')
  await dragFreely(page, size, [60, 60], [60, 160])
  expectColor(await designPixel(page, size, 60, 160), RED)
  expectColor(await designPixel(page, size, 140, 160), RED)
  expectColor(await designPixel(page, size, 60, 60), RED)
})

test('things kept together come back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drag(page, size, [
    [20, 20],
    [180, 120],
  ])
  await page.keyboard.press('Control+g')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  // The design takes a moment to close; opening the file before then would race it.
  await expect(page.getByRole('main').locator('canvas:not([data-preview])')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })

  await expect(layerList(page).getByRole('button', { name: 'Kept together: Rectangle 2 + Rectangle 1' })).toBeVisible()
  await page.keyboard.press('v')
  await clickAt(page, size, 60, 60)
  await expect(bar(page)).toContainText('Rectangle 2 + Rectangle 1')
})

test('several things grow and turn together from the frame around them', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 40], [160, 80])
  await drag(page, size, [
    [20, 20],
    [180, 100],
  ])
  await expectPickedSize(page, 120, 40)
  // Pulling the corner makes everything twice as big, gaps too; the opposite corner stays put.
  await dragFreely(page, size, [160, 80], [280, 120])
  await expectPickedSize(page, 240, 80)
  expectColor(await designPixel(page, size, 42, 42), BLUE)
  expectColor(await designPixel(page, size, 118, 118), BLUE)
  expectColor(await designPixel(page, size, 160, 80), WHITE)
  expectColor(await designPixel(page, size, 202, 42), BLUE)
  expectColor(await designPixel(page, size, 278, 118), BLUE)
  expect(await undoLabel(page)).toContain('Undo resize')

  // A quarter turn turns the whole arrangement: side by side becomes one above the other.
  await bar(page).getByRole('button', { name: 'Turn right' }).click()
  await expectPickedSize(page, 80, 240)
  // The frame turns around its middle (160, 80): it now runs from y -40 to 200 at x 120 to 200.
  expectColor(await designPixel(page, size, 160, 10), BLUE)
  expectColor(await designPixel(page, size, 160, 80), WHITE)
  expectColor(await designPixel(page, size, 160, 150), BLUE)
})

test('picked shapes become one shape: cut out a hole, undo, and only shapes can', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [50, 50], [200, 200])
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Oval' }).click()
  await drag(page, size, [
    [100, 100],
    [150, 150],
  ])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('v')
  await drag(page, size, [
    [20, 20],
    [230, 230],
  ])
  await expect(bar(page)).toContainText('2 things')

  // The oval on top cuts a hole in the square.
  await bar(page).getByRole('button', { name: 'Make one shape' }).click()
  await page.getByRole('menu', { name: 'Make one shape' }).getByRole('menuitem', { name: 'Cut out' }).click()
  expect(await layerNames(page)).toEqual(['Shape 1'])
  expect(await undoLabel(page)).toContain('Undo cut out shapes')
  expectColor(await designPixel(page, size, 125, 125), WHITE)
  expectColor(await designPixel(page, size, 70, 70), BLUE)
  // Once let go, a click in the hole picks nothing; a click on the shape picks it.
  await clickAt(page, size, 330, 260)
  await clickAt(page, size, 125, 125)
  await expect(page.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await clickAt(page, size, 70, 70)
  await expectPickedSize(page, 150, 150)

  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Oval 1', 'Rectangle 1'])
  expectColor(await designPixel(page, size, 125, 125), RED)

  // Lines can't be joined, and the menu says why.
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Line' }).click()
  await drag(page, size, [
    [250, 60],
    [350, 60],
  ])
  await page.keyboard.press('v')
  await drag(page, size, [
    [20, 20],
    [380, 230],
  ])
  await bar(page).getByRole('button', { name: 'Make one shape' }).click()
  const menu = page.getByRole('menu', { name: 'Make one shape' })
  await expect(menu.getByRole('note')).toContainText('Only shapes')
  await expect(menu.getByRole('menuitem', { name: 'Join' })).toBeDisabled()
  await page.keyboard.press('Escape')
})
