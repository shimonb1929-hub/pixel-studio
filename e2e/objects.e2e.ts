import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, expectColor, expectPickedSize, INK, newDesign, screenPoint, WHITE, type Size } from './helpers.ts'
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
  await page.getByRole('radio', { name: type, exact: true }).click()
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
  expect(await layerNames(page)).toEqual(['Rectangle 1'])
  // Right away it can be moved and resized.
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  await expectPickedSize(page, 100, 80)
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

  // Painting over a shape goes on a new drawing above it; the shape stays a shape.
  await page.keyboard.press('b')
  await drag(page, size, [
    [120, 140],
    [180, 140],
  ])
  expect(await layerNames(page)).toEqual(['Drawing 1', 'Rectangle 1'])
  expectColor(await designPixel(page, size, 150, 140), INK)
  expect(await undoLabel(page)).toContain('Undo brush stroke')
})

test('stars, polygons and lines with arrow heads', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Star' }).click()
  // A click drops a shape of a handy size.
  await clickAt(page, size, 200, 150)
  expect(await layerNames(page)).toEqual(['Star 1'])
  await expectPickedSize(page, 75, 75)
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
  await expectPickedSize(page, 20, 20)
  // Pull the corner far out: a circle 280 pixels across, with a clean edge.
  await drag(page, size, [
    [210, 160],
    [330, 280],
  ])
  await expectPickedSize(page, 140, 140)
  await drag(page, size, [
    [330, 280],
    [470, 420],
  ])
  await expectPickedSize(page, 280, 280)
  expectColor(await designPixel(page, size, 330, 280), BLUE)
  // The top of the circle: solid just inside, nothing just outside.
  expectColor(await designPixel(page, size, 330, 141), BLUE)
  expectColor(await designPixel(page, size, 330, 139), WHITE)

  await page.keyboard.press('Delete')
  expect(await layerNames(page)).toEqual([])
  expectColor(await designPixel(page, size, 330, 280), WHITE)
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Oval 1'])
})

test('click empty paper to pick the page and color it; the page can be see-through', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Rectangle', [100, 100], [200, 200])
  await clickAt(page, size, 300, 250)
  await expect(page.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('toolbar')).toContainText('The page is picked')
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expectColor(await designPixel(page, size, 300, 250), RED)
  expectColor(await designPixel(page, size, 150, 150), BLUE)
  expect(await undoLabel(page)).toContain('Undo page color')

  await page.getByRole('button', { name: 'See-through page' }).click()
  await expect(page.getByRole('button', { name: 'See-through page' })).toHaveAttribute('aria-pressed', 'true')
  const seeThrough = await designPixel(page, size, 300, 250)
  expect(seeThrough[0] - seeThrough[1], 'no longer red').toBeLessThan(20)

  // The fill bucket on empty paper colors the page too.
  await page.keyboard.press('g')
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await clickAt(page, size, 300, 250)
  expectColor(await designPixel(page, size, 300, 250), GREEN)
  expectColor(await designPixel(page, size, 20, 20), GREEN)
  expect(await layerNames(page)).toEqual(['Rectangle 1'])
})

test('any layer can be locked so it stays put', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('v')
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
  expect(await layerNames(page)).toEqual(['beach'])
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  await expectPickedSize(page, 200, 100)
  expectColor(await designPixel(page, size, 150, 150), RED)
  expectColor(await designPixel(page, size, 250, 150), GREEN)

  await drag(page, size, [
    [300, 200],
    [110, 105],
  ])
  await expectPickedSize(page, 10, 5)
  await drag(page, size, [
    [110, 105],
    [300, 200],
  ])
  await expectPickedSize(page, 200, 100)
  expectColor(await designPixel(page, size, 197, 150), RED)
  expectColor(await designPixel(page, size, 203, 150), GREEN)
  expectColor(await designPixel(page, size, 200, 104), BLUE)
})

test('drop a photo onto a shape to fill it, then zoom and slide it inside', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Oval', [100, 50], [300, 250])
  await dropPhoto(page, size, 200, 150, await photo(page))
  await expect(page.getByRole('status').filter({ hasText: 'The photo fills the shape' })).toBeVisible()
  expect(await layerNames(page)).toEqual(['Oval 1'])
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
  await expectPickedSize(page, 200, 200)

  await shapePanel(page).getByRole('button', { name: 'Remove photo' }).click()
  expectColor(await designPixel(page, size, 150, 150), BLUE)
})

test('a picture dropped next to the shapes becomes a layer of its own, where it was dropped', async ({ page }) => {
  const size = await newDesign(page)
  await dropPhoto(page, size, 150, 100, await photo(page))
  expect(await layerNames(page)).toEqual(['beach'])
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
  await expectPickedSize(page, 10, 5)

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
  await expect(page.getByRole('main').locator('canvas')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })

  await expect(page.locator('header')).toContainText('My design 1')
  // The header shows the name before the opened design is drawn, so wait for its layers.
  await expect.poll(() => layerNames(page)).toEqual(['beach', 'Oval 1', 'Rectangle 1'])
  expectColor(await designPixel(page, size, 50, 50), RED)
  expectColor(await designPixel(page, size, 150, 150), RED)
  expectColor(await designPixel(page, size, 250, 150), GREEN)
  expectColor(await designPixel(page, size, 105, 55), WHITE)

  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Layer: beach' }).click()
  await expectPickedSize(page, 10, 5)
  await drag(page, size, [
    [110, 105],
    [300, 200],
  ])
  expectColor(await designPixel(page, size, 197, 150), RED)
  expectColor(await designPixel(page, size, 203, 150), GREEN)
})

test('bring forward and send backward, with the buttons and the keyboard', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Rectangle', [100, 100], [200, 200])
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drawShape(page, size, 'Rectangle', [150, 150], [250, 250])
  // The new blue one covers the red one where they overlap.
  expectColor(await designPixel(page, size, 175, 175), BLUE)
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])

  await page.getByRole('toolbar').getByRole('button', { name: 'Send backward' }).click()
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Rectangle 2'])
  expectColor(await designPixel(page, size, 175, 175), RED)
  expect(await undoLabel(page)).toContain('Undo send backward')

  await page.keyboard.press('Control+]')
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])
  await page.keyboard.press('Control+Shift+[')
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Rectangle 2'])
  expect(await undoLabel(page)).toContain('Undo send to back')
  await page.keyboard.press('Control+Shift+]')
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])
})

test('an opened photo is locked: painting goes on a drawing above it, and the eraser leaves it alone', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({ name: 'beach.png', mimeType: 'image/png', buffer: await photo(page) })
  const size = { width: 200, height: 100 }
  await expect(page.getByRole('main').locator('canvas[aria-label]')).toHaveAttribute('aria-label', /200 by 100 pixels$/)
  await page.keyboard.press('Control+Alt+0')
  expect(await layerNames(page)).toEqual(['Picture'])
  await expect(page.getByRole('button', { name: 'Unlock Picture' })).toBeVisible()

  await page.keyboard.press('e')
  await drag(page, size, [
    [20, 50],
    [180, 50],
  ])
  await expect(page.getByRole('alert')).toContainText('“Picture” is locked')
  expectColor(await designPixel(page, size, 50, 50), RED)

  await page.keyboard.press('b')
  await drag(page, size, [
    [20, 50],
    [180, 50],
  ])
  expect(await layerNames(page)).toEqual(['Drawing 1', 'Picture'])
  expectColor(await designPixel(page, size, 50, 50), INK)
  await page.getByRole('button', { name: 'Hide Drawing 1' }).click()
  expectColor(await designPixel(page, size, 50, 50), RED)
})

// One pixel of the layer with handles and guides, at a design point (at 100%).
function overlayPixel(page: Page, size: Size, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([w, h, px, py]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas[aria-label]') as HTMLCanvasElement
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return Array.from(canvas.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data)
    },
    [size.width, size.height, x, y],
  )
}

test('dragging lines things up with the page and each other, with guides; Alt moves freely', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Rectangle', [20, 20], [60, 60])
  // Drag so its middle lands 3 pixels right of the page's middle: it clicks into place.
  const start = await screenPoint(page, size, 40, 40)
  const near = await screenPoint(page, size, 203, 120)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(near.x, near.y, { steps: 10 })
  // While dragging, a guide line runs down the middle of the page.
  const guide = await overlayPixel(page, size, 200, 280)
  expect(guide[0] - guide[2], 'a pink guide').toBeGreaterThan(80)
  await page.mouse.up()
  expectColor(await designPixel(page, size, 181, 120), BLUE)
  expectColor(await designPixel(page, size, 179, 120), WHITE)
  expectColor(await designPixel(page, size, 219, 120), BLUE)

  // With Alt held, it goes exactly where it's dropped.
  await page.keyboard.down('Alt')
  await drag(page, size, [
    [200, 120],
    [203, 220],
  ])
  await page.keyboard.up('Alt')
  // Three pixels right of the middle, not pulled back to it.
  expectColor(await designPixel(page, size, 182, 220), WHITE)
  expectColor(await designPixel(page, size, 184, 220), BLUE)
  expectColor(await designPixel(page, size, 222, 220), BLUE)
  expectColor(await designPixel(page, size, 224, 220), WHITE)
})

test('dragging between two things evens out the gaps', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Rectangle', [20, 100], [70, 150])
  await drawShape(page, size, 'Rectangle', [230, 100], [280, 150])
  await drawShape(page, size, 'Rectangle', [20, 220], [70, 270])
  // Halfway between them leaves 55 on each side: x 125 to 175. Dropped 4 pixels off, it clicks in.
  await drag(page, size, [
    [45, 245],
    [154, 128],
  ])
  expectColor(await designPixel(page, size, 126, 125), BLUE)
  expectColor(await designPixel(page, size, 124, 125), WHITE)
  expectColor(await designPixel(page, size, 174, 125), BLUE)
  expectColor(await designPixel(page, size, 176, 125), WHITE)
})

test('with the Shapes tool, clicking a shape picks it instead of adding another', async ({ page }) => {
  const size = await newDesign(page)
  await drawShape(page, size, 'Rectangle', [100, 100], [200, 200])
  await page.keyboard.press('u')
  await clickAt(page, size, 150, 150)
  expect(await layerNames(page)).toEqual(['Rectangle 1'])
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  await expectPickedSize(page, 100, 100)
  // Clicking empty paper still drops a new one.
  await page.keyboard.press('u')
  await clickAt(page, size, 300, 60)
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])
})

test('outlines and lines can be dashed or dotted, and stay that way in a project file', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await drag(page, size, [
    [50, 50],
    [350, 250],
  ])
  await shapePanel(page).getByRole('button', { name: 'Outline color' }).click()
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  await shapePanel(page).getByRole('slider', { name: 'Outline width' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')

  // Along the top edge: how much of it is outline.
  const greenAlongTop = async () => {
    let green = 0
    for (let x = 100; x < 300; x += 2) {
      const [r, g, b] = await designPixel(page, size, x, 50)
      if (g > 150 && r < 120 && b < 150) green++
    }
    return green / 100
  }
  const style = shapePanel(page).getByRole('radiogroup', { name: 'Outline style' })
  await expect(style.getByRole('radio', { name: 'Solid' })).toHaveAttribute('aria-checked', 'true')
  expect(await greenAlongTop()).toBeGreaterThan(0.95)

  await style.getByRole('radio', { name: 'Dashed' }).click()
  expect(await undoLabel(page)).toContain('Undo dashed line')
  const dashed = await greenAlongTop()
  expect(dashed).toBeGreaterThan(0.4)
  expect(dashed).toBeLessThan(0.8)

  await style.getByRole('radio', { name: 'Dotted' }).click()
  const dotted = await greenAlongTop()
  expect(dotted).toBeGreaterThan(0.1)
  expect(dotted).toBeLessThan(0.7)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'Dots.pixel', mimeType: '', buffer: bytes })
  await expect(page.locator('header')).toContainText('My design 1')
  await expect.poll(greenAlongTop).toBeCloseTo(dotted, 1)
})
