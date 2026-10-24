import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, INK, newDesign, WHITE, type Size, pickBrush } from './helpers.ts'
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
  await pickBrush(page, 'Marker')
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
  await pickBrush(page, 'Marker')
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

test('Arrange moves a layer, and nothing is lost off the edge', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 50, 150)
  expectColor(await designPixel(page, size, 50, 150), INK)
  await page.keyboard.press('v')
  // Far past the right edge, then all the way back.
  await drag(page, size, [
    [50, 150],
    [500, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), WHITE)
  await drag(page, size, [
    [500, 150],
    [50, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), INK)
  expect(await undoLabel(page)).toContain('Undo move')
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
  await paintDot(page, size, 100, 150)
  await page.keyboard.press('v')
  await drag(page, size, [
    [100, 150],
    [250, 150],
  ])
  await page.keyboard.press('b')
  await drag(page, size, [
    [20, 150],
    [80, 150],
  ])
  expectColor(await designPixel(page, size, 50, 150), INK)
  expectColor(await designPixel(page, size, 250, 150), INK)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 50, 150), WHITE)
  expectColor(await designPixel(page, size, 250, 150), INK)
  expect(await undoLabel(page)).toContain('Undo move')
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
  expect(await names()).toEqual(['Pasted', 'Drawing 1'])
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  // The pasted copy lands where it came from; move it to prove it's separate.
  await drag(page, size, [
    [100, 150],
    [250, 150],
  ])
  expectColor(await designPixel(page, size, 250, 150), INK)
  expectColor(await designPixel(page, size, 100, 150), INK)

  await page.getByRole('button', { name: 'Layer: Drawing 1' }).click()
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+j')
  expect(await names()).toEqual(['Pasted', 'Drawing 1 copy', 'Drawing 1'])
})

test('cut removes the selected part and remembers it', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 100, 150)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+x')
  expectColor(await designPixel(page, size, 100, 150), WHITE)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('paste')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  expectColor(await designPixel(page, size, 100, 150), INK)
})

test('copying an empty area explains why nothing happened', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 70, 120, 130, 180)
  await page.keyboard.press('Control+c')
  await expect(page.getByRole('alert')).toContainText('Pick a drawing or photo')
  await page.getByRole('button', { name: 'New layer', exact: true }).click()
  await page.keyboard.press('Control+c')
  await expect(page.getByRole('alert')).toContainText('nothing in the selected area')
})

test('arranging a hidden layer explains what to do', async ({ page }) => {
  const size = await newDesign(page)
  await paintDot(page, size, 200, 150)
  await page.getByRole('button', { name: 'Hide Drawing 1' }).click()
  await page.keyboard.press('v')
  await expect(page.getByRole('toolbar')).toContainText('“Drawing 1” is hidden')
  // Clicking where it is (hidden, so nothing is there) picks the page.
  await clickAt(page, size, 200, 150)
  await expect(page.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('selection and arrange settings fit on common laptop screens', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    for (const tool of ['Select tool', 'Arrange tool']) {
      await page.getByRole('button', { name: tool }).click()
      const { scroll, client } = await page.getByRole('toolbar').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      expect(scroll, `${tool} settings at ${width}px wide`).toBeLessThanOrEqual(client)
    }
  }
})

// The overlay (the top canvas) at a design point: where the selection tint and line are drawn.
function overlayPixel(page: Page, size: Size, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([w, h, px, py]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvases = main.querySelectorAll('canvas')
      const canvas = canvases[1]
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return Array.from(canvas.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data)
    },
    [size.width, size.height, x, y],
  )
}

test('a selection shows calmly, and the selection bar adds, takes away and lets go', async ({ page }) => {
  const size = await newDesign(page)
  await selectRect(page, size, 100, 100, 300, 200)
  const bar = page.getByRole('group', { name: 'Part selected' })
  await expect(bar).toBeVisible()

  // A soft blue tint over the selected part, nothing outside it, and nothing that moves.
  const inside = await overlayPixel(page, size, 200, 150)
  expect(inside[3]).toBeGreaterThan(20)
  expect(inside[2]).toBeGreaterThan(inside[0])
  expect((await overlayPixel(page, size, 50, 50))[3]).toBe(0)
  const edge = await overlayPixel(page, size, 100, 150)
  await page.waitForTimeout(400)
  expect(await overlayPixel(page, size, 100, 150)).toEqual(edge)

  // Add more, from another tool: it switches to Select and the next drag adds.
  await page.keyboard.press('b')
  await bar.getByRole('button', { name: 'Add more' }).click()
  await expect(bar.getByRole('button', { name: 'Add more' })).toHaveAttribute('aria-pressed', 'true')
  await drag(page, size, [
    [20, 20],
    [60, 60],
  ])
  expect(await undoLabel(page)).toContain('Undo add to selection')
  expect((await overlayPixel(page, size, 40, 40))[3]).toBeGreaterThan(20)

  // Take away a piece from the middle.
  await bar.getByRole('button', { name: 'Take away' }).click()
  await drag(page, size, [
    [180, 130],
    [220, 170],
  ])
  expect(await undoLabel(page)).toContain('Undo remove from selection')
  expect((await overlayPixel(page, size, 200, 150))[3]).toBe(0)

  // Let go clears it, and the next drag starts a fresh selection again.
  await bar.getByRole('button', { name: 'Let go' }).click()
  await expect(bar).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'New' })).toHaveAttribute('aria-checked', 'true')
})

test('with Arrange, a click away from the selected part lets go of the selection', async ({ page }) => {
  const size = await newDesign(page)
  await paintLine(page, size)
  await selectRect(page, size, 150, 100, 250, 200)
  await page.keyboard.press('v')
  await clickAt(page, size, 50, 50)
  await expect(page.getByRole('group', { name: 'Part selected' })).toHaveCount(0)
  // Nothing moved.
  expectColor(await designPixel(page, size, 200, 150), INK)
})
