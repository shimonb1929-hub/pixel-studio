import { expect, test } from './setup.ts'

// The first minute, as someone who has never used a design program meets it.
test('an empty page says how to start, and the first step works', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  // A new design starts on Arrange, so a first click never paints by surprise.
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  const start = page.getByRole('group', { name: 'Start here' })
  await expect(start).toBeVisible()

  await start.getByRole('button', { name: 'Add words' }).click()
  const typing = page.getByRole('textbox', { name: 'Type your text' })
  await expect(typing).toBeFocused()
  await page.keyboard.type('Hello שלום')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / })).toHaveCount(1)
  // Once something is on the page, the start buttons are gone.
  await expect(start).toBeHidden()
})

test('the other start buttons pick a shape, the brush, or a photo', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  const start = page.getByRole('group', { name: 'Start here' })

  await start.getByRole('button', { name: 'Add a shape' }).click()
  await expect(page.getByRole('button', { name: 'Shapes tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(start).toBeHidden()

  await page.getByRole('button', { name: 'Arrange tool' }).click()
  await start.getByRole('button', { name: 'Draw' }).click()
  await expect(page.getByRole('button', { name: 'Brush tool' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Arrange tool' }).click()
  const chooser = page.waitForEvent('filechooser')
  await start.getByRole('button', { name: 'Add a photo' }).click()
  expect((await chooser).isMultiple()).toBe(false)

  // The tool column has its own Photo button too.
  const again = page.waitForEvent('filechooser')
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Add a photo' }).click()
  await again
})

test('search understands a whole sentence', async ({ page }) => {
  await page.getByRole('button', { name: /Square post/ }).click()
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'What do you want to do?' })
  await search.fill('background color')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Color the page')
  await search.fill('color of the text')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Text tool')
  await search.fill('photo in a circle')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Shapes tool')
})
