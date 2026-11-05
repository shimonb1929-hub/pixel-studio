import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, newDesign, screenPoint, type Size } from './helpers.ts'
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
  // Rectangle 2 sits between them, so they can't be joined until it is picked too.
  await expect(join).toHaveAttribute('aria-disabled', 'true')
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 2' }).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+e')
  expect(await layerNames(page)).toEqual(['Rectangle 3'])
  expectColor(await designPixel(page, size, 60, 60), BLUE)
  expectColor(await designPixel(page, size, 140, 80), BLUE)
  expectColor(await designPixel(page, size, 270, 220), BLUE)

  // The bottom layer has nothing below it to join with.
  await layerList(page).getByRole('button', { name: 'Layer: Rectangle 3' }).click()
  await expect(join).toHaveAttribute('aria-disabled', 'true')
})

test('Ctrl+A with Arrange picks everything on the design', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await page.keyboard.press('v')
  await page.keyboard.press('Control+a')
  await expect(page.getByRole('toolbar')).toContainText('2 things')
  // Then they can be kept together at once.
  await page.keyboard.press('Control+g')
  await expect(layerList(page).getByRole('button', { name: /^Kept together: / })).toHaveCount(1)
})

test('right-click a thing or a layer for a short menu of what you can do with it', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  const menu = page.getByRole('menu', { name: 'Things you can do' })

  // On the design: it picks what's under the pointer, with Arrange.
  await page.keyboard.press('b')
  const point = await screenPoint(page, size, 60, 60)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(menu).toBeVisible()
  await expect(layerButton(page, 'Rectangle 1')).toHaveAttribute('aria-pressed', 'true')
  await menu.getByRole('menuitem', { name: 'Duplicate layer' }).click()
  await expect(menu).toBeHidden()
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1 copy', 'Rectangle 1'])

  // On a layer row.
  await layerButton(page, 'Rectangle 2').click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Send to back' }).click()
  expect(await layerNames(page)).toEqual(['Rectangle 1 copy', 'Rectangle 1', 'Rectangle 2'])

  // Cut works on a picked thing too, not only on a selected area.
  await layerButton(page, 'Rectangle 1 copy').click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Cut' }).click()
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Rectangle 2'])

  // On empty paper: the page's menu. Esc closes it.
  const empty = await screenPoint(page, size, 300, 250)
  await page.mouse.click(empty.x, empty.y, { button: 'right' })
  await expect(menu.getByRole('menuitem', { name: 'Color the page' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

// Sends a finger press, slide and lift, the way a phone or tablet does.
async function fingerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.evaluate(
    async ([fx, fy, tx, ty]) => {
      const send = (type: string, x: number, y: number) => {
        const target = type === 'pointerdown' ? document.elementFromPoint(x, y)! : window
        const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
        target.dispatchEvent(event)
      }
      send('pointerdown', fx, fy)
      for (let i = 1; i <= 6; i++) {
        send('pointermove', fx + ((tx - fx) * i) / 6, fy + ((ty - fy) * i) / 6)
        await new Promise(requestAnimationFrame)
      }
      send('pointerup', tx, ty)
    },
    [from.x, from.y, to.x, to.y],
  )
}

test('a finger drags a layer by its handle, and sliding on the rest of the row does not', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])
  const row = (name: string) => layerList(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: `Layer: ${name}`, exact: true }) })

  // Sliding a finger on the name is left for scrolling the list.
  const name = (await layerButton(page, 'Rectangle 2').boundingBox())!
  const below = (await layerButton(page, 'Rectangle 1').boundingBox())!
  await fingerDrag(page, { x: name.x + 60, y: name.y + name.height / 2 }, { x: below.x + 60, y: below.y + below.height - 3 })
  expect(await layerNames(page)).toEqual(['Rectangle 2', 'Rectangle 1'])

  // The handle at the start of the row drags it.
  const grip = (await row('Rectangle 2').locator('[data-grip]').boundingBox())!
  await fingerDrag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: below.x + 60, y: below.y + below.height - 3 })
  expect(await layerNames(page)).toEqual(['Rectangle 1', 'Rectangle 2'])
})

test('each row has its own trash can, and Pick several picks layers with a tap each', async ({ page }) => {
  const size = await newDesign(page)
  await drawRectangle(page, size, [40, 40], [80, 80])
  await drawRectangle(page, size, [120, 60], [160, 100])
  await drawRectangle(page, size, [250, 200], [290, 240])
  await page.getByRole('button', { name: 'Arrange tool' }).click()

  // The trash can on a row removes just that row.
  await layerButton(page, 'Rectangle 2').hover()
  await layerList(page).getByRole('button', { name: 'Delete Rectangle 2' }).click()
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 1'])

  // Pick several: the picked layer stays picked, and each tap adds another, with no key to hold.
  await layerButton(page, 'Rectangle 3').click()
  await page.getByRole('button', { name: 'Pick several' }).click()
  await layerButton(page, 'Rectangle 1').click()
  await expect(layerButton(page, 'Rectangle 3')).toHaveAttribute('aria-pressed', 'true')
  await expect(layerButton(page, 'Rectangle 1')).toHaveAttribute('aria-pressed', 'true')
  // A tap again takes one away, and adds it back.
  await layerButton(page, 'Rectangle 1').click()
  await expect(layerButton(page, 'Rectangle 1')).toHaveAttribute('aria-pressed', 'false')
  await layerButton(page, 'Rectangle 1').click()

  // The trash can on a picked row removes everything picked, in one step to undo.
  await layerList(page).getByRole('button', { name: 'Delete Rectangle 3' }).click()
  expect(await layerNames(page)).toEqual([])
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toEqual(['Rectangle 3', 'Rectangle 1'])

  // Done goes back to one at a time; Ctrl+click still adds one.
  await page.getByRole('button', { name: 'Done' }).click()
  await layerButton(page, 'Rectangle 3').click()
  await layerButton(page, 'Rectangle 1').click({ modifiers: ['Control'] })
  await expect(layerButton(page, 'Rectangle 3')).toHaveAttribute('aria-pressed', 'true')
  await expect(layerButton(page, 'Rectangle 1')).toHaveAttribute('aria-pressed', 'true')
})
