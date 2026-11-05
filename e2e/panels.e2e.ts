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

const color = (page: Page) => page.getByRole('region', { name: 'Color', exact: true })
const layers = (page: Page) => page.getByRole('region', { name: 'Layers', exact: true })
const yourPanels = (page: Page) => page.getByRole('dialog', { name: 'Your panels' })

test.describe('choosing the panels beside the design', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test('panels are put away, moved and made wider, then put back', async ({ page }) => {
    await startDesign(page)
    await expect(color(page)).toBeVisible()

    await page.getByRole('button', { name: 'Your panels' }).click()
    const box = yourPanels(page)
    await expect(box).toBeVisible()
    await expect(box.getByRole('button', { name: 'Put back how it was' })).toBeDisabled()

    // Put the Color panel away: it goes at once, and comes back when ticked again.
    await box.getByRole('checkbox', { name: 'Color' }).uncheck()
    await expect(color(page)).toHaveCount(0)
    await box.getByRole('checkbox', { name: 'Color' }).check()
    await expect(color(page)).toBeVisible()

    // Move Layers to the top: it now sits above the Color panel.
    await box.getByRole('button', { name: 'Move Layers up' }).click()
    expect((await layers(page).boundingBox())!.y).toBeLessThan((await color(page).boundingBox())!.y)
    await expect(box.getByRole('button', { name: 'Move Layers up' })).toBeDisabled()

    // Move Color above the picked thing's settings.
    const text = page.getByRole('region', { name: 'Text', exact: true })
    expect((await text.boundingBox())!.y).toBeLessThan((await color(page).boundingBox())!.y)
    await box.getByRole('button', { name: 'Move Color up' }).click()
    expect((await color(page).boundingBox())!.y).toBeLessThan((await text.boundingBox())!.y)

    // Wider panels, and a smaller design area beside them.
    const narrow = (await layers(page).boundingBox())!.width
    await box.getByRole('radio', { name: 'Widest' }).click()
    await expect.poll(async () => (await layers(page).boundingBox())!.width).toBeGreaterThan(narrow + 100)

    // Kept for next time.
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel-studio-panel-layout') ?? 'null'))
    expect(kept.order[0]).toBe('layers')
    expect(kept.width).toBe(432)
  })

  test('the edge beside the design drags to make the panels wider, and Put back undoes it all', async ({ page }) => {
    await startDesign(page)
    const before = (await layers(page).boundingBox())!.width
    const edge = (await page.getByRole('separator', { name: 'Panel width' }).boundingBox())!
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
    await page.mouse.down()
    await page.mouse.move(edge.x - 100, edge.y + edge.height / 2, { steps: 6 })
    await page.mouse.up()
    expect((await layers(page).boundingBox())!.width).toBeGreaterThan(before + 80)

    // The design area shrinks to make room; nothing slides sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByRole('button', { name: 'Your panels' }).click()
    await yourPanels(page).getByRole('checkbox', { name: 'Layers' }).uncheck()
    await expect(layers(page)).toHaveCount(0)
    await yourPanels(page).getByRole('button', { name: 'Put back how it was' }).click()
    await expect(layers(page)).toBeVisible()
    await expect.poll(async () => Math.round((await layers(page).boundingBox())!.width)).toBe(Math.round(before))
    expect(await page.evaluate(() => localStorage.getItem('pixel-studio-panel-layout'))).toBeNull()

    // Escape closes the list and leaves the design alone.
    await page.keyboard.press('Escape')
    await expect(yourPanels(page)).toHaveCount(0)
  })

  test('the Menu search finds Your panels', async ({ page }) => {
    await startDesign(page)
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: 'What do you want to do?' })
    await search.fill('your panels')
    await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Your panels')
    await search.press('Enter')
    await expect(yourPanels(page)).toBeVisible()
  })
})
