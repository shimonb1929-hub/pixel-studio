import { readFileSync } from 'node:fs'
import { newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

const words = (lang: string): Record<string, string> => JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8'))

test('Help finds the right tool by what you want, or by its pro name, and picks it', async ({ page }) => {
  await newDesign(page)
  await page.keyboard.press('F1')
  const help = page.getByRole('dialog', { name: 'Help' })
  await expect(help).toBeVisible()
  await expect(help.getByRole('heading', { name: 'Make a photo lighter or darker' })).toBeVisible()

  // Someone who knows Photoshop types the word they know.
  await help.getByLabel('Search help').fill('pen tool')
  await expect(help.getByRole('heading', { name: 'Curve', exact: true })).toBeVisible()
  await expect(help).toContainText('When to use it')
  await help.getByRole('button', { name: 'Use this tool' }).first().click()
  await expect(help).toBeHidden()
  await expect(page.getByRole('button', { name: 'Curve tool' })).toHaveAttribute('aria-pressed', 'true')

  // "Show me" on a goal picks its tool.
  await page.getByRole('button', { name: 'Help' }).click()
  await help.getByLabel('Search help').fill('spot')
  await help.getByRole('listitem').filter({ hasText: 'Remove a spot' }).getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByRole('button', { name: 'Fix spots tool' })).toHaveAttribute('aria-pressed', 'true')

  // The pro words list, and nothing found says so kindly.
  await page.keyboard.press('F1')
  await help.getByRole('tab', { name: 'Pro words' }).click()
  await expect(help.getByRole('row').filter({ hasText: 'Tracking' })).toContainText('Letter spacing')
  await help.getByLabel('Search help').fill('zzzz')
  await expect(help).toContainText('Nothing found for “zzzz”')
})

test('hover tips name the pro word, in every language', async ({ page }) => {
  await newDesign(page)
  await page.getByRole('button', { name: 'Curve tool' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Other programs call this Pen tool (Bézier paths).')

  // In Hebrew the plain word is Hebrew and the pro word stays as people learned it.
  const he = words('he')
  await page.getByRole('button', { name: /^Language: / }).click()
  await page.getByRole('menuitemradio', { name: 'עברית' }).click()
  await page.getByRole('button', { name: he['{tool} tool'].replace('{tool}', he['Select']) }).click()
  await page.getByRole('radio', { name: he['Freehand'] }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Lasso')
})
