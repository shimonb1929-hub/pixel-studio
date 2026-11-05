import type { Page } from '@playwright/test'
import { clickAt, compareShots, designPixel, drag, expectColor, newDesign, screenPoint, shot, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const panel = (page: Page) => page.getByRole('region', { name: 'Make copies' })
const layers = (page: Page) => page.getByRole('list', { name: 'Layer list' })

async function drawRectangle(page: Page, size: Size, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle' }).click()
  await drag(page, size, [from, to])
}

test('linked copies: change one and they all change, until one goes its own way', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await drawRectangle(page, size, [20, 20], [60, 60])
  await page.getByRole('toolbar').getByRole('button', { name: 'Make copies' }).click()
  await panel(page).getByRole('checkbox', { name: /Change together/ }).check()
  await panel(page).getByRole('button', { name: 'Apply' }).click()
  await layers(page).getByRole('button', { name: 'Show the parts of Copies of Rectangle 1' }).click()
  await expect(layers(page).getByRole('button', { name: /change on its own/ })).toHaveCount(4)

  // Pick just one copy inside the group, and color it green: every copy turns green.
  const copy = await screenPoint(page, size, 88, 40)
  await page.mouse.dblclick(copy.x, copy.y)
  await page.getByRole('button', { name: 'Green', exact: true }).click()
  const green = await designPixel(page, size, 40, 40)
  expect(green[1]).toBeGreaterThan(green[2] + 40)
  const last = await designPixel(page, size, 184, 40)
  expect(last[1]).toBeGreaterThan(last[2] + 40)

  // One goes its own way: the others no longer follow it.
  await layers(page).getByRole('button', { name: /change on its own/ }).first().click()
  await expect(layers(page).getByRole('button', { name: /change on its own/ })).toHaveCount(3)
})

test('words into shapes look the same as the words, and the words stay hidden below', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await page.keyboard.press('t')
  await clickAt(page, size, 60, 120)
  await page.keyboard.type('Shalom שלום')
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await clickAt(page, size, 390, 290)
  const before = await shot(page, size, 40, 80, 320, 100)
  await clickAt(page, size, 80, 130)

  await page.keyboard.press('Control+k')
  await page.keyboard.type('create outlines')
  await page.keyboard.press('Enter')
  await expect(layers(page).getByRole('button', { name: /^Layer: / })).toHaveCount(2)
  await clickAt(page, size, 390, 290)
  const after = await shot(page, size, 40, 80, 320, 100)
  const { ink, different } = await compareShots(page, before, after)
  expect(ink).toBeGreaterThan(200)
  expect(different).toBeLessThan(ink * 0.08)
  expectColor(await designPixel(page, size, 395, 295), WHITE)
  // The words are still there, hidden, ready to change.
  await expect(layers(page).getByRole('button', { name: /^Show .*Shalom/ })).toBeVisible()
})
