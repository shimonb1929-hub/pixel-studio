import type { Page } from '@playwright/test'
import { clickAt, drag, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()
const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// Where ink (anything not white) is in a part of the design: its left, right, top and bottom edges, in design pixels.
async function inkBounds(page: Page, size: Size, x: number, y: number, width: number, height: number) {
  return page.evaluate(
    ([w, h, rx, ry, rw, rh]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left + Math.round(rx * dpr), top + Math.round(ry * dpr), Math.round(rw * dpr), Math.round(rh * dpr))
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (let py = 0; py < data.height; py++) {
        for (let px = 0; px < data.width; px++) {
          const i = (py * data.width + px) * 4
          // Anything clearly darker or more colorful than the white paper.
          if (765 - data.data[i] - data.data[i + 1] - data.data[i + 2] > 240) {
            minX = Math.min(minX, px)
            maxX = Math.max(maxX, px)
            minY = Math.min(minY, py)
            maxY = Math.max(maxY, py)
          }
        }
      }
      if (minX === Infinity) return null
      return { left: rx + minX / dpr, right: rx + (maxX + 1) / dpr, top: ry + minY / dpr, bottom: ry + (maxY + 1) / dpr }
    },
    [size.width, size.height, x, y, width, height] as const,
  )
}

test('click to type English; it starts where you clicked and grows to the right', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await expect(page.getByRole('button', { name: 'Text tool' })).toHaveAttribute('aria-pressed', 'true')
  await clickAt(page, size, 60, 100)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.type('Hello')
  await expect(typingBox(page)).toHaveValue('Hello')
  await page.keyboard.press('Escape')
  await expect(typingBox(page)).toHaveCount(0)
  expect(await layerNames(page)).toEqual(['Hello'])
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')
  expect(await undoLabel(page)).toContain('Undo add text')
  const ink = await inkBounds(page, size, 0, 50, 400, 100)
  expect(ink).not.toBeNull()
  expect(ink!.left).toBeGreaterThanOrEqual(58)
  expect(ink!.left).toBeLessThan(70)
  expect(ink!.right).toBeGreaterThan(100)
})

test('Hebrew starts where you clicked and grows to the left', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 340, 100)
  await page.keyboard.type('שלום עולם')
  await page.keyboard.press('Escape')
  expect(await layerNames(page)).toEqual(['שלום עולם'])
  const ink = await inkBounds(page, size, 0, 50, 400, 100)
  expect(ink).not.toBeNull()
  expect(ink!.right).toBeLessThanOrEqual(342)
  expect(ink!.right).toBeGreaterThan(330)
  expect(ink!.left).toBeLessThan(280)
})

// A picture of part of the screen (in design pixels at 100%), compared in the page.
async function shot(page: Page, size: Size, x: number, y: number, width: number, height: number): Promise<string> {
  const corner = await screenPoint(page, size, x, y)
  const png = await page.screenshot({ clip: { x: corner.x, y: corner.y, width, height } })
  return png.toString('base64')
}

// How many pixels are ink in the first picture, and how many differ clearly between the two. On
// sharp screens, letters may be placed half a point apart (one screen pixel), which isn't a move.
async function compareShots(page: Page, a: string, b: string) {
  return page.evaluate(
    async ([first, second]) => {
      const pixels = async (data: string) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height }
      }
      const [pa, pb] = await Promise.all([pixels(first), pixels(second)])
      const light = (p: Uint8ClampedArray, i: number) => (p[i] + p[i + 1] + p[i + 2]) / 3
      const slack = Math.round(devicePixelRatio) - 1
      let ink = 0
      let different = 0
      for (let y = 0; y < pa.height; y++) {
        for (let x = 0; x < pa.width; x++) {
          const i = (y * pa.width + x) * 4
          const value = light(pa.data, i)
          if (value < 128) ink++
          let matched = false
          for (let dy = -slack; dy <= slack && !matched; dy++) {
            for (let dx = -slack; dx <= slack && !matched; dx++) {
              const bx = x + dx
              const by = y + dy
              if (bx < 0 || by < 0 || bx >= pb.width || by >= pb.height) continue
              if (Math.abs(value - light(pb.data, (by * pb.width + bx) * 4)) <= 96) matched = true
            }
          }
          if (!matched) different++
        }
      }
      return { ink, different }
    },
    [a, b] as const,
  )
}

test('what you see while typing is exactly what you get: Hebrew, Yiddish, English, numbers and punctuation', async ({ page }) => {
  const size = await newDesign(page, 500, 400)
  await page.addStyleTag({ content: 'textarea { caret-color: transparent !important; }' })
  await page.keyboard.press('t')
  // A paragraph box that wraps its lines.
  await drag(page, size, [
    [40, 40],
    [460, 80],
  ])
  const box = typingBox(page)
  await expect(box).toBeFocused()
  await page.keyboard.insertText('מבצע 50% הנחה! על כל המוצרים (עד יום ראשון) — Sale ends Sunday, 10:00. iPhone חדש ב-₪3,999')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('װאָס מאַכסטו? אַ גוטן טאָג, ייִדן!')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('English stays left to right: "quotes", (brackets) and 1-800-555.')
  const typed = (await box.boundingBox())!
  const height = Math.round(typed.height)
  expect(height).toBeGreaterThan(100)
  const whileTyping = await shot(page, size, 44, 44, 412, height - 8)

  await page.keyboard.press('Escape')
  await page.keyboard.press('b')
  await page.mouse.move(5, 5)
  await expect(page.getByRole('toolbar')).toContainText('Brush')
  const afterwards = await shot(page, size, 44, 44, 412, height - 8)
  const { ink, different } = await compareShots(page, whileTyping, afterwards)
  expect(ink).toBeGreaterThan(2000)
  expect(different / ink, `${different} of ${ink} ink pixels moved`).toBeLessThan(0.01)
})

const textPanel = (page: Page) => page.getByRole('region', { name: 'Text' })

// The size the Arrange bar shows for the picked object.
async function arrangedSize(page: Page): Promise<{ width: number; height: number }> {
  const text = (await page.getByRole('toolbar').textContent()) ?? ''
  const match = /(\d+) × (\d+) px/.exec(text)
  if (!match) throw new Error(`no size in "${text}"`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

test('a quick heading starts with its words picked; typing replaces them and it stays centered', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await page.getByRole('button', { name: 'Heading', exact: true }).click()
  const box = typingBox(page)
  await expect(box).toHaveValue('Your heading')
  expect(await box.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 12])
  // Letters that are also tool shortcuts just type.
  await page.keyboard.type('Move the big text')
  await expect(box).toHaveValue('Move the big text')
  await expect(page.getByRole('button', { name: 'Text tool' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  expect((await layerNames(page))[0]).toBe('Move the big text')
  const ink = (await inkBounds(page, size, 0, 0, 400, 300))!
  expect(Math.abs((ink.left + ink.right) / 2 - 200)).toBeLessThan(4)
})

test('click text to change it, double-click it with Arrange, and taking every letter out removes it', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 60, 100)
  await page.keyboard.type('Hello')
  await page.keyboard.press('Escape')

  // Double-click with Arrange puts the cursor where you clicked.
  const point = await screenPoint(page, size, 100, 100)
  await page.mouse.dblclick(point.x, point.y)
  await expect(typingBox(page)).toHaveValue('Hello')
  await page.keyboard.press('End')
  await page.keyboard.type(' world')
  await page.keyboard.press('Escape')
  expect(await layerNames(page)).toEqual(['Hello world'])
  expect(await undoLabel(page)).toContain('Undo edit text')

  // With the Text tool, a click on the text edits it.
  await page.keyboard.press('t')
  await clickAt(page, size, 80, 100)
  await expect(typingBox(page)).toHaveValue('Hello world')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  expect(await layerNames(page)).toEqual([])
  expect(await undoLabel(page)).toContain('Undo delete text')

  // Clicking and typing nothing leaves nothing behind.
  await page.keyboard.press('t')
  await clickAt(page, size, 200, 200)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await layerNames(page)).toEqual([])
})

test('the Text panel: size, boldness, font, color, lining up and reading direction', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 100, 100)
  await page.keyboard.type('iPhone')
  await page.keyboard.insertText(' חדש')
  await page.keyboard.press('Escape')
  await expect(textPanel(page)).toBeVisible()
  // Starts with an English word, so it reads left to right until told otherwise.
  const before = (await inkBounds(page, size, 0, 50, 400, 100))!
  expect(before.left).toBeGreaterThan(98)
  expect(before.left).toBeLessThan(106)

  await textPanel(page).getByRole('radio', { name: 'Right to left' }).click()
  await expect(textPanel(page).getByRole('radio', { name: 'Right to left' })).toHaveAttribute('aria-checked', 'true')
  expect(await undoLabel(page)).toContain('Undo reading direction')
  // Now it lines up on the right, and the Hebrew word comes first, on the right.
  await expect(textPanel(page).getByRole('radio', { name: 'Line up right' })).toHaveAttribute('aria-checked', 'true')

  await textPanel(page).getByLabel('Text size in pixels').fill('60')
  await expect(page.getByRole('toolbar')).toContainText('× 72 px')
  const boldness = textPanel(page).getByRole('slider', { name: 'Boldness' })
  await boldness.focus()
  await page.keyboard.press('Home')
  await expect(boldness).toHaveAttribute('aria-valuetext', 'Thin')

  await textPanel(page).getByRole('button', { name: 'Font: Heebo' }).click()
  await textPanel(page).getByRole('radio', { name: 'Yiddish' }).click()
  await expect(textPanel(page).getByRole('option', { name: 'Pacifico' })).toHaveCount(0)
  await textPanel(page).getByRole('option', { name: 'Frank Ruhl Libre' }).click()
  await expect(textPanel(page).getByRole('button', { name: 'Font: Frank Ruhl Libre' })).toBeVisible()
  expect(await undoLabel(page)).toContain('Undo change font')

  await textPanel(page).getByRole('radio', { name: 'Center' }).click()
  await expect(textPanel(page).getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: 'Red', exact: true }).click()
  expect(await undoLabel(page)).toContain('Undo text color')
})

test('fonts are found by what they are for, shown on the page while pointed at, and remembered', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 300, 100)
  await page.keyboard.insertText('בראשית ברא')
  await page.keyboard.press('Escape')
  const ink = () => inkBounds(page, size, 0, 0, 800, 300)
  await expect.poll(ink).not.toBeNull()
  const before = await ink()

  await textPanel(page).getByRole('button', { name: /^Font:/ }).click()
  // The text is Hebrew, so the list starts with fonts that can write it.
  await expect(textPanel(page).getByRole('radio', { name: 'Hebrew' })).toHaveAttribute('aria-checked', 'true')
  await textPanel(page).getByRole('radio', { name: 'Torah & seforim' }).click()
  await expect(textPanel(page).getByRole('option', { name: 'Taamey Frank CLM' })).toBeVisible()
  await expect(textPanel(page).getByRole('option', { name: 'Pacifico' })).toHaveCount(0)

  // Pointing at a font shows it on the page; moving away puts the text back, and nothing is kept.
  await textPanel(page).getByRole('option', { name: 'Stam Ashkenaz CLM' }).hover()
  await expect.poll(ink).not.toEqual(before)
  await page.mouse.move(5, 5)
  await expect.poll(ink).toEqual(before)
  expect(await undoLabel(page)).not.toContain('font')

  await textPanel(page).getByRole('option', { name: 'Taamey Frank CLM' }).click()
  await expect(textPanel(page).getByRole('button', { name: 'Font: Taamey Frank CLM' })).toBeVisible()
  expect(await undoLabel(page)).toContain('Undo change font')

  // The font just used is offered again, and a word finds fonts by what they're for.
  await textPanel(page).getByRole('button', { name: /^Font:/ }).click()
  await expect(textPanel(page).getByRole('button', { name: 'Use Taamey Frank CLM again' })).toBeVisible()
  await textPanel(page).getByLabel('Find a font').fill('wedding')
  await expect(textPanel(page).getByRole('option', { name: 'Great Vibes' })).toBeVisible()
})

test('Hebrew in a font made only for English shows in a Hebrew font, and the panel says so', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 300, 100)
  await page.keyboard.insertText('שלום')
  await page.keyboard.press('Escape')
  await textPanel(page).getByRole('button', { name: /^Font:/ }).click()
  await textPanel(page).getByRole('radio', { name: 'All' }).click()
  await textPanel(page).getByLabel('Find a font').fill('pacif')
  await textPanel(page).getByRole('option', { name: 'Pacifico' }).click()
  await expect(textPanel(page).getByRole('note')).toContainText('Pacifico has no Hebrew letters')
  expect(await inkBounds(page, size, 0, 50, 400, 100)).not.toBeNull()
})

test('corners make text bigger; side handles make it wrap', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 50, 100)
  await page.keyboard.type('Hello there friends')
  await page.keyboard.press('Escape')
  const start = await arrangedSize(page)
  // The text's box: its left edge where it was clicked, its first line centered on the click.
  const right = 50 + start.width
  const bottom = 100 + start.height / 2
  await drag(page, size, [
    [right, bottom],
    [50 + start.width * 1.5, 100 - start.height / 2 + start.height * 1.5],
  ])
  await expect(textPanel(page).getByLabel('Text size in pixels')).toHaveValue('36')
  const bigger = await arrangedSize(page)
  expect(bigger.height).toBeGreaterThan(start.height * 1.4)

  // Pull the right side in: the words wrap onto more lines.
  const box = (await inkBounds(page, size, 0, 0, 400, 300))!
  await drag(page, size, [
    [50 + bigger.width, (box.top + box.bottom) / 2],
    [50 + bigger.width * 0.5, (box.top + box.bottom) / 2],
  ])
  await expect(textPanel(page).getByRole('button', { name: 'Wrap in a box' })).toHaveAttribute('aria-pressed', 'true')
  const wrapped = await arrangedSize(page)
  expect(wrapped.height).toBeGreaterThan(bigger.height * 1.5)
})

test('Yiddish with its vowel points types and is kept', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 350, 150)
  await page.keyboard.insertText('אַ גוטן טאָג, װאָס מאַכסטו?')
  await expect(typingBox(page)).toHaveValue('אַ גוטן טאָג, װאָס מאַכסטו?')
  await page.keyboard.press('Escape')
  expect((await layerNames(page))[0]).toBe('אַ גוטן טאָג, װאָס מאַכסטו?')
  const ink = (await inkBounds(page, size, 0, 100, 400, 100))!
  expect(ink.right).toBeLessThanOrEqual(352)
})

test('text comes back from a project file with its font, direction and color', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 340, 120)
  await page.keyboard.insertText('שבת שלום, Shabbat!')
  await page.keyboard.press('Escape')
  await textPanel(page).getByRole('button', { name: /^Font:/ }).click()
  await textPanel(page).getByLabel('Find a font').fill('frank')
  await textPanel(page).getByRole('option', { name: 'Frank Ruhl Libre' }).click()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  // The design is drawn again once the new font is in; measure it after it has settled.
  let inkBefore: Awaited<ReturnType<typeof inkBounds>> = null
  await expect
    .poll(async () => {
      const last = inkBefore
      inkBefore = await inkBounds(page, size, 0, 60, 400, 120)
      return !!last && JSON.stringify(last) === JSON.stringify(inkBefore)
    })
    .toBe(true)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Download project…' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Download your design' }).getByRole('button', { name: 'Download' }).click(),
  ])
  const { readFileSync } = await import('node:fs')
  const bytes = readFileSync((await download.path())!)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'card.pixel', mimeType: '', buffer: bytes })

  await expect(page.locator('header')).toContainText('My design 1')
  expect((await layerNames(page))[0]).toBe('שבת שלום, Shabbat!')
  // The font loads again first, which can take a moment on a busy computer.
  await expect
    .poll(
      async () => {
        const ink = await inkBounds(page, size, 0, 60, 400, 120)
        return ink && inkBefore && Math.max(Math.abs(ink.left - inkBefore.left), Math.abs(ink.right - inkBefore.right), Math.abs(ink.top - inkBefore.top))
      },
      { timeout: 15000 },
    )
    .toBeLessThanOrEqual(1)
  await page.keyboard.press('v')
  await page.getByRole('button', { name: 'Layer: \u2068שבת שלום, Shabbat!\u2069' }).click()
  await expect(textPanel(page).getByRole('button', { name: 'Font: Frank Ruhl Libre' })).toBeVisible()
})

test('while typing, picking a font and pressing Backspace never deletes the text', async ({ page }) => {
  const size = await newDesign(page)
  await page.keyboard.press('t')
  await clickAt(page, size, 60, 100)
  await page.keyboard.type('Keep me')
  await textPanel(page).getByRole('button', { name: /^Font:/ }).click()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('ArrowLeft')
  await expect(typingBox(page)).toHaveValue('Keep me')
  await page.keyboard.press('Escape')
  await expect(typingBox(page)).toHaveCount(0)
  expect(await layerNames(page)).toEqual(['Keep me'])
})
