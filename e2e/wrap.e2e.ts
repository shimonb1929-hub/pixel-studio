import type { Page } from '@playwright/test'
import { clickAt, compareShots, designPixel, drag, expectColor, inkIn, newDesign, shot, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const BLUE: [number, number, number] = [59, 91, 253]
const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  // A tip of a button that still has the keyboard can show too; read the Undo one.
  return page.getByRole('tooltip').filter({ hasText: /^Undo/ }).textContent()
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

const ENGLISH =
  'Text flows around pictures and shapes, the way a magazine wraps its words around a photo. Every line keeps out of the circle and comes back to the full width below it.'

test('text flows around a circle, exactly as shown while typing, and follows it when it moves', async ({ page }) => {
  const size = await newDesign(page, 500, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await drawShape(page, size, 'Oval', [300, 60], [440, 200])
  await wrapAround(page, 'Its shape')
  expect(await undoLabel(page)).toContain('Undo text around it')

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

test('a numbered list flows around a shape too, exactly as shown while typing', async ({ page }) => {
  const size = await newDesign(page, 500, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await drawShape(page, size, 'Rectangle', [40, 90], [170, 170])
  await wrapAround(page, 'Its box')
  await page.keyboard.press('t')
  await drag(page, size, [
    [40, 40],
    [460, 80],
  ])
  const box = typingBox(page)
  await expect(box).toBeFocused()
  await page.getByRole('region', { name: 'Text' }).getByRole('radio', { name: 'Numbers' }).click()
  await box.focus()
  await page.keyboard.insertText('Fresh bread every morning')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Soup of the day with a side of rice and salad')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Tea and cake')
  const typed = (await box.boundingBox())!
  const height = Math.round(typed.height)
  const whileTyping = await shot(page, size, 44, 44, 412, height - 8)
  await page.keyboard.press('Escape')
  await page.keyboard.press('b')
  await page.mouse.move(5, 5)
  const afterwards = await shot(page, size, 44, 44, 412, height - 8)
  const { ink, different } = await compareShots(page, whileTyping, afterwards)
  expect(ink).toBeGreaterThan(1000)
  expect(different / ink, `${different} of ${ink} ink pixels moved`).toBeLessThan(0.01)
  expect(await inkIn(page, size, 40, 90, 130, 80)).toBe(0)
})
