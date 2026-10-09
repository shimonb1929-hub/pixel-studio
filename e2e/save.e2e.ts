import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { designPixel, drag, expectColor, INK, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const RED: [number, number, number] = [239, 68, 68]

const layerButtons = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / })

const saveStatus = (page: Page) => page.locator('header').getByText(/^(Saving…|Saved|Not saved)$/)
const welcome = (page: Page) => page.getByRole('heading', { name: 'What are you making today?' })
const yourDesigns = (page: Page) => page.getByRole('region', { name: 'Your designs' })

async function closeDesign(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
}

// An ink line across Layer 1, and a red line on a new layer above it.
async function drawTwoLayers(page: Page, size: Size) {
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])
  await page.getByRole('button', { name: 'New layer' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await drag(page, size, [
    [50, 200],
    [350, 200],
  ])
}

async function expectTwoLayers(page: Page, size: Size) {
  await expect(layerButtons(page)).toHaveText(['Layer 2', 'Layer 1', 'Background'])
  expectColor(await designPixel(page, size, 200, 100), INK)
  expectColor(await designPixel(page, size, 200, 200), RED)
  expectColor(await designPixel(page, size, 200, 150), WHITE)
}

test('designs are kept in the browser and come back with every layer', async ({ page }) => {
  const size = await newDesign(page)
  // A new design nobody has changed yet has nothing to keep.
  await expect(saveStatus(page)).toHaveCount(0)
  await drawTwoLayers(page, size)
  await expect(saveStatus(page)).toHaveText('Saved')
  await saveStatus(page).hover()
  await expect(page.getByRole('tooltip')).toContainText('kept in this browser')

  // Closing doesn't ask: the design is safe.
  await closeDesign(page)
  await expect(welcome(page)).toBeVisible()
  const card = yourDesigns(page).getByRole('button', { name: 'Open My design 1' })
  await expect(card).toContainText('Edited just now')

  await card.click()
  await expect(page.locator('header')).toContainText('My design 1')
  await expectTwoLayers(page, size)
  await expect(page.getByRole('button', { name: 'Layer: Layer 2' })).toHaveAttribute('aria-pressed', 'true')
  await expect(saveStatus(page)).toHaveText('Saved')
  // Undo starts fresh for the reopened design.
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-disabled', 'true')

  // Changes after reopening are kept in the same design, not a new one.
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await expect(saveStatus(page)).toHaveText('Saved')
  await closeDesign(page)
  await expect(yourDesigns(page).getByRole('listitem')).toHaveCount(1)
  await yourDesigns(page).getByRole('button', { name: 'Open My design 1' }).click()
  await expect(saveStatus(page)).toHaveText('Saved')
  expectColor(await designPixel(page, size, 200, 200), WHITE)
  expectColor(await designPixel(page, size, 200, 100), INK)
})

test('reloading the page keeps the design', async ({ page }) => {
  const size = await newDesign(page)
  await drawTwoLayers(page, size)
  await expect(saveStatus(page)).toHaveText('Saved')
  await page.reload()
  await yourDesigns(page).getByRole('button', { name: 'Open My design 1' }).click()
  await expectTwoLayers(page, size)
})

test('designs nobody changed are not added to the list', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  await closeDesign(page)
  await expect(welcome(page)).toBeVisible()
  await expect(yourDesigns(page)).toHaveCount(0)
  await expect(page.locator('img')).toHaveCount(0)
})

test('new designs get names that are not taken yet, even after a reload', async ({ page }) => {
  const squarePost = page.getByRole('button', { name: /^Square post 1080/ })
  await squarePost.click()
  await expect(page.getByText('1080 × 1080 px')).toBeVisible()
  // Fill the drawing layer, so there is something to keep.
  await page.keyboard.press('Alt+Backspace')
  await expect(saveStatus(page)).toHaveText('Saved')
  await closeDesign(page)
  await expect(yourDesigns(page).getByRole('listitem')).toHaveCount(1)
  await squarePost.click()
  await expect(page.locator('header')).toContainText('Square post 2')
  await closeDesign(page)

  const size = await newDesign(page)
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])
  await expect(saveStatus(page)).toHaveText('Saved')
  await page.reload()
  await page.getByRole('button', { name: /Custom size/ }).click()
  await expect(page.getByRole('dialog', { name: 'New design' }).getByLabel('Name')).toHaveValue('My design 2')
})

test('the newest design comes first, and designs can be renamed', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])
  await page.getByRole('button', { name: /Design name: My design 1/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename design' })
  await expect(dialog.getByLabel('Name')).toBeFocused()
  await dialog.getByLabel('Name').fill('  ')
  await expect(dialog).toContainText('Type a name.')
  await dialog.getByLabel('Name').fill('Birthday card')
  await dialog.getByLabel('Name').press('Enter')
  await expect(page.locator('header')).toContainText('Birthday card')
  await expect(saveStatus(page)).toHaveText('Saved')
  await closeDesign(page)

  const second = await newDesign(page)
  await drag(page, second, [
    [50, 200],
    [350, 200],
  ])
  await closeDesign(page)
  const cards = yourDesigns(page).getByRole('listitem')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('My design 2')
  await expect(cards.nth(1)).toContainText('Birthday card')

  // The download file name follows the new name.
  await cards.nth(1).getByRole('button', { name: 'Open Birthday card' }).click()
  await expect(page.locator('header')).toContainText('Birthday card')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('dialog', { name: 'Download your design' })).toContainText('Saves as Birthday card.png')
})

test('deleting a design from the start screen asks first', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    const size = await newDesign(page)
    await drag(page, size, [
      [50, 100],
      [350, 100],
    ])
    await closeDesign(page)
  }
  const cards = yourDesigns(page).getByRole('listitem')
  await expect(cards).toHaveCount(2)

  const remove = yourDesigns(page).getByRole('button', { name: 'Delete My design 1' })
  const confirm = page.getByRole('dialog', { name: 'Delete “My design 1”?' })
  await remove.click()
  await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Keep it' }).click()
  await expect(cards).toHaveCount(2)

  await remove.click()
  await confirm.getByRole('button', { name: 'Delete design' }).click()
  await expect(cards).toHaveCount(1)
  await page.reload()
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('My design 2')
})

test('a project file keeps every layer, and opens again with all of them', async ({ page }) => {
  const size = await newDesign(page)
  await drawTwoLayers(page, size)
  // Layer settings and the selection come back too.
  await page.getByRole('button', { name: 'Hide Layer 2' }).click()
  await page.getByRole('button', { name: 'Layer: Layer 1' }).click()
  const opacity = page.getByLabel('Layer opacity')
  await opacity.focus()
  for (let i = 0; i < 5; i++) await opacity.press('Shift+ArrowLeft')
  await expect(opacity).toHaveAttribute('aria-valuetext', '50%')
  await page.keyboard.press('Control+a')

  // "project" in the search finds the project download.
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('save project')
  await expect(page.getByRole('option').first()).toContainText('Download project')
  await page.getByRole('combobox').press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await expect(dialog.getByRole('radio', { name: 'Project' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog).toContainText('Saves as My design 1.pixel')
  await expect(dialog).toContainText(/About \d+ KB/)
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  expect(download.suggestedFilename()).toBe('My design 1.pixel')
  const bytes = readFileSync((await download.path())!)
  expect(bytes.subarray(0, 8).toString()).toBe('PXSTUDIO')

  await closeDesign(page)
  await expect(welcome(page)).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })
  await expect(page.locator('header')).toContainText('My design 1')
  // Opened files become designs of their own, kept once they change.
  await expect(saveStatus(page)).toHaveCount(0)
  await expectLayersBack(page, size)
  await expect(saveStatus(page)).toHaveText('Saved')
})

async function expectLayersBack(page: Page, size: Size) {
  await expect(layerButtons(page)).toHaveText(['Layer 2', 'Layer 1', 'Background'])
  await expect(page.getByRole('button', { name: 'Show Layer 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer: Layer 1' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Layer opacity')).toHaveAttribute('aria-valuetext', '50%')
  // Hidden red line, half-faded ink line.
  expectColor(await designPixel(page, size, 200, 200), WHITE)
  expectColor(await designPixel(page, size, 200, 100), [141, 142, 145], 10)
  await page.getByRole('button', { name: 'Show Layer 2' }).click()
  expectColor(await designPixel(page, size, 200, 200), RED)
  await expect(page.getByRole('menuitem', { name: 'Deselect' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Deselect' })).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
}

test('project files can be dropped onto the window', async ({ page }) => {
  const size = await newDesign(page)
  await drawTwoLayers(page, size)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const base64 = readFileSync((await download.path())!).toString('base64')
  await closeDesign(page)
  await expect(welcome(page)).toBeVisible()

  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'card.pixel'))
    const target = document.querySelector('main')!
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, base64)
  await expectTwoLayers(page, size)
})

test('damaged project files are explained', async ({ page }) => {
  const broken = Buffer.concat([Buffer.from('PXSTUDIO'), Buffer.from([200, 0, 0, 0]), Buffer.from('{"version":1,')])
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pixel', mimeType: '', buffer: broken })
  await expect(page.getByRole('alert')).toContainText("This project file is damaged, so it can't be opened.")
  await expect(welcome(page)).toBeVisible()
})

test('opening a project while a design is open keeps the open design', async ({ page }) => {
  const size = await newDesign(page)
  await drag(page, size, [
    [50, 100],
    [350, 100],
  ])
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)

  // Draw more, then open the file straight away: the newest drawing is kept first.
  await drag(page, size, [
    [50, 200],
    [350, 200],
  ])
  await page.locator('input[type=file]').setInputFiles({ name: 'copy.pixel', mimeType: '', buffer: bytes })
  // The opened copy hasn't changed, so it has nothing to keep yet.
  await expect(saveStatus(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expectColor(await designPixel(page, size, 200, 200), WHITE)
  await closeDesign(page)
  await expect(yourDesigns(page).getByRole('listitem')).toHaveCount(1)
  await yourDesigns(page).getByRole('button', { name: 'Open My design 1' }).click()
  await expect(saveStatus(page)).toHaveText('Saved')
  expectColor(await designPixel(page, size, 200, 200), INK)
})

test.describe('when the browser cannot keep designs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }))
    await page.reload()
  })

  test('it says so, closing asks first, and downloading counts as saved', async ({ page }) => {
    const size = await newDesign(page)
    await drag(page, size, [
      [50, 150],
      [350, 150],
    ])
    await expect(saveStatus(page)).toHaveText('Not saved')
    await saveStatus(page).hover()
    await expect(page.getByRole('tooltip')).toContainText('Download your design to keep it')

    const warning = page.getByRole('dialog', { name: 'Throw away your changes?' })
    await closeDesign(page)
    await expect(warning).toBeVisible()
    await expect(warning).toContainText("This browser can't keep designs.")
    await expect(warning.getByRole('button', { name: 'Keep editing' })).toBeFocused()
    await warning.getByRole('button', { name: 'Keep editing' }).click()
    await expect(page.getByText('400 × 300 px')).toBeVisible()

    await closeDesign(page)
    await warning.getByRole('button', { name: 'Throw away changes' }).click()
    await expect(welcome(page)).toBeVisible()

    // After downloading, closing doesn't ask.
    const again = await newDesign(page)
    await drag(page, again, [
      [50, 150],
      [350, 150],
    ])
    await page.keyboard.press('Control+s')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('My design 2.png')
    await closeDesign(page)
    await expect(welcome(page)).toBeVisible()
  })
})
