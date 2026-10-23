import type { Page } from '@playwright/test'
import { clickAt, designPixel, drag, expectColor, newDesign, screenPoint, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

async function drawShape(page: Page, size: Size, type: string, from: [number, number], to: [number, number]) {
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: type, exact: true }).click()
  await drag(page, size, [from, to])
}

async function wrapAround(page: Page, way: string) {
  await page.getByRole('button', { name: 'Text around it' }).click()
  await page.getByRole('menuitemradio', { name: way }).click()
  await page.keyboard.press('Escape')
}

// How many ink pixels (dark) are in a part of the design.
function inkIn(page: Page, size: Size, x: number, y: number, width: number, height: number): Promise<number> {
  return page.evaluate(
    ([w, h, rx, ry, rw, rh]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      const data = canvas.getContext('2d')!.getImageData(left + Math.round(rx * dpr), top + Math.round(ry * dpr), Math.round(rw * dpr), Math.round(rh * dpr)).data
      let ink = 0
      for (let i = 0; i < data.length; i += 4) if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 100) ink++
      return ink
    },
    [size.width, size.height, x, y, width, height] as const,
  )
}

async function shot(page: Page, size: Size, x: number, y: number, width: number, height: number): Promise<string> {
  const corner = await screenPoint(page, size, x, y)
  const png = await page.screenshot({ clip: { x: corner.x, y: corner.y, width, height } })
  return png.toString('base64')
}

// How many pixels are ink in the first picture, and how many differ clearly between the two.
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

const ENGLISH =
  'Text flows around pictures and shapes, the way a magazine wraps its words around a photo. Every line keeps out of the circle and comes back to the full width below it.'

test('text flows around a circle, exactly as shown while typing, and follows it when it moves', async ({ page }) => {
  const size = await newDesign(page, 500, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await drawShape(page, size, 'Oval', [300, 60], [440, 200])
  await wrapAround(page, 'Its shape')
  expect(await undoLabel(page)).toContain('Text around it')

  await page.keyboard.press('t')
  await drag(page, size, [
    [40, 40],
    [460, 80],
  ])
  const box = typingBox(page)
  await expect(box).toBeFocused()
  await page.keyboard.insertText(ENGLISH)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('A second paragraph also flows around it.')
  const typed = (await box.boundingBox())!
  const height = Math.round(typed.height)
  expect(height).toBeGreaterThan(200)
  const whileTyping = await shot(page, size, 44, 44, 412, height - 8)

  await page.keyboard.press('Escape')
  await page.keyboard.press('b')
  await page.mouse.move(5, 5)
  const afterwards = await shot(page, size, 44, 44, 412, height - 8)
  const { ink, different } = await compareShots(page, whileTyping, afterwards)
  expect(ink).toBeGreaterThan(2000)
  expect(different / ink, `${different} of ${ink} ink pixels moved`).toBeLessThan(0.01)

  // No letters on the circle; text beside it on the left, and the full width again below it.
  expectColor(await designPixel(page, size, 370, 130), BLUE)
  expect(await inkIn(page, size, 300, 70, 140, 120)).toBe(0)
  expect(await inkIn(page, size, 40, 80, 240, 100)).toBeGreaterThan(200)
  expect(await inkIn(page, size, 300, 230, 150, 40)).toBeGreaterThan(50)

  // Moving the circle to the left side: the text now runs down its right. A click on the circle
  // picks it, even though it's inside the text's box.
  await page.keyboard.press('v')
  await clickAt(page, size, 495, 495)
  await drag(page, size, [
    [370, 130],
    [130, 130],
  ])
  expect(await inkIn(page, size, 70, 70, 120, 120)).toBe(0)
  expect(await inkIn(page, size, 220, 80, 230, 100)).toBeGreaterThan(200)

  // Off again: the text runs over it.
  await wrapAround(page, 'Off')
  expect(await inkIn(page, size, 70, 70, 120, 120)).toBeGreaterThan(100)
})

test('Hebrew flows around a box, and can stop above and go on below', async ({ page }) => {
  const size = await newDesign(page, 500, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await drawShape(page, size, 'Rectangle', [50, 90], [180, 170])
  await wrapAround(page, 'Its box')
  await page.keyboard.press('t')
  await drag(page, size, [
    [40, 40],
    [460, 80],
  ])
  const box = typingBox(page)
  await expect(box).toBeFocused()
  const hebrew = 'טקסט זורם סביב תמונות וצורות, כמו בעיתון. כל שורה נשמרת מחוץ למלבן, ומתחתיו חוזרת לרוחב המלא. מספרים כמו 1,234.56 ו-10:00 נשארים שלמים. '
  await page.keyboard.insertText(hebrew)
  const typed = (await box.boundingBox())!
  const height = Math.round(typed.height)
  const whileTyping = await shot(page, size, 44, 44, 412, height - 8)
  await page.keyboard.press('Escape')
  await page.keyboard.press('b')
  await page.mouse.move(5, 5)
  const afterwards = await shot(page, size, 44, 44, 412, height - 8)
  const { ink, different } = await compareShots(page, whileTyping, afterwards)
  expect(ink).toBeGreaterThan(2000)
  expect(different / ink, `${different} of ${ink} ink pixels moved`).toBeLessThan(0.01)
  expect(await inkIn(page, size, 50, 90, 130, 80)).toBe(0)
  expect(await inkIn(page, size, 220, 95, 230, 70)).toBeGreaterThan(200)

  // Above and below: nothing beside it.
  await page.keyboard.press('v')
  await clickAt(page, size, 495, 495)
  await clickAt(page, size, 115, 130)
  await wrapAround(page, 'Above and below')
  expect(await inkIn(page, size, 200, 95, 250, 70)).toBe(0)
  expect(await inkIn(page, size, 40, 180, 420, 60)).toBeGreaterThan(200)
})
