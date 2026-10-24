import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickAt, compareShots, inkIn, newDesign, shot, type Size } from './helpers.ts'
import { expect, test } from './setup.ts'

const typingBox = (page: Page) => page.getByRole('textbox', { name: 'Type your text' })
const tablePanel = (page: Page) => page.getByRole('region', { name: 'Table' })

async function undoLabel(page: Page) {
  await page.mouse.move(5, 5)
  await page.getByRole('button', { name: 'Undo', exact: true }).hover()
  return page.getByRole('tooltip').textContent()
}

// Types the cells one after another, with Tab between them.
async function typeCells(page: Page, cells: string[]) {
  for (const [i, cell] of cells.entries()) {
    if (i > 0) await page.keyboard.press('Tab')
    await page.keyboard.insertText(cell)
  }
}

async function addTable(page: Page) {
  await page.keyboard.press('t')
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(typingBox(page)).toBeFocused()
}

// Where the table is, as the Arrange bar's Size and place box shows it.
async function tableArea(page: Page, size: Size) {
  await page.keyboard.press('v')
  await clickAt(page, size, size.width / 2, size.height / 2)
  await page.getByRole('toolbar').getByRole('button', { name: 'Size and place' }).click()
  const box = page.getByRole('dialog', { name: 'Size and place' })
  const field = async (name: string) => Number(await box.getByLabel(name, { exact: true }).inputValue())
  const area = { x: await field('From the left'), y: await field('From the top'), width: await field('Width'), height: await field('Height') }
  await page.getByRole('toolbar').getByRole('button', { name: 'Size and place' }).click()
  await expect(box).toBeHidden()
  return area
}

// The table while a cell is typed in (in the typing box), and then as kept on the design.
async function typedMatchesKept(page: Page, size: Size, area: { x: number; y: number; width: number; height: number }) {
  // Only the words: the dashed frame around the cell being typed in isn't part of the design.
  const hide = await page.addStyleTag({ content: 'main canvas[aria-label] { opacity: 0 !important; }' })
  const inside = { x: Math.round(area.x) + 2, y: Math.round(area.y) + 2, width: Math.round(area.width) - 4, height: Math.round(area.height) - 4 }
  const whileTyping = await shot(page, size, inside.x, inside.y, inside.width, inside.height)
  await page.keyboard.press('Escape')
  await page.keyboard.press('b')
  await page.mouse.move(5, 5)
  const afterwards = await shot(page, size, inside.x, inside.y, inside.width, inside.height)
  await hide.evaluate((tag) => tag.remove())
  const { ink, different } = await compareShots(page, whileTyping, afterwards)
  expect(ink).toBeGreaterThan(300)
  expect(different / ink, `${different} of ${ink} ink pixels moved`).toBeLessThan(0.01)
}

test('a price list: type cell by cell with Tab, it looks the same once kept, and undo takes it back', async ({ page }) => {
  const size = await newDesign(page, 600, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await addTable(page)
  await expect(tablePanel(page)).toContainText('4 rows')
  await expect(tablePanel(page)).toContainText('3 columns')
  await typeCells(page, ['Dish', 'Price', 'Notes', 'Soup of the day with fresh bread and a side salad', '$4.50', 'Hot', 'Apple cake', '$3', 'Sweet'])
  await page.keyboard.press('Escape')
  expect(await undoLabel(page)).toMatch(/edit table/i)

  const area = await tableArea(page, size)
  expect(area.width).toBe(420)
  // The long words wrap in their cell, and their row grows to fit them.
  expect(area.height).toBeGreaterThan(150)
  // The words are in their columns: the second column has the prices; the empty last row has none.
  const column = area.width / 3
  expect(await inkIn(page, size, area.x + column + 6, area.y + 6, column - 12, 40)).toBeGreaterThan(30)
  expect(await inkIn(page, size, area.x + 6, area.y + area.height - 22, area.width - 12, 16)).toBe(0)

  // Typing in a cell again: what shows while typing is exactly what's kept.
  await page.keyboard.press('t')
  await clickAt(page, size, area.x + column + 20, area.y + area.height - 14)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.insertText('$12.99')
  await typedMatchesKept(page, size, area)

  // Tab in the last cell adds a row.
  await page.keyboard.press('t')
  await clickAt(page, size, area.x + area.width - 20, area.y + area.height - 14)
  await page.keyboard.press('Tab')
  await expect(tablePanel(page)).toContainText('5 rows')
  await page.keyboard.insertText('Tea')
  await page.keyboard.press('Escape')
  expect((await tableArea(page, size)).height).toBeGreaterThan(area.height)

  // Undo takes back the typing, then the whole table.
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expect(await undoLabel(page)).toMatch(/add a table/i)
  await page.keyboard.press('Control+z')
  expect(await inkIn(page, size, area.x, area.y, area.width, area.height)).toBe(0)
})

test('a Hebrew menu reads from the right, with numbers kept whole, exactly as typed', async ({ page }) => {
  const size = await newDesign(page, 600, 500)
  await page.addStyleTag({ content: '[aria-label="Type your text"] { caret-color: transparent !important; }' })
  await addTable(page)
  // Right to left: the first column is on the right.
  await tablePanel(page).getByRole('button', { name: 'Right to left' }).click()
  await expect(tablePanel(page).getByRole('button', { name: 'Right to left' })).toHaveAttribute('aria-pressed', 'true')
  await typingBox(page).focus()
  await typeCells(page, ['מנה', 'מחיר', 'הערות', 'מרק עוף עם לחם טרי וסלט בצד', '₪25.90', 'חם', 'עוגת תפוחים', '12:00', '1,234'])
  await page.keyboard.press('Escape')
  const area = await tableArea(page, size)
  const column = area.width / 3
  // The first row's first cell is on the right; with only two cells typed in the last row, its
  // left column is empty.
  expect(await inkIn(page, size, area.x + 2 * column + 6, area.y + 6, column - 12, 30)).toBeGreaterThan(30)
  expect(await inkIn(page, size, area.x + 6, area.y + area.height - 22, column - 12, 16)).toBe(0)
  expect(await inkIn(page, size, area.x + 2 * column + 6, area.y + area.height - 22, column - 12, 16)).toBe(0)

  // Typing again in the long cell: the typing box matches the table, letter for letter.
  await page.keyboard.press('t')
  await clickAt(page, size, area.x + 2 * column + 30, area.y + area.height / 2 - 10)
  await expect(typingBox(page)).toBeFocused()
  await page.keyboard.insertText(' ')
  await typedMatchesKept(page, size, area)

  // Stripes and lines between rows only, like a menu: still undoable in one step each.
  await page.keyboard.press('v')
  await clickAt(page, size, size.width / 2, size.height / 2)
  await tablePanel(page).getByRole('button', { name: 'Stripes' }).click()
  expect(await undoLabel(page)).toMatch(/stripes/i)
  await tablePanel(page).getByRole('radio', { name: 'Between rows' }).click()
  expect(await undoLabel(page)).toMatch(/lines/i)

  // In an SVG download the cells stay real words, not a picture.
  await page.getByRole('button', { name: /What do you want to do/ }).click()
  await page.getByRole('combobox', { name: 'What do you want to do?' }).fill('svg')
  await expect(page.locator('#palette-results').getByRole('option').first()).toContainText('Download as SVG')
  await page.getByRole('combobox', { name: 'What do you want to do?' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  const svg = readFileSync((await download.path())!, 'utf8')
  expect(svg).toContain('מרק עוף')
  expect(svg).toContain('₪25.90')
  expect(svg).not.toContain('<image')
})
