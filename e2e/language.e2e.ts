import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

const words = (lang: string): Record<string, string> => JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8'))

// The picker is called "Language: English", in whatever language is showing.
const PICKER = new RegExp(`^(${['Language', ...['he', 'yi', 'es', 'fr'].map((lang) => words(lang)['Language'])].join('|')}): `)

async function pickLanguage(page: Page, name: string) {
  await page.getByRole('button', { name: PICKER }).click()
  await page.getByRole('menuitemradio', { name }).click()
}

test('Hebrew turns the whole app right to left, and stays picked', async ({ page }) => {
  const he = words('he')
  await newDesign(page)
  await pickLanguage(page, 'עברית')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.getByRole('button', { name: he['{tool} tool'].replace('{tool}', he['Arrange']) })).toBeVisible()
  // The tool bar sits on the right side in a right-to-left layout.
  const dock = await page.getByRole('button', { name: he['{tool} tool'].replace('{tool}', he['Brush']) }).boundingBox()
  const width = page.viewportSize()!.width
  expect(dock!.x).toBeGreaterThan(width / 2)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await pickLanguage(page, 'English')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toBeVisible()
})

for (const [lang, name] of [['yi', 'אידיש'], ['es', 'Español'], ['fr', 'Français']] as const) {
  test(`${name} can be picked and the tools are named in it`, async ({ page }) => {
    const list = words(lang)
    await newDesign(page)
    await pickLanguage(page, name)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.getByRole('button', { name: list['{tool} tool'].replace('{tool}', list['Curve']) })).toBeVisible()
  })
}
