import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, designPixel, expectColor, newDesign, WHITE, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

// A drawn logo: a black ring and a red square on cream paper. No people, just shapes.
const PAPER: [number, number, number] = [250, 240, 200]
const RED: [number, number, number] = [220, 30, 30]
const BLACK: [number, number, number] = [0, 0, 0]

async function addLogo(page: Page) {
  const base64 = await page.evaluate(async () => {
    // Small enough to be added at its real size, centered: it covers 40-360 across, 30-270 down.
    const canvas = new OffscreenCanvas(320, 240)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#faf0c8'
    ctx.fillRect(0, 0, 320, 240)
    // On the design, the ring is around 140, 150: from 45 to 85 away from its middle.
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(100, 120, 85, 0, Math.PI * 2)
    ctx.arc(100, 120, 45, 0, Math.PI * 2, true)
    ctx.fill()
    // On the design, the square covers 260-320 across and 120-180 down.
    ctx.fillStyle = '#dc1e1e'
    ctx.fillRect(220, 90, 60, 60)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Add a photo…' }).click()
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Layer: logo' })).toBeVisible()
}

async function openTrace(page: Page, size: Size) {
  await page.keyboard.press('v')
  await clickAt(page, size, 200, 60)
  await page.getByRole('button', { name: 'Turn into shapes' }).click()
  const dialog = page.getByRole('dialog', { name: 'Turn into shapes' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

test('a picture turns into sharp shapes over it, as one undo step', async ({ page }) => {
  const size = await newDesign(page)
  await addLogo(page)
  expectColor(await designPixel(page, size, 200, 60), PAPER)
  const dialog = await openTrace(page, size)

  // The preview shows the shapes first: the black and the red, without the cream paper.
  await expect(dialog.getByRole('status')).toHaveText('2 colors')
  // Nothing has changed on the design yet.
  expectColor(await designPixel(page, size, 200, 60), PAPER)

  await dialog.getByRole('button', { name: 'Turn into shapes' }).click()
  await expect(dialog).toBeHidden()

  // The shapes sit exactly where the picture was; the paper was left out, so the white page shows.
  await expect.poll(async () => (await designPixel(page, size, 200, 60))[2]).toBeGreaterThan(250)
  expectColor(await designPixel(page, size, 200, 60), WHITE)
  expectColor(await designPixel(page, size, 140, 150), WHITE) // the ring's hole
  expectColor(await designPixel(page, size, 140, 85), BLACK) // the ring
  expectColor(await designPixel(page, size, 75, 150), BLACK)
  expectColor(await designPixel(page, size, 290, 150), RED)
  expectColor(await designPixel(page, size, 330, 150), WHITE)

  // They're kept together, named plainly, and the picture is still there, hidden.
  await expect(page.getByRole('button', { name: /Traced picture/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer: logo' })).toBeVisible()
  expect(await undoLabel(page)).toMatch(/^Undo turn into shapes/)

  // The SVG download has them as real shapes, the ring with its hole.
  await page.getByRole('button', { name: /What do you want to do/ }).click()
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('svg')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Download as SVG')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  const download = page.getByRole('dialog', { name: 'Download your design' })
  const [file] = await Promise.all([page.waitForEvent('download'), download.getByRole('button', { name: 'Download' }).click()])
  const svg = readFileSync((await file.path())!, 'utf8')
  expect(svg).toContain('fill-rule="evenodd"')
  expect(svg).toContain('fill="#000000"')
  expect(svg).toContain('fill="#dc1e1e"')
  expect(svg).not.toContain('<image')

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await designPixel(page, size, 200, 60))[2]).toBeLessThan(220)
  expectColor(await designPixel(page, size, 200, 60), PAPER)
  await expect(page.getByRole('button', { name: /Traced picture/ })).toHaveCount(0)
})

test('Black & white makes one ink shape, and Esc leaves everything as it was', async ({ page }) => {
  const size = await newDesign(page)
  await addLogo(page)
  const dialog = await openTrace(page, size)
  await dialog.getByRole('radio', { name: 'Black & white' }).click()
  // The red is dark enough to count as ink too.
  await expect(dialog.getByRole('status')).toHaveText('1 color')
  await dialog.getByText('Leave out the background').click()
  await expect(dialog.getByRole('status')).toHaveText('2 colors')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expectColor(await designPixel(page, size, 200, 60), PAPER)
  await expect(page.getByRole('button', { name: /Traced picture/ })).toHaveCount(0)

  // Found by searching too, with the pro word.
  await page.getByRole('button', { name: /What do you want to do/ }).click()
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('image trace')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Turn into shapes')
})
