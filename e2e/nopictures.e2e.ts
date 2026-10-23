import { expect, test } from './setup.ts'
import type { Page } from '@playwright/test'

// The site itself shows no pictures: only the app icons are picture files, and nothing on the
// screen is a photo, illustration or background picture. Previews show the user's own work.
const ICONS = /\/(apple-touch-icon\.png|icon-192\.png|icon-512\.png|icon-maskable-512\.png|icon-maskable\.svg|icon\.svg)$/

async function picturesOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = []
    for (const el of document.querySelectorAll('img, picture, video, object, embed, iframe, image')) {
      found.push(`<${el.tagName.toLowerCase()}> ${el.getAttribute('src') ?? el.getAttribute('href') ?? ''}`)
    }
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(el, pseudo)
        for (const value of [style.backgroundImage, style.listStyleImage, style.borderImageSource, style.content, style.maskImage]) {
          if (value && value.includes('url(')) found.push(`${el.tagName.toLowerCase()}${pseudo ?? ''}: ${value.slice(0, 80)}`)
        }
      }
    }
    return found
  })
}

test('no pictures on the start screen or in a new design', async ({ page }) => {
  const downloaded: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && !ICONS.test(new URL(request.url()).pathname)) downloaded.push(request.url())
  })
  await page.reload()
  await expect(page.getByRole('button', { name: /Square post/ })).toBeVisible()
  expect(await picturesOnScreen(page), 'start screen').toEqual([])

  await page.getByRole('button', { name: /Square post/ }).click()
  await expect(page.getByRole('group', { name: 'Start here' })).toBeVisible()
  expect(await picturesOnScreen(page), 'new design').toEqual([])

  // The panels with previews draw them from the user's own work, never from a sample picture.
  await page.getByRole('group', { name: 'Start here' }).getByRole('button', { name: 'Add words' }).click()
  await page.keyboard.type('Hello')
  await page.keyboard.press('Escape')
  expect(await picturesOnScreen(page), 'with words on the page').toEqual([])

  expect(downloaded, 'pictures downloaded').toEqual([])
})
