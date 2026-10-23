import type { Page } from '@playwright/test'
import { clickAt, expectDesignSize, newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function startFromLayout(page: Page, name: string, colors?: string) {
  await page.getByRole('button', { name: /All layouts/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Ready layouts' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('option', { name }).click()
  if (colors) {
    await dialog.getByRole('radio', { name: colors }).click()
    await expect(dialog.getByRole('radio', { name: colors })).toHaveAttribute('aria-checked', 'true')
  }
  await dialog.getByRole('button', { name: 'Use this layout' }).click()
  await expect(dialog).toHaveCount(0)
}

test('a ready layout starts a design made only of shapes and words, each one editable', async ({ page }) => {
  // The start screen shows one of each kind, drawn from its own shapes and words.
  await expect(page.getByRole('img', { name: 'Preview of Classic frame' })).toBeVisible()
  await startFromLayout(page, 'Big news', 'Forest')
  await expectDesignSize(page, 2480, 3508)
  const names = await layerNames(page)
  expect(names).toContain('Big news!')
  expect(names).toContain('Fun for the whole family')
  expect(names.some((n) => /^Rectangle/.test(n))).toBe(true)

  // A text of the layout uses one of the design's text styles.
  await page.getByRole('button', { name: 'Layer: Big news!' }).click()
  const styles = page.getByRole('group', { name: 'Text styles' })
  await expect(styles.getByRole('button', { name: 'Title', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The layout's colors are the design's colors.
  await expect(page.getByRole('button', { name: "This design's color" })).toHaveCount(6)
})

test("a design's color changes everywhere at once, can be put back, and undone", async ({ page }) => {
  await startFromLayout(page, 'Big news')
  // Nothing is picked, so the Color panel colors the page, which is one of the design's colors.
  const code = page.getByRole('textbox', { name: 'Color code' })
  await expect(code).toHaveValue('F4F8FF')
  await page.getByRole('button', { name: 'Change it everywhere…' }).click()
  const changing = page.getByRole('group', { name: 'Changing a color everywhere' })
  await expect(changing).toBeVisible()
  await code.fill('ff0000')
  await code.press('Enter')
  await expect(code).toHaveValue('FF0000')
  await changing.getByRole('button', { name: 'Done' }).click()
  await expect(changing).toHaveCount(0)
  expect(await undoLabel(page)).toContain('Undo change color everywhere')
  await expect(code).toHaveValue('FF0000')

  // Trying another color and putting it back leaves the design as it was.
  await page.getByRole('button', { name: 'Change it everywhere…' }).click()
  await code.fill('0000ff')
  await code.press('Enter')
  await expect(code).toHaveValue('0000FF')
  await changing.getByRole('button', { name: 'Put back' }).click()
  await expect(code).toHaveValue('FF0000')

  await page.keyboard.press('Control+z')
  await expect(code).toHaveValue('F4F8FF')
})

test('a text style gives texts the same look, and changing it changes them all', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 40, 80)
  await page.keyboard.type('Hello')
  await page.keyboard.press('Escape')
  const styles = page.getByRole('group', { name: 'Text styles' })
  const sizeBox = page.getByRole('spinbutton', { name: 'Text size in pixels' })
  await sizeBox.fill('50')
  await styles.getByRole('button', { name: 'Save as a style' }).click()
  await expect(styles.getByRole('button', { name: 'Style 1' })).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('t')
  await clickAt(page, size, 40, 200)
  await page.keyboard.type('World')
  await page.keyboard.press('Escape')
  await expect(sizeBox).not.toHaveValue('50')
  await styles.getByRole('button', { name: 'Style 1' }).click()
  await expect(sizeBox).toHaveValue('50')
  expect(await undoLabel(page)).toContain('Undo use text style')

  // Changed by hand, the text offers to change the style to match: then both texts change.
  await sizeBox.fill('30')
  await expect(page.getByText('This text looks a little different from “Style 1” now.')).toBeVisible()
  await page.getByRole('button', { name: 'Update the style' }).click()
  await page.getByRole('button', { name: 'Layer: Hello' }).click()
  await expect(sizeBox).toHaveValue('30')
  await expect(styles.getByRole('button', { name: 'Style 1' })).toHaveAttribute('aria-pressed', 'true')
})
