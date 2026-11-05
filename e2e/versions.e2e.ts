import type { Page } from '@playwright/test'
import { designPixel, drag, expectColor, INK, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]
const saveStatus = (page: Page) => page.locator('header').getByText(/^(Saving…|Saved|Not saved)$/)
const versionsDialog = (page: Page) => page.getByRole('dialog', { name: 'Earlier versions' })
const versionList = (page: Page) => versionsDialog(page).getByRole('radiogroup', { name: 'Earlier versions' }).getByRole('radio')

// Moves the page's clock on, so the design has been worked on for a while.
async function laterBy(page: Page, minutes: number) {
  await page.evaluate((ms) => (window as unknown as { shiftTime: (ms: number) => void }).shiftTime(ms), minutes * 60_000)
}

async function line(page: Page, size: Size, y: number) {
  await drag(page, size, [
    [50, y],
    [350, y],
  ])
}

// Waits for the design to be drawn with this color at a point.
async function shows(page: Page, size: Size, x: number, y: number, color: [number, number, number]) {
  await expect.poll(async () => (await designPixel(page, size, x, y)).slice(0, 3).every((v, i) => Math.abs(v - color[i]) <= 8)).toBe(true)
}

async function openVersions(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Earlier versions…' }).click()
  await expect(versionsDialog(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const realNow = Date.now.bind(Date)
    let shift = 0
    ;(window as unknown as { shiftTime: (ms: number) => void }).shiftTime = (ms) => (shift += ms)
    Date.now = () => realNow() + shift
  })
  await page.reload()
})

test('earlier versions are kept as you work, and you can go back to one and return again', async ({ page }) => {
  const size = await newDesign(page)
  await line(page, size, 100)
  await expect(saveStatus(page)).toHaveText('Saved')

  await laterBy(page, 11)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await line(page, size, 200)
  await expect(saveStatus(page)).toHaveText('Saved')
  expectColor(await designPixel(page, size, 200, 200), RED)

  await openVersions(page)
  await expect(versionList(page)).toHaveText(['Just now', '11 minutes ago'])
  // The newest is picked at first; another is picked with a click.
  await expect(versionList(page).first()).toHaveAttribute('aria-checked', 'true')
  await versionList(page).nth(1).click()
  await versionsDialog(page).getByRole('button', { name: 'Go back to this' }).click()
  await expect(versionsDialog(page)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Back to the earlier version (11 minutes ago)' })).toBeVisible()
  await shows(page, size, 200, 100, INK)
  expectColor(await designPixel(page, size, 200, 200), WHITE)

  // How it was a moment ago was kept too, so going back can be taken back.
  await openVersions(page)
  await expect(versionList(page)).toHaveText(['Just now', 'Just now', '11 minutes ago'])
  await versionsDialog(page).getByRole('button', { name: 'Go back to this' }).click()
  await shows(page, size, 200, 200, RED)

  // What came back is what the browser keeps: it is there after reopening.
  await page.reload()
  await page.getByRole('region', { name: 'Your designs' }).getByRole('button', { name: 'Open My design 1' }).click()
  await shows(page, size, 200, 200, RED)
})

test('a new design has no earlier versions yet', async ({ page }) => {
  await newDesign(page)
  await openVersions(page)
  await expect(versionsDialog(page)).toContainText('No earlier versions yet.')
  await expect(versionsDialog(page).getByRole('button', { name: 'Go back to this' })).toHaveAttribute('aria-disabled', 'true')
})
