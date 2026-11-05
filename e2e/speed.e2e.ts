import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, INK, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// The box around what's painted, found on screen (at 100% zoom): every pixel that isn't white.
function paintedBox(page: Page, size: Size) {
  return page.evaluate(
    async ([w, h]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left, top, Math.round(w * dpr), Math.round(h * dpr)).data
      const width = Math.round(w * dpr)
      let minX = Infinity
      let minY = Infinity
      let maxX = -1
      let maxY = -1
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) continue
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      return { width: (maxX - minX + 1) / dpr, height: (maxY - minY + 1) / dpr }
    },
    [size.width, size.height],
  )
}

// The size the Arrange bar shows for the picked drawing.
async function pickedSize(page: Page) {
  await page.keyboard.press('v')
  const text = await page.getByRole('toolbar').getByRole('button', { name: 'Size and place' }).textContent()
  const [width, height] = text!.match(/\d+/g)!.map(Number)
  return { width, height }
}

async function expectBoxMatches(page: Page, size: Size) {
  const seen = await paintedBox(page, size)
  const picked = await pickedSize(page)
  // Faint edge pixels round to white on screen, so the picked box can be a little bigger.
  expect(picked.width - seen.width).toBeGreaterThanOrEqual(-1)
  expect(picked.width - seen.width).toBeLessThanOrEqual(4)
  expect(picked.height - seen.height).toBeGreaterThanOrEqual(-1)
  expect(picked.height - seen.height).toBeLessThanOrEqual(4)
}

// Finding the edges of a drawing after each stroke reads only the part that changed; the answer
// must still be exactly right after painting, erasing, undo and redo.
test('the picked box hugs the drawing after painting, erasing, undo and redo', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [60, 80],
    [160, 90],
  ])
  await expectBoxMatches(page, size)
  await page.keyboard.press('b')
  await drag(page, size, [
    [240, 200],
    [340, 230],
  ])
  await expectBoxMatches(page, size)
  const both = await pickedSize(page)

  // Rubbing out the middle of the first line leaves the box as it was.
  await page.keyboard.press('e')
  await drag(page, size, [
    [100, 60],
    [100, 110],
  ])
  await expectBoxMatches(page, size)
  expect(await pickedSize(page)).toEqual(both)

  // Rubbing out the whole second line shrinks it.
  await page.keyboard.press('e')
  for (let y = 180; y <= 250; y += 8) {
    await drag(page, size, [
      [220, y],
      [370, y],
    ])
  }
  await expectBoxMatches(page, size)
  expect((await pickedSize(page)).width).toBeLessThan(both.width - 50)

  // Undo brings it back one rub at a time, and redo takes it away again.
  const rubs = Math.floor((250 - 180) / 8) + 1
  for (let i = 0; i < rubs; i++) {
    await page.keyboard.press('Control+z')
    if (i % 3 === 0) await expectBoxMatches(page, size)
  }
  expect(await pickedSize(page)).toEqual(both)
  for (let i = 0; i < rubs; i++) await page.keyboard.press('Control+Shift+z')
  await expectBoxMatches(page, size)
  expect((await pickedSize(page)).width).toBeLessThan(both.width - 50)
  for (let i = 0; i < rubs + 2; i++) await page.keyboard.press('Control+z')
  await expectBoxMatches(page, size)
})

// Each new stroke starts from the last one's copy of the layer, unless something else changed it.
test('a stroke after undo, or after another change, never brings back what was undone', async ({ page }) => {
  const size = await newDesign(page)
  const line = (y: number) =>
    drag(page, size, [
      [60, y],
      [340, y],
    ])
  await line(60)
  await line(120)
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 120), WHITE)
  await line(180)
  expectColor(await designPixel(page, size, 200, 120), WHITE)
  expectColor(await designPixel(page, size, 200, 60), INK)
  expectColor(await designPixel(page, size, 200, 180), INK)
  // Rubbing out, then painting again.
  await page.keyboard.press('e')
  await line(60)
  await page.keyboard.press('b')
  await line(240)
  expectColor(await designPixel(page, size, 200, 60), WHITE)
  expectColor(await designPixel(page, size, 200, 240), INK)
  // Undo twice, then paint: both undone strokes stay gone.
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expectColor(await designPixel(page, size, 200, 60), INK)
  await line(270)
  expectColor(await designPixel(page, size, 200, 60), INK)
  expectColor(await designPixel(page, size, 200, 240), WHITE)
  expectColor(await designPixel(page, size, 200, 120), WHITE)
})
