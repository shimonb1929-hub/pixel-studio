import type { Page } from '@playwright/test'
import { newDesign, screenPoint } from './helpers.ts'
import { expect, test } from './setup.ts'

const pages = (page: Page) => page.getByRole('navigation', { name: 'Pages' })

async function pageMenu(page: Page, item: string) {
  await pages(page).getByRole('button', { name: 'Page options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

async function words(page: Page, kind: string, text: string) {
  await page.keyboard.press('t')
  await page.getByRole('button', { name: kind, exact: true }).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
}

test('a contents list of the headings and their pages, made again to update it', async ({ page }) => {
  // Six texts on three pages take a while to type.
  test.setTimeout(90_000)
  const size = await newDesign(page, 400, 300)
  await words(page, 'Heading', 'Welcome')
  await words(page, 'Body text', 'All the words of the first page, a long story told in small letters.')
  await pages(page).getByRole('button', { name: 'Add page' }).click()
  await words(page, 'Heading', 'Chapter two')
  await words(page, 'Body text', 'More words of the story on the second page, small like the others.')

  await pageMenu(page, 'Add a contents list')
  await expect(page.getByRole('button', { name: /^Layer: .*Contents list/ })).toBeVisible()
  await page.getByRole('button', { name: 'Arrange tool' }).click()
  const middle = await screenPoint(page, size, 200, 150)
  await page.mouse.dblclick(middle.x, middle.y)
  await expect(page.getByRole('textbox', { name: 'Type your text' })).toHaveText(/Welcome … 1\s*Chapter two … 2/)
  await page.keyboard.press('Escape')

  // A new page with a heading: making it again brings the list up to date.
  await pages(page).getByRole('button', { name: 'Add page' }).click()
  await words(page, 'Heading', 'The end')
  await words(page, 'Body text', 'The last words of the story, small letters again on the third page.')
  await pageMenu(page, 'Update the contents list')
  await expect(page.getByText('The contents list is up to date.')).toBeVisible()
  await pages(page).getByRole('button', { name: 'Page 2' }).click()
  await page.getByRole('button', { name: 'Arrange tool' }).click()
  await page.mouse.dblclick(middle.x, middle.y)
  await expect(page.getByRole('textbox', { name: 'Type your text' })).toHaveText(/Welcome … 1\s*Chapter two … 2\s*The end … 3/)
})
