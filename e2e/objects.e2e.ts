import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, expectColor, INK, newDesign, screenPoint, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const RED: [number, number, number] = [239, 68, 68]
const GREEN: [number, number, number] = [34, 197, 94]

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const shapePanel = (page: Page) => page.getByRole('region', { name: 'Shape' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A 200 × 100 photo: red on the left, green on the right, with a thin blue band along the top.
async function photo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(200, 100)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(100, 0, 100, 100)
    ctx.fillStyle = '#3b5bfd'
    ctx.fillRect(0, 0, 200, 10)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  return Buffer.from(base64, 'base64')
}

async function addPhoto(page: Page, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'beach.png', mimeType: 'image/png', buffer })
  await expect(page.getByRole('button', { name: 'Layer: beach' })).toBeVisible()
}

// Drops a picture file onto a point of the design, as if dragged there from the computer.
async function dropPhoto(page: Page, size: Size, x: number, y: number, buffer: Buffer) {
  const point = await screenPoint(page, size, x, y)
  await page.evaluate(
    ([data, clientX, clientY]) => {
      const bytes = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'beach.png', { type: 'image/png' }))
      const target = document.querySelector('main')!
      for (const type of ['dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: clientX as number, clientY: clientY as number }))
      }
    },
    [buffer.toString('base64'), point.x, point.y] as const,
  )
}

async function drawShape(page: Page, size: Size, type: string, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: type }).click()
  await drag(page, size, [from, to])
}

test('draw a shape, then color it, outline it and empty it', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await expect(page.getByRole('button', { name: 'Shapes tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(shapePanel(page)).toContainText('New shapes')
  await drag(page, size, [
    [100, 100],
    [200, 180],
  ])
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Layer 1', 'Background'])
  // Right away it can be moved and resized.
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('toolbar')).toContainText('100 × 80 px')
  expectColor(await designPixel(page, size, 150, 140), BLUE)
  expectColor(await designPixel(page, size, 95, 140), WHITE)
  expect(await undoLabel(page)).toContain('Undo draw rectangle')

  // The Color panel colors the picked shape.
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expectColor(await designPixel(page, size, 150, 140), RED)
  await shapePanel(page).getByRole('button', { name: 'Outline color' }).click()
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  expectColor(await designPixel(page, size, 100, 140), GREEN)
  expectColor(await designPixel(page, size, 150, 140), RED)
  await shapePanel(page).getByRole('button', { name: 'Fill color' }).click()
  await shapePanel(page).getByRole('button', { name: 'No fill' }).click()
  expectColor(await designPixel(page, size, 150, 140), WHITE)
  expectColor(await designPixel(page, size, 100, 140), GREEN)
  expect(await undoLabel(page)).toContain('Undo no fill')

  // Shapes can't be painted on, and say why.
  await page.keyboard.press('b')
  await drag(page, size, [
    [120, 140],
    [180, 140],
  ])
  await expect(page.getByRole('alert')).toContainText('is a shape')
})

test('stars, polygons and lines with arrow heads', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Star' }).click()
  // A click drops a shape of a handy size.
  await clickAt(page, size, 200, 150)
  expect(await layerNames(page)).toEqual(['Star 1', 'Layer 1', 'Background'])
  await expect(page.getByRole('toolbar')).toContainText('75 × 75 px')
  expectColor(await designPixel(page, size, 200, 150), BLUE)
  expectColor(await designPixel(page, size, 165, 115), WHITE)
  const points = shapePanel(page).getByRole('slider', { name: 'Points' })
  await points.focus()
  await page.keyboard.press('End')
  await expect(points).toHaveAttribute('aria-valuetext', '12')
  expect(await undoLabel(page)).toContain('Undo change sides')

  await drawShape(page, size, 'Line', [40, 250], [360, 250])
  expect((await layerNames(page))[0]).toBe('Line 1')
  expectColor(await designPixel(page, size, 200, 250), INK)
  expectColor(await designPixel(page, size, 200, 262), WHITE)
  expectColor(await designPixel(page, size, 340, 260), WHITE)
  await shapePanel(page).getByRole('button', { name: 'Arrow head' }).click()
  expectColor(await designPixel(page, size, 340, 260), INK)
  await expect(shapePanel(page).getByRole('button', { name: 'Arrow head' })).toHaveAttribute('aria-pressed', 'true')
})

test('shapes stay sharp when resized, and Delete removes the picked one', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Oval', [190, 140], [210, 160])
  await expect(page.getByRole('toolbar')).toContainText('20 × 20 px')
  // Pull the corner far out: a circle 280 pixels across, with a clean edge.
  await drag(page, size, [
    [210, 160],
    [330, 280],
  ])
  await expect(page.getByRole('toolbar')).toContainText('140 × 140 px')
  await drag(page, size, [
    [330, 280],
    [470, 420],
  ])
  await expect(page.getByRole('toolbar')).toContainText('280 × 280 px')
  expectColor(await designPixel(page, size, 330, 280), BLUE)
  // The top of the circle: solid just inside, nothing just outside.
  expectColor(await designPixel(page, size, 330, 141), BLUE)
  expectColor(await designPixel(page, size, 330, 139), WHITE)

  await page.keyboard.press('Delete')
  expect(await layerNames(page)).toEqual(['Layer 1', 'Background'])
  expectColor(await designPixel(page, size, 330, 280), WHITE)
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Oval 1', 'Layer 1', 'Background'])
})

test('the background is locked, and any layer can be locked so it stays put', async ({ page }) => {
  const size = await newDesign(page)
  await expect(page.getByRole('button', { name: 'Unlock Background' })).toBeVisible()
  await page.keyboard.press('v')
  // Dragging the paper doesn't move it, and explains why.
  await drag(page, size, [
    [300, 250],
    [350, 280],
  ])
  await expect(page.getByRole('alert')).toContainText('"Background" is locked')

  await drawShape(page, size, 'Rectangle', [100, 100], [200, 200])
  await page.getByRole('button', { name: 'Lock Rectangle 1' }).click()
  await expect(page.getByRole('toolbar')).toContainText('“Rectangle 1” is locked')
  await drag(page, size, [
    [150, 150],
    [300, 150],
  ])
  expectColor(await designPixel(page, size, 150, 150), BLUE)
  expectColor(await designPixel(page, size, 300, 150), WHITE)
  // Unlocking from the settings bar lets it move again.
  await page.getByRole('toolbar').getByRole('button', { name: 'Unlock' }).click()
  await drag(page, size, [
    [150, 150],
    [300, 150],
  ])
  expectColor(await designPixel(page, size, 300, 150), BLUE)
  expectColor(await designPixel(page, size, 120, 150), WHITE)
})

test('a photo added to a design keeps all its detail, however it is resized', async ({ page }) => {
  const size = await newDesign(page)
  await addPhoto(page, await photo(page))
  expect(await layerNames(page)).toEqual(['beach', 'Layer 1', 'Background'])
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('toolbar')).toContainText('200 × 100 px')
  expectColor(await designPixel(page, size, 150, 150), RED)
  expectColor(await designPixel(page, size, 250, 150), GREEN)

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
  expectColor(await designPixel(page, size, 197, 150), RED)
  expectColor(await designPixel(page, size, 203, 150), GREEN)
  expectColor(await designPixel(page, size, 200, 104), BLUE)
})

test('drop a photo onto a shape to fill it, then zoom and slide it inside', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Oval', [100, 50], [300, 250])
  await dropPhoto(page, size, 200, 150, await photo(page))
  await expect(page.getByRole('status').filter({ hasText: 'The photo fills the shape' })).toBeVisible()
  expect(await layerNames(page)).toEqual(['Oval 1', 'Layer 1', 'Background'])
  expect(await undoLabel(page)).toContain('Undo put photo in shape')
  // The photo covers the circle, and nothing shows outside it.
  expectColor(await designPixel(page, size, 150, 150), RED)
  expectColor(await designPixel(page, size, 250, 150), GREEN)
  expectColor(await designPixel(page, size, 190, 60), BLUE)
  expectColor(await designPixel(page, size, 105, 55), WHITE)

  const zoom = shapePanel(page).getByRole('slider', { name: 'Photo size' })
  await zoom.focus()
  await page.keyboard.press('End')
  await expect(zoom).toHaveAttribute('aria-valuetext', '400%')
  // Bigger, so the blue band along the top is now out of sight.
  expectColor(await designPixel(page, size, 190, 60), RED)

  await shapePanel(page).getByRole('button', { name: 'Move photo', exact: true }).click()
  await drag(page, size, [
    [200, 150],
    [260, 150],
  ])
  expectColor(await designPixel(page, size, 230, 150), RED)
  expect(await undoLabel(page)).toContain('Undo move photo')
  await expect(page.getByRole('toolbar')).toContainText('200 × 200 px')

  await shapePanel(page).getByRole('button', { name: 'Remove photo' }).click()
  expectColor(await designPixel(page, size, 150, 150), BLUE)
})

test('a picture dropped next to the shapes becomes a layer of its own, where it was dropped', async ({ page }) => {
  const size = await newDesign(page)
  await dropPhoto(page, size, 150, 100, await photo(page))
  expect(await layerNames(page)).toEqual(['beach', 'Layer 1', 'Background'])
  expectColor(await designPixel(page, size, 100, 120), RED)
  expectColor(await designPixel(page, size, 200, 120), GREEN)
})

test('shapes, photos in shapes and resized photos come back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  const picture = await photo(page)
  await drawShape(page, size, 'Rectangle', [20, 20], [80, 80])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drawShape(page, size, 'Oval', [100, 50], [300, 250])
  await dropPhoto(page, size, 200, 150, picture)
  await expect(page.getByRole('status').filter({ hasText: 'The photo fills the shape' })).toBeVisible()
  await addPhoto(page, picture)
  // Shrink the photo to a speck: the project still keeps every pixel of it.
  await drag(page, size, [
    [300, 200],
    [110, 105],
  ])
  await expect(page.getByRole('toolbar')).toContainText('10 × 5 px')

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

  await expect(page.locator('header')).toContainText('My design 1')
  expect(await layerNames(page)).toEqual(['beach', 'Oval 1', 'Rectangle 1', 'Layer 1', 'Background'])
  expectColor(await designPixel(page, size, 50, 50), RED)
  expectColor(await designPixel(page, size, 150, 150), RED)
  expectColor(await designPixel(page, size, 250, 150), GREEN)
  expectColor(await designPixel(page, size, 105, 55), WHITE)

  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Layer: beach' }).click()
  await expect(page.getByRole('toolbar')).toContainText('10 × 5 px')
  await drag(page, size, [
    [110, 105],
    [300, 200],
  ])
  expectColor(await designPixel(page, size, 197, 150), RED)
  expectColor(await designPixel(page, size, 203, 150), GREEN)
})
