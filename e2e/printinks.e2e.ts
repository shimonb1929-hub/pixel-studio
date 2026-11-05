import { newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

test('print inks show the color as four inks, and typing them changes the color', async ({ page }) => {
  await newDesign(page)
  await page.keyboard.press('b')
  const code = page.getByRole('textbox', { name: 'Color code' })
  await code.fill('FF0000')
  await code.press('Enter')
  await page.getByRole('button', { name: 'Print inks' }).click()
  await expect(page.getByRole('textbox', { name: 'Cyan ink' })).toHaveValue('0')
  await expect(page.getByRole('textbox', { name: 'Magenta ink' })).toHaveValue('100')
  await expect(page.getByRole('textbox', { name: 'Yellow ink' })).toHaveValue('100')
  await expect(page.getByRole('textbox', { name: 'Black ink' })).toHaveValue('0')

  // 100 cyan and nothing else is a bright blue-green.
  for (const [ink, value] of [['Cyan ink', '100'], ['Magenta ink', '0'], ['Yellow ink', '0']]) {
    const box = page.getByRole('textbox', { name: ink })
    await box.fill(value)
    await box.press('Enter')
  }
  await expect(code).toHaveValue('00FFFF')
})
