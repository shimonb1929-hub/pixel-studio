import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, INK, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]
const GREEN: [number, number, number] = [34, 197, 94]

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A thick horizontal line across the middle of the design.
async function paintLine(page: Page, size: Size, y = 150) {
  await page.getByRole('radio', { name: 'Marker' }).click()
  await page.getByLabel('Opacity', { exact: true }).focus()
  await page.keyboard.press('End')
  await drag(page, size, [
    [20, y],
    [380, y],
  ])
}

// A solid dot, made with a big hard brush.
async function paintDot(page: Page, size: Size, x: number, y: number) {
  await page.keyboard.press('b')
  await page.getByRole('radio', { name: 'Marker' }).click()
  await page.getByLabel('Opacity', { exact: true }).focus()
  await page.keyboard.press('End')
  await clickAt(page, size, x, y)
}

async function selectRect(page: Page, size: Size, x0: number, y0: number, x1: number, y1: number) {
  await page.keyboard.press('m')
  await drag(page, size, [
    [x0, y0],
    [x1, y1],
  ])
}

test('painting stays inside a rectangle selection', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 100, 100, 300, 200)
  expect(await undoLabel(page)).toContain('Undo select rectangle')
  await page.keyboard.press('b')
  await expect(page.getByRole('status').first()).toContainText('Only the selected area changes.')
  await drag(page, size, [
    [20, 150],
    [380, 150],
  ])
  expectColor(await designPixel(page, size, 200, 150), INK)
  expectColor(await designPixel(page, size, 50, 150), WHITE)
  expectColor(await designPixel(page, size, 350, 150), WHITE)
})

test('Delete removes the selected area, and Escape clears the selection', async ({ page }) => {
  const size = await newDesign(page)
  await paintLine(page, size)
  await selectRect(page, size, 150, 100, 250, 200)
  await page.keyboard.press('Delete')
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  expectColor(await designPixel(page, size, 100, 150), INK)
  expect(await undoLabel(page)).toContain('Undo delete selected area')
  await page.keyboard.press('Escape')
  expect(await undoLabel(page)).toContain('Undo deselect')
  // With nothing selected, Delete does nothing rather than surprising anyone.
  await page.keyboard.press('Delete')
  expectColor(await designPixel(page, size, 100, 150), INK)
})

test('oval and freehand selections fill only their shape', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('m')
  await page.getByRole('radio', { name: 'Oval' }).click()
  await drag(page, size, [
    [100, 50],
    [300, 250],
  ])
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 200, 150), RED)
  // The corner of the oval's box is outside the oval.
  expectColor(await designPixel(page, size, 110, 60), WHITE)

  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await page.getByRole('radio', { name: 'Freehand' }).click()
  await drag(page, size, [
    [20, 20],
    [90, 20],
    [20, 90],
  ])
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 35, 35), GREEN)
  expectColor(await designPixel(page, size, 80, 80), WHITE)
})

test('adding to and taking away from a selection', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 50, 50, 150, 150)
  // Shift adds another rectangle; Alt takes a piece away.
  await page.keyboard.down('Shift')
  await drag(page, size, [
    [250, 50],
    [350, 150],
  ])
  await page.keyboard.up('Shift')
  await page.getByRole('radio', { name: 'Take away' }).click()
  await drag(page, size, [
    [40, 90],
    [160, 160],
  ])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 100, 70), RED)
  expectColor(await designPixel(page, size, 100, 120), WHITE)
  expectColor(await designPixel(page, size, 300, 120), RED)
  expectColor(await designPixel(page, size, 200, 100), WHITE)
})

test('select all and invert', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 5, 5), GREEN)
  expectColor(await designPixel(page, size, 395, 295), GREEN)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')

  await selectRect(page, size, 100, 100, 300, 200)
  await page.getByRole('button', { name: 'Invert selection' }).click()
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  expectColor(await designPixel(page, size, 50, 50), GREEN)
})

test('dragging inside a selection moves its outline', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 100, 100, 200, 200)
  await drag(page, size, [
    [150, 150],
    [250, 150],
  ])
  expect(await undoLabel(page)).toContain('Undo move selection outline')
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('Alt+Backspace')
  expectColor(await designPixel(page, size, 250, 150), RED)
  expectColor(await designPixel(page, size, 120, 150), WHITE)
})

test('the Move tool moves a layer, and nothing is lost off the edge', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 50, 150)
  expectColor(await designPixel(page, size, 50, 150), INK)
  await page.keyboard.press('v')
  // Far past the right edge, then all the way back.
  await drag(page, size, [
    [200, 150],
    [650, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), WHITE)
  await drag(page, size, [
    [600, 150],
    [150, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), INK)
  expect(await undoLabel(page)).toContain('Undo move layer')
})

test('moving a selected area moves only that part', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 100, 150)
  await paintDot(page, size, 300, 150)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('v')
  await drag(page, size, [
    [100, 150],
    [100, 250],
  ])
  expectColor(await designPixel(page, size, 100, 250), INK)
  expectColor(await designPixel(page, size, 100, 150), WHITE)
  expectColor(await designPixel(page, size, 300, 150), INK)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 100, 150), INK)
  expectColor(await designPixel(page, size, 100, 250), WHITE)
})

test('arrow keys nudge, and a run of nudges is one undo step', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 100, 150)
  await page.keyboard.press('v')
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
  // The dot is about 28 pixels wide; its middle moved from 100 to 140.
  expectColor(await designPixel(page, size, 140, 150), INK)
  expectColor(await designPixel(page, size, 100, 150), WHITE)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 100, 150), INK)
  expectColor(await designPixel(page, size, 140, 150), WHITE)
})

test('Center puts things in the middle of the design', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 50, 50)
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Center on design' }).click()
  expectColor(await designPixel(page, size, 200, 150), INK)
  expectColor(await designPixel(page, size, 50, 50), WHITE)
})

test('painting a moved layer still reaches every part of the design', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('v')
  await drag(page, size, [
    [200, 150],
    [350, 150],
  ])
  await page.keyboard.press('b')
  await drag(page, size, [
    [20, 150],
    [100, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), INK)
  // Painting and making room for it count as one step.
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 50, 150), WHITE)
  expect(await undoLabel(page)).toContain('Undo move layer')
})

test('copy, paste and copy to new layer', async ({ page }) => {
  const size = await newDesign(page)
  const names = () => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
  await paintDot(page, size, 100, 150)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+c')
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Paste' }).click()
  expect(await names()).toEqual(['Pasted', 'Layer 1', 'Background'])
  await expect(page.getByRole('button', { name: 'Move tool' })).toHaveAttribute('aria-pressed', 'true')
  // The pasted copy lands where it came from; move it to prove it's separate.
  await drag(page, size, [
    [100, 150],
    [250, 150],
  ])
  expectColor(await designPixel(page, size, 250, 150), INK)
  expectColor(await designPixel(page, size, 100, 150), INK)

  await page.getByRole('button', { name: 'Layer: Layer 1' }).click()
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+j')
  expect(await names()).toEqual(['Pasted', 'Layer 1 copy', 'Layer 1', 'Background'])
})

test('cut removes the selected part and remembers it', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 100, 150)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+x')
  expectColor(await designPixel(page, size, 100, 150), WHITE)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('paste')
  await page.getByRole('combobox').press('Enter')
  expectColor(await designPixel(page, size, 100, 150), INK)
})

test('copying an empty area explains why nothing happened', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+c')
  await expect(page.getByRole('alert')).toContainText('nothing in the selected area')
})

test('moving a hidden layer explains what to do', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Hide Layer 1' }).click()
  await page.keyboard.press('v')
  await drag(page, size, [
    [200, 150],
    [250, 150],
  ])
  await expect(page.getByRole('alert')).toContainText('"Layer 1" is hidden')
})

test('selection and move settings fit on common laptop screens', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    for (const tool of ['Select tool', 'Move tool']) {
      await page.getByRole('button', { name: tool }).click()
      const { scroll, client } = await page.getByRole('toolbar').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      expect(scroll, `${tool} settings at ${width}px wide`).toBeLessThanOrEqual(client)
    }
  }
})
