import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, drag, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// A photo inside words, and softly fading parts of things away.

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const textPanel = (page: Page) => page.getByRole('region', { name: 'Text', exact: false }).filter({ has: page.getByRole('radiogroup', { name: 'Letter color' }) })
const fadePanel = (page: Page) => page.getByRole('region', { name: 'Fade' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// A 200 × 100 photo: red on the left, green on the right.
async function photo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(200, 100)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(100, 0, 100, 100)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  return Buffer.from(base64, 'base64')
}

async function dropPhoto(page: Page, size: Size, x: number, y: number, buffer: Buffer) {
  const point = await screenPoint(page, size, x, y)
  await page.evaluate(
    ([data, clientX, clientY]) => {
      const bytes = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'beach.png', { type: 'image/png' }))
      const target = document.querySelector('main')!
      for (const type of ['dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: clientX as number, clientY: clientY as number }))
      }
    },
    [buffer.toString('base64'), point.x, point.y] as const,
  )
}

// How many screen pixels in a part of the design are about this color.
function countColor(page: Page, size: Size, area: [number, number, number, number], color: [number, number, number]): Promise<number> {
  return page.evaluate(
    async ([w, h, x, y, aw, ah, r, g, b]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left + Math.floor(x * dpr), top + Math.floor(y * dpr), Math.floor(aw * dpr), Math.floor(ah * dpr)).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) < 12 && Math.abs(data[i + 1] - g) < 12 && Math.abs(data[i + 2] - b) < 12) count++
      return count
    },
    [size.width, size.height, ...area, ...color],
  )
}

async function reopen(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await expect(page.getByRole('main').locator('canvas:not([data-preview])')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'My design 1.pixel', mimeType: '', buffer: bytes })
  await expect(page.locator('header')).toContainText('My design 1')
}

const RED: [number, number, number] = [239, 68, 68]
const GREEN: [number, number, number] = [34, 197, 94]
const BLUE: [number, number, number] = [59, 91, 253]

test('drop a photo onto words: it shows through the letters, slides, and comes back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await page.getByRole('button', { name: 'Heading', exact: true }).click()
  await page.keyboard.type('HHHH')
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  const size72 = textPanel(page).getByRole('slider', { name: 'Size' })
  await size72.focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await size72.blur()

  await dropPhoto(page, size, 200, 150, await photo(page))
  await expect(page.getByRole('status').filter({ hasText: 'The photo shows through the letters' })).toBeVisible()
  expect(await undoLabel(page)).toContain('Undo put photo in letters')
  expect(await layerNames(page)).toEqual(['HHHH'])
  // The left letters show the red half of the photo, the right ones the green half, and between
  // the letters the page stays white.
  expect(await countColor(page, size, [0, 0, 200, 300], RED)).toBeGreaterThan(200)
  expect(await countColor(page, size, [200, 0, 200, 300], GREEN)).toBeGreaterThan(200)
  expect(await countColor(page, size, [0, 0, 400, 300], [27, 29, 35])).toBe(0)

  await expect(textPanel(page).getByRole('radio', { name: 'Photo' })).toHaveAttribute('aria-checked', 'true')
  const zoom = textPanel(page).getByRole('slider', { name: 'Photo size' })
  await zoom.focus()
  await page.keyboard.press('End')
  await expect(zoom).toHaveAttribute('aria-valuetext', '400%')
  await zoom.blur()
  await textPanel(page).getByRole('button', { name: 'Move photo', exact: true }).click()
  await drag(page, size, [
    [200, 150],
    [300, 150],
  ])
  expect(await undoLabel(page)).toContain('Undo move photo')
  // Slid to the right, the red half now fills all the letters.
  expect(await countColor(page, size, [200, 0, 200, 300], GREEN)).toBeLessThan(20)

  await reopen(page)
  await expect.poll(() => layerNames(page)).toEqual(['HHHH'])
  await expect.poll(() => countColor(page, size, [200, 0, 200, 300], RED)).toBeGreaterThan(200)
  expect(await countColor(page, size, [0, 0, 400, 300], GREEN)).toBeLessThan(20)

  // Picking Color again takes the photo out.
  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await textPanel(page).getByRole('radio', { name: 'Color' }).click()
  expect(await countColor(page, size, [0, 0, 400, 300], RED)).toBe(0)
  expect(await undoLabel(page)).toContain('Undo remove photo')
})

test('Fade: a ready-made fade, brushing parts away and back, and it all comes back from a project file', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  await drag(page, size, [
    [50, 50],
    [350, 250],
  ])
  const solid = await designPixel(page, size, 200, 240)
  expect(solid.slice(0, 3)).toEqual(BLUE)

  await page.keyboard.press('f')
  await expect(page.getByRole('button', { name: 'Fade tool' })).toHaveAttribute('aria-pressed', 'true')
  // Pointing at a ready-made fade shows it before it's chosen.
  await fadePanel(page).getByRole('button', { name: 'Fade bottom' }).hover()
  await expect.poll(async () => (await designPixel(page, size, 200, 245))[0]).toBeGreaterThan(200)
  await page.mouse.move(5, 5)
  await expect.poll(async () => (await designPixel(page, size, 200, 245))[0]).toBe(BLUE[0])
  await fadePanel(page).getByRole('button', { name: 'Fade bottom' }).click()
  expect(await undoLabel(page)).toContain('Undo fade bottom')
  // Faded away at the bottom, softly in between, and untouched at the top.
  expect((await designPixel(page, size, 200, 248))[0]).toBeGreaterThan(220)
  const middle = (await designPixel(page, size, 200, 200))[0]
  expect(middle).toBeGreaterThan(BLUE[0] + 10)
  expect(middle).toBeLessThan(230)
  expect((await designPixel(page, size, 200, 60)).slice(0, 3)).toEqual(BLUE)
  await expect(page.getByRole('button', { name: 'Change what is faded on Rectangle 1' })).toBeVisible()

  // Brushing across the top fades it there too.
  await drag(page, size, [
    [80, 80],
    [320, 80],
  ])
  expect(await undoLabel(page)).toContain('Undo fade part')
  expect((await designPixel(page, size, 200, 80))[0]).toBeGreaterThan(220)

  // Bring back shows it again, just as it was.
  await page.getByRole('radio', { name: 'Bring back' }).click()
  await drag(page, size, [
    [80, 80],
    [320, 80],
  ])
  expect((await designPixel(page, size, 200, 80)).slice(0, 3)).toEqual(BLUE)
  expect(await undoLabel(page)).toContain('Undo bring back part')

  // Moving the shape moves what's faded with it.
  await page.keyboard.press('v')
  await drag(page, size, [
    [200, 100],
    [200, 60],
  ])
  expect((await designPixel(page, size, 200, 208))[0]).toBeGreaterThan(220)

  await reopen(page)
  await expect.poll(() => layerNames(page)).toEqual(['Rectangle 1'])
  await expect.poll(async () => (await designPixel(page, size, 200, 208))[0]).toBeGreaterThan(220)
  expect((await designPixel(page, size, 200, 40)).slice(0, 3)).toEqual(BLUE)

  await page.getByRole('button', { name: 'Change what is faded on Rectangle 1' }).click()
  await expect(page.getByRole('button', { name: 'Fade tool' })).toHaveAttribute('aria-pressed', 'true')
  await fadePanel(page).getByRole('button', { name: 'Show all of it again' }).click()
  expect((await designPixel(page, size, 200, 205)).slice(0, 3)).toEqual(BLUE)
  await expect(page.getByRole('button', { name: 'Change what is faded on Rectangle 1' })).toHaveCount(0)
})

test('Fade with nothing picked says what to do first', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('f')
  await expect(fadePanel(page)).toContainText('Pick a photo, a shape or some words first')
  await drag(page, size, [
    [100, 100],
    [200, 100],
  ])
  await expect(page.getByRole('alert').filter({ hasText: 'Pick a photo, a shape or some words first' })).toBeVisible()
})

test('a photo on the design goes inside the shape under it with one click, right where it was', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Oval', exact: true }).click()
  await drag(page, size, [
    [100, 50],
    [300, 250],
  ])
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'beach.png', mimeType: 'image/png', buffer: await photo(page) })
  await expect(page.getByRole('button', { name: 'Layer: beach' })).toBeVisible()

  await page.getByRole('toolbar').getByRole('button', { name: 'Put inside' }).click()
  expect(await layerNames(page)).toEqual(['Oval 1'])
  expect(await undoLabel(page)).toContain('Undo put photo in shape')
  // Enlarged just enough to fill the oval, around where it was: red on the left, green on the right,
  // and nothing outside the oval.
  expect((await designPixel(page, size, 150, 150)).slice(0, 3)).toEqual(RED)
  expect((await designPixel(page, size, 250, 150)).slice(0, 3)).toEqual(GREEN)
  expect((await designPixel(page, size, 105, 55)).slice(0, 3)).toEqual([255, 255, 255])
  await expect(page.getByRole('region', { name: 'Shape' }).getByRole('slider', { name: 'Photo size' })).toBeVisible()
})
