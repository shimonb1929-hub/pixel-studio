import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, expectDesignSize, INK, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]
const GREEN: [number, number, number] = [34, 197, 94]

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A solid rectangle of a color, made by selecting and filling, then deselecting.
async function block(page: Page, size: Size, x0: number, y0: number, x1: number, y1: number, color = 'Black') {
  await page.getByRole('button', { name: color, exact: true }).click()
  await page.keyboard.press('m')
  await drag(page, size, [
    [x0, y0],
    [x1, y1],
  ])
  await page.keyboard.press('Alt+Backspace')
  await page.keyboard.press('Escape')
}

const BLACK: [number, number, number] = [27, 29, 35]

test('Arrange: pull a corner to resize; it is kept when you let go', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 80, 120, 120, 160)
  await page.keyboard.press('v')
  await expect(page.getByRole('toolbar')).toContainText('40 × 40 px')
  // Drag the bottom-right corner out; the shape stays square.
  await drag(page, size, [
    [120, 160],
    [160, 200],
  ])
  await expect(page.getByRole('toolbar')).toContainText('80 × 80 px')
  expectColor(await designPixel(page, size, 150, 190), BLACK)
  expectColor(await designPixel(page, size, 85, 125), BLACK)
  expect(await undoLabel(page)).toContain('Undo resize')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 150, 190), WHITE)
  await expect(page.getByRole('toolbar')).toContainText('40 × 40 px')
})

test('resizing never loses quality: tiny, then big again, stays crisp', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 100, 100, 200, 200, 'Red')
  await block(page, size, 200, 100, 300, 200, 'Green')
  await page.keyboard.press('v')
  await expect(page.getByRole('toolbar')).toContainText('200 × 100 px')
  // Shrink it to almost nothing from its bottom-right corner, then pull it back out.
  await drag(page, size, [
    [300, 200],
    [110, 105],
  ])
  await expect(page.getByRole('toolbar')).toContainText('10 × 5 px')
  await drag(page, size, [
    [110, 105],
    [300, 200],
  ])
  await expect(page.getByRole('toolbar')).toContainText('200 × 100 px')
  // The edge between the colors is as sharp as it was, not a blur.
  expectColor(await designPixel(page, size, 197, 150), RED)
  expectColor(await designPixel(page, size, 203, 150), GREEN)
  expectColor(await designPixel(page, size, 102, 102), RED)
})

test('turn with the round handle; Shift turns in neat steps', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 100, 140, 300, 160)
  await page.keyboard.press('v')
  // The round handle sits 28 pixels above the top edge.
  await page.keyboard.down('Shift')
  await drag(page, size, [
    [200, 112],
    [330, 155],
  ])
  await page.keyboard.up('Shift')
  await expect(page.getByRole('toolbar')).toContainText('90°')
  expectColor(await designPixel(page, size, 200, 230), BLACK)
  expectColor(await designPixel(page, size, 280, 150), WHITE)
  expect(await undoLabel(page)).toContain('Undo rotate')
})

test('flip and quarter turns happen at once, and undo takes them back', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 80, 130, 120, 170, 'Red')
  await block(page, size, 180, 130, 220, 170, 'Green')
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Flip left to right' }).click()
  expectColor(await designPixel(page, size, 100, 150), GREEN)
  expectColor(await designPixel(page, size, 200, 150), RED)
  expect(await undoLabel(page)).toContain('Undo flip left to right')

  await page.getByRole('button', { name: 'Turn right' }).click()
  await expect(page.getByRole('toolbar')).toContainText('90°')
  expectColor(await designPixel(page, size, 150, 100), GREEN)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('toolbar')).toContainText('0°')
  expectColor(await designPixel(page, size, 100, 150), GREEN)
})

test('resizing a selected part leaves the rest alone', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 80, 130, 120, 170, 'Red')
  await block(page, size, 280, 130, 320, 170, 'Green')
  await page.keyboard.press('m')
  await drag(page, size, [
    [60, 110],
    [140, 190],
  ])
  await page.keyboard.press('v')
  await expect(page.getByRole('toolbar')).toContainText('80 × 80 px')
  await drag(page, size, [
    [100, 150],
    [100, 60],
  ])
  await page.keyboard.press('b')
  expectColor(await designPixel(page, size, 100, 60), RED)
  expectColor(await designPixel(page, size, 100, 150), WHITE)
  expectColor(await designPixel(page, size, 300, 150), GREEN)
  expect(await undoLabel(page)).toContain('Undo move')
})

test('Arrange explains when there is nothing to pick on the layer', async ({ page }) => {
  await newDesign(page)
  await page.keyboard.press('v')
  await expect(page.getByRole('toolbar')).toContainText('There is nothing on “Layer 1” yet')
})

test('crop keeps what is inside the frame, and undo brings everything back', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 330, 130, 370, 170, 'Red')
  await page.keyboard.press('c')
  // Pull the right edge in by 100 pixels.
  await drag(page, size, [
    [400, 150],
    [300, 150],
  ])
  await expect(page.getByRole('toolbar')).toContainText('300 × 300 px')
  await page.keyboard.press('Enter')
  await expectDesignSize(page, 300, 300)
  await page.keyboard.press('Control+z')
  await expectDesignSize(page, 400, 300)
  expectColor(await designPixel(page, size, 350, 150), RED)
})

test('Enter right after a drag applies the frame on screen, not the step before', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('c')
  // Press Enter the moment the new size appears, before anything else gets a chance to run.
  await page.getByRole('toolbar').evaluate((toolbar) => {
    const observer = new MutationObserver(() => {
      if (!toolbar.textContent?.includes('300 × 300 px')) return
      observer.disconnect()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    })
    observer.observe(toolbar, { subtree: true, childList: true, characterData: true })
  })
  await drag(page, size, [
    [400, 150],
    [300, 150],
  ])
  await expectDesignSize(page, 300, 300)
})

test('cropping from the left moves the design so the kept part stays put', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 330, 130, 370, 170, 'Red')
  await page.keyboard.press('c')
  await drag(page, size, [
    [0, 150],
    [200, 150],
  ])
  await page.getByRole('button', { name: 'Crop', exact: true }).last().click()
  // The design is now 200 wide; the red square is 150 pixels in from its new left edge.
  const cropped = { width: 200, height: 300 }
  await expectDesignSize(page, 200, 300)
  await page.keyboard.press('Control+0')
  await page.keyboard.press('Control+Alt+0')
  expectColor(await designPixel(page, cropped, 150, 150), RED)
})

test('crop shapes and crop to selection', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('c')
  await page.getByRole('radio', { name: 'Square' }).click()
  await expect(page.getByRole('toolbar')).toContainText('300 × 300 px')
  await page.keyboard.press('Escape')
  await page.keyboard.press('m')
  await drag(page, size, [
    [50, 50],
    [150, 100],
  ])
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Crop to selection' }).click()
  await expectDesignSize(page, 100, 50)
})

test('resize the whole design', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 200, 150, 240, 190, 'Red')
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('resize design')
  await page.getByRole('combobox').press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Resize design' })
  await dialog.getByLabel('New width in pixels').fill('200')
  await expect(dialog.getByLabel('New height in pixels')).toHaveValue('150')
  await expect(dialog).toContainText('Making a design smaller keeps it sharp')
  await dialog.getByRole('button', { name: 'Resize' }).click()
  await expectDesignSize(page, 200, 150)
  await page.keyboard.press('Control+Alt+0')
  expectColor(await designPixel(page, { width: 200, height: 150 }, 110, 85), RED)

  // Back to the old size, every edge is as crisp as before: nothing was thrown away.
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('resize design')
  await page.getByRole('combobox').press('Enter')
  await dialog.getByLabel('New width in pixels').fill('400')
  await dialog.getByRole('button', { name: 'Resize' }).click()
  await expectDesignSize(page, 400, 300)
  await page.keyboard.press('Control+Alt+0')
  expectColor(await designPixel(page, size, 201, 151), RED)
  expectColor(await designPixel(page, size, 239, 189), RED)
  expectColor(await designPixel(page, size, 199, 149), WHITE)
  expectColor(await designPixel(page, size, 241, 191), WHITE)
})

test('turn and flip the whole design', async ({ page }) => {
  await block(page, await newDesign(page), 330, 130, 370, 170, 'Red')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Turn design right' }).click()
  await expectDesignSize(page, 300, 400)
  await page.keyboard.press('Control+Alt+0')
  const turned = { width: 300, height: 400 }
  // A point at (350, 150) lands at (300 − 150, 350) after a quarter turn to the right.
  expectColor(await designPixel(page, turned, 150, 350), RED)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Flip design upside down' }).click()
  expectColor(await designPixel(page, turned, 150, 50), RED)
  expectColor(await designPixel(page, turned, 150, 350), WHITE)
})

test('the fill bucket colors inside an outline', async ({ page }) => {
  const size = await newDesign(page)
  // A closed box drawn with straight lines.
  await clickAt(page, size, 100, 100)
  for (const [x, y] of [
    [300, 100],
    [300, 200],
    [100, 200],
    [100, 100],
  ]) {
    await clickAt(page, size, x, y, ['Shift'])
  }
  await page.keyboard.press('g')
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await clickAt(page, size, 200, 150)
  expectColor(await designPixel(page, size, 200, 150), RED)
  expectColor(await designPixel(page, size, 50, 50), WHITE)
  expectColor(await designPixel(page, size, 200, 100), INK, 30)
  expect(await undoLabel(page)).toContain('Undo fill area')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 150), WHITE)
})

test('the fill bucket stays inside the selection', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('m')
  await drag(page, size, [
    [0, 0],
    [200, 300],
  ])
  await page.keyboard.press('g')
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await clickAt(page, size, 100, 150)
  expectColor(await designPixel(page, size, 100, 150), GREEN)
  expectColor(await designPixel(page, size, 300, 150), WHITE)
})

test('arrange, crop, shape and fill settings fit on common laptop screens', async ({ page }) => {
  const size = await newDesign(page)
  await block(page, size, 80, 120, 120, 160)
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    for (const tool of ['Arrange tool', 'Crop tool', 'Shapes tool', 'Fill bucket tool']) {
      await page.getByRole('button', { name: tool }).click()
      const { scroll, client } = await page.getByRole('toolbar').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      expect(scroll, `${tool} settings at ${width}px wide`).toBeLessThanOrEqual(client)
    }
  }
})
