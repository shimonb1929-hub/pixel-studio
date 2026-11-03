import type { Page } from '@playwright/test'
import { expect, test } from './setup.ts'

async function startDesign(page: Page) {
  await page.getByRole('button', { name: /Custom size/ }).click()
  const dialog = page.getByRole('dialog', { name: 'New design' })
  await dialog.getByLabel('Width in pixels').fill('800')
  await dialog.getByLabel('Height in pixels').fill('600')
  await dialog.getByRole('button', { name: 'Create design' }).click()
  await page.getByRole('button', { name: 'Add words' }).click()
  await page.keyboard.press('Escape')
}

// Nothing sticks out past the sides of the window, so the page never slides sideways.
async function expectNoSideways(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const name of ['Tools', 'Menu', 'Undo', 'Download']) {
    const box = (await page.getByRole(name === 'Tools' ? 'navigation' : 'button', { name, exact: true }).first().boundingBox())!
    expect(box.x, name).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, name).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the tools sit in a row along the bottom, and the panels slide up when asked', async ({ page }) => {
    await startDesign(page)
    await expectNoSideways(page)
    const tools = (await page.getByRole('navigation', { name: 'Tools' }).boundingBox())!
    const design = (await page.getByRole('main').boundingBox())!
    expect(tools.y).toBeGreaterThan(design.y + design.height - 1)

    // Closed at first, so the whole design shows; a button named after what's picked opens its settings.
    await expect(page.getByRole('complementary', { name: 'Panels' })).toHaveCount(0)
    const buttons = page.getByRole('group', { name: 'Panels' })
    await buttons.getByRole('button', { name: 'Text' }).click()
    const sheet = page.getByRole('complementary', { name: 'Panels' })
    await expect(sheet.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true')
    await expect(sheet.getByText('Boldness')).toBeVisible()
    const box = (await sheet.boundingBox())!
    expect(box.y + box.height).toBeCloseTo(844, 0)

    // The Layers tab shows the list; Close puts it all away.
    await sheet.getByRole('tab', { name: 'Layers' }).click()
    await expect(sheet.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: 'Layer: Your heading' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Close panels' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(buttons).toBeVisible()
  })
})

test.describe('on an upright tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })

  test('the panels open from the side, over the design', async ({ page }) => {
    await startDesign(page)
    await expectNoSideways(page)
    await page.getByRole('group', { name: 'Panels' }).getByRole('button', { name: 'Layers' }).click()
    const sheet = page.getByRole('complementary', { name: 'Panels' })
    const box = (await sheet.boundingBox())!
    expect(box.x + box.width).toBeGreaterThan(800)
    expect(box.width).toBeLessThan(340)
    await expect(sheet.getByRole('button', { name: 'Layer: Your heading' })).toBeVisible()
    // Picking the page from the list turns the first tab into the page's settings.
    await sheet.getByRole('button', { name: 'Page', exact: true }).click()
    await expect(sheet.getByRole('tab', { name: 'Page' })).toBeVisible()
  })
})

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1366, height: 768 } })

  test('the panels stay beside the design, and the bar between them makes room for Layers', async ({ page }) => {
    await startDesign(page)
    await expectNoSideways(page)
    await expect(page.getByRole('group', { name: 'Panels' })).toHaveCount(0)
    const list = page.getByRole('list', { name: 'Layer list' })
    const before = (await list.boundingBox())!.height
    const bar = (await page.getByRole('separator', { name: 'Make room' }).boundingBox())!
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
    await page.mouse.down()
    await page.mouse.move(bar.x + bar.width / 2, bar.y - 200, { steps: 6 })
    await page.mouse.up()
    expect((await list.boundingBox())!.height).toBeGreaterThan(before + 100)
    // Kept for next time; a double-click puts it back.
    const kept = () => page.evaluate(() => localStorage.getItem('pixel-studio-panel-split'))
    expect(Number(await kept())).toBeGreaterThan(0.15)
    await page.getByRole('separator', { name: 'Make room' }).dblclick()
    await expect.poll(async () => (await list.boundingBox())!.height).toBeLessThan(before + 20)
    expect(await kept()).toBeNull()
  })
})
