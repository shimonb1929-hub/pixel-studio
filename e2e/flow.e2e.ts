import type { Page } from '@playwright/test'
import { drag, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const textPanel = (page: Page) => page.getByRole('region', { name: 'Text' })

const STORY = 'Once there was a small boat that sailed every morning across the calm blue lake to bring bread and milk to the village on the far shore'

// Whether anything is drawn (not white) in a part of the design.
async function hasInk(page: Page, size: Size, x: number, y: number, width: number, height: number) {
  return page.evaluate(
    ([w, h, rx, ry, rw, rh]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left + Math.round(rx * dpr), top + Math.round(ry * dpr), Math.round(rw * dpr), Math.round(rh * dpr)).data
      for (let i = 0; i < data.length; i += 4) if (765 - data[i] - data[i + 1] - data[i + 2] > 240) return true
      return false
    },
    [size.width, size.height, x, y, width, height] as const,
  )
}

async function writeStory(page: Page, size: Size) {
  await page.keyboard.press('t')
  await drag(page, size, [
    [20, 20],
    [180, 40],
  ])
  await page.keyboard.type(STORY)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
}

test('text runs on into another box, and comes back when the box is taken away', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await writeStory(page, size)
  await expect.poll(() => hasInk(page, size, 200, 0, 200, 300)).toBe(false)

  await textPanel(page).getByRole('button', { name: 'Continue in another box' }).click()
  // The new box is beside the first one, picked, and holds the rest of the story.
  expect(await layerNames(page)).toHaveLength(2)
  await expect(textPanel(page).getByRole('note')).toContainText('Box 2 of 2')
  await expect.poll(() => hasInk(page, size, 200, 0, 200, 300)).toBe(true)
  // The first box kept only its top half.
  await expect.poll(() => hasInk(page, size, 0, 200, 190, 100)).toBe(false)

  // The two boxes look the same: a new size changes both.
  await textPanel(page).getByLabel('Text size in pixels').fill('12')
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: /^Layer: / }).last().click()
  await expect(textPanel(page).getByLabel('Text size in pixels')).toHaveValue('12')

  // Taking the second box away puts every word back in the first.
  await page.getByRole('button', { name: /^Layer: / }).first().click()
  await page.keyboard.press('Delete')
  expect(await layerNames(page)).toHaveLength(1)
  await expect(textPanel(page).getByRole('note')).toHaveCount(0)
  await expect.poll(() => hasInk(page, size, 200, 0, 200, 300)).toBe(false)

  // Undo brings the second box back.
  await page.keyboard.press('Control+z')
  expect(await layerNames(page)).toHaveLength(2)
})

test('typing in the first box pushes words on into the next one', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await writeStory(page, size)
  await textPanel(page).getByRole('button', { name: 'Continue in another box' }).click()
  await expect.poll(() => hasInk(page, size, 200, 0, 200, 300)).toBe(true)
  const lastName = (await layerNames(page))[0]

  // Pick the first box and type more words at its start.
  const first = await screenPoint(page, size, 40, 30)
  await page.mouse.dblclick(first.x, first.y)
  await expect(page.getByRole('textbox', { name: 'Type your text' })).toBeFocused()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('Long long ago, ')
  await page.keyboard.press('Escape')
  // The story still starts in box one and runs on, so the second box now starts further on.
  expect(await layerNames(page)).toHaveLength(2)
  expect((await layerNames(page))[0]).not.toBe(lastName)
})

test('Hebrew runs on into a box on its left, like newspaper columns', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await page.keyboard.press('t')
  await drag(page, size, [
    [220, 20],
    [380, 40],
  ])
  await page.keyboard.type('היה היה פעם סירה קטנה ששטה כל בוקר על פני האגם הכחול והשקט כדי להביא לחם וחלב לכפר שעל החוף השני')
  await page.keyboard.press('Escape')
  await expect.poll(() => hasInk(page, size, 0, 0, 200, 300)).toBe(false)
  await textPanel(page).getByRole('button', { name: 'Continue in another box' }).click()
  await expect.poll(() => hasInk(page, size, 0, 0, 200, 300)).toBe(true)
  // What's left of the first box keeps the beginning: its bottom is now free.
  await expect.poll(() => hasInk(page, size, 210, 220, 190, 80)).toBe(false)
})
