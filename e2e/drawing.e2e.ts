import { clickAt, designPixel, drag, expectColor, INK, newDesign, WHITE } from './helpers.ts'
import { expect, test } from './setup.ts'

test('the brush paints, and undo and redo take it back and forth', async ({ page }) => {
  const size = await newDesign(page)
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await undo.hover()
  await expect(page.getByRole('tooltip')).toContainText('Nothing to undo yet.')

  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])
  expectColor(await designPixel(page, size, 200, 150), INK)
  // Steady hand smooths the line, but it still reaches the end.
  expectColor(await designPixel(page, size, 347, 150), INK, 40)

  await undo.hover()
  await expect(page.getByRole('tooltip')).toContainText('Undo brush stroke')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  await page.keyboard.press('Control+Shift+z')
  expectColor(await designPixel(page, size, 200, 150), INK)
  await undo.click()
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expectColor(await designPixel(page, size, 200, 150), INK)
})

test('the eraser rubs out paint but leaves the paper underneath', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])
  await page.keyboard.press('e')
  await expect(page.getByRole('button', { name: 'Eraser tool' })).toHaveAttribute('aria-pressed', 'true')
  await drag(page, size, [
    [200, 60],
    [200, 240],
  ])
  expectColor(await designPixel(page, size, 200, 150), WHITE)
  expectColor(await designPixel(page, size, 100, 150), INK)
})

test('Shift + click draws a straight line from the last point', async ({ page }) => {
  const size = await newDesign(page)
  await clickAt(page, size, 50, 50)
  await clickAt(page, size, 350, 250, ['Shift'])
  expectColor(await designPixel(page, size, 200, 150), INK)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Undo straight line')
})

test('Marker paint is see-through and stays even where one stroke crosses itself', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('radio', { name: 'Marker' }).click()
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveAttribute('aria-valuetext', '70%')
  // Right, then back left over the same path, in one stroke.
  await drag(page, size, [
    [60, 150],
    [340, 150],
    [100, 150],
  ])
  const once = await designPixel(page, size, 200, 150)
  // 70% ink over white paper.
  expectColor(once, [96, 97, 101], 10)
  // A second stroke over it does get darker, like a real marker.
  await drag(page, size, [
    [60, 150],
    [340, 150],
  ])
  expect((await designPixel(page, size, 200, 150))[0]).toBeLessThan(once[0] - 20)
})

test('colors come from swatches, color codes and the design itself', async ({ page }) => {
  const size = await newDesign(page)
  const code = page.getByLabel('Color code')

  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await expect(code).toHaveValue('EF4444')
  await drag(page, size, [
    [50, 80],
    [350, 80],
  ])
  expectColor(await designPixel(page, size, 200, 80), [239, 68, 68])

  await code.fill('00ff00')
  await code.press('Enter')
  await drag(page, size, [
    [50, 220],
    [350, 220],
  ])
  expectColor(await designPixel(page, size, 200, 220), [0, 255, 0])

  // Hold Alt with the brush to pick a color without switching tools.
  await clickAt(page, size, 200, 80, ['Alt'])
  await expect(code).toHaveValue('EF4444')
  await expect(page.getByRole('button', { name: 'Brush tool' })).toHaveAttribute('aria-pressed', 'true')

  // The Color picker tool hands you back to the brush after picking.
  await page.keyboard.press('i')
  await expect(page.getByRole('status')).toContainText('Click anywhere')
  await clickAt(page, size, 200, 220)
  await expect(code).toHaveValue('00FF00')
  await expect(page.getByRole('button', { name: 'Brush tool' })).toHaveAttribute('aria-pressed', 'true')

  // Colors you painted with show up under Recently used.
  await expect(page.getByRole('button', { name: 'Recent color' })).toHaveCount(2)

  // A bad color code is ignored.
  await code.fill('banana')
  await code.press('Enter')
  await expect(code).toHaveValue('00FF00')
})

test('brush presets, size keys and Reset', async ({ page }) => {
  await newDesign(page)
  const sizeSlider = page.getByLabel('Size', { exact: true })
  await expect(sizeSlider).toHaveAttribute('aria-valuetext', '10 px')
  await page.keyboard.press(']')
  await expect(sizeSlider).toHaveAttribute('aria-valuetext', '15 px')
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(sizeSlider).toHaveAttribute('aria-valuetext', '10 px')
  await expect(page.getByRole('button', { name: 'Reset' })).toBeHidden()
  await page.keyboard.press('[')
  await expect(sizeSlider).toHaveAttribute('aria-valuetext', '9 px')

  await page.getByRole('radio', { name: 'Pencil' }).click()
  await expect(sizeSlider).toHaveAttribute('aria-valuetext', '4 px')
  // After a click the tip stays closed until the pointer leaves and comes back.
  await page.mouse.move(700, 600)
  await page.getByRole('radio', { name: 'Pencil' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('thin, crisp line')

  // Sliders explain the current value while you use them.
  await page.getByLabel('Steady hand').hover()
  await expect(page.getByRole('tooltip')).toContainText('A little smoothing')
})

test('layers: add, paint, rename, reorder, duplicate, delete and undo', async ({ page }) => {
  const size = await newDesign(page)
  const list = page.getByRole('list', { name: 'Layer list' })
  const names = () => list.getByRole('button', { name: /^Layer: / }).allTextContents()

  await page.getByRole('button', { name: 'New layer' }).click()
  await expect(page.getByRole('button', { name: 'Layer: Layer 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(await names()).toEqual(['Layer 2', 'Layer 1', 'Background'])

  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])

  await page.getByRole('button', { name: 'Layer: Layer 2' }).dblclick()
  await page.getByLabel('Layer name').fill('Sky')
  await page.getByLabel('Layer name').press('Enter')
  expect(await names()).toEqual(['Sky', 'Layer 1', 'Background'])

  await page.getByRole('button', { name: 'Move layer down' }).click()
  expect(await names()).toEqual(['Layer 1', 'Sky', 'Background'])

  await page.getByRole('button', { name: 'Duplicate layer' }).click()
  expect(await names()).toEqual(['Layer 1', 'Sky copy', 'Sky', 'Background'])

  await page.getByRole('button', { name: 'Delete layer' }).click()
  await page.getByRole('button', { name: 'Delete layer' }).click()
  expect(await names()).toEqual(['Layer 1', 'Background'])
  expectColor(await designPixel(page, size, 200, 150), WHITE)

  // Undo brings back the deleted layers with their paint.
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expect(await names()).toEqual(['Layer 1', 'Sky copy', 'Sky', 'Background'])
  expectColor(await designPixel(page, size, 200, 150), [239, 68, 68])

  // Buttons that can't be used say why.
  await page.getByRole('button', { name: 'Layer: Background' }).click()
  await page.getByRole('button', { name: 'Move layer down' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('already at the back')
})

test('painting on a hidden layer explains what to do instead', async ({ page }) => {
  const size = await newDesign(page)
  await page.getByRole('button', { name: 'Hide Layer 1' }).click()
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])
  await expect(page.getByRole('alert')).toContainText('"Layer 1" is hidden')
  await page.getByRole('button', { name: 'Show Layer 1' }).click()
  expectColor(await designPixel(page, size, 200, 150), WHITE)
})

test('layer opacity fades a layer, and a whole slider drag is one undo step', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])
  const opacity = page.getByLabel('Layer opacity')
  await opacity.focus()
  for (let i = 0; i < 5; i++) await opacity.press('Shift+ArrowLeft')
  await expect(opacity).toHaveAttribute('aria-valuetext', '50%')
  const faded = await designPixel(page, size, 200, 150)
  expectColor(faded, [141, 142, 145], 10)

  // Shortcuts still work while the slider is focused.
  await page.keyboard.press('Control+z')
  await expect(opacity).toHaveAttribute('aria-valuetext', '100%')
  expectColor(await designPixel(page, size, 200, 150), INK)
})

test('search understands everyday words for the new actions', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 150],
    [350, 150],
  ])
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox')
  await search.fill('oops')
  await expect(page.getByRole('option').first()).toContainText('Undo brush stroke')
  await search.press('Enter')
  expectColor(await designPixel(page, size, 200, 150), WHITE)

  await page.keyboard.press('Control+k')
  await search.fill('rubber')
  await expect(page.getByRole('option').first()).toContainText('Eraser tool')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Eraser tool' })).toHaveAttribute('aria-pressed', 'true')
})

test('the brush settings fit on common laptop screens', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    for (const tool of ['Brush tool', 'Eraser tool']) {
      await page.getByRole('button', { name: tool }).click()
      const bar = page.getByRole('toolbar')
      const { scroll, client } = await bar.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      expect(scroll, `${tool} settings at ${width}px wide`).toBeLessThanOrEqual(client)
    }
  }
})
