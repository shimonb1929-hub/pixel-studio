import { expect, type Page } from '@playwright/test'

export interface Size {
  width: number
  height: number
}

// A small design opens at 100%, centered, which makes screen and design positions easy to match.
export async function newDesign(page: Page, width = 400, height = 300): Promise<Size> {
  await page.getByRole('button', { name: /Custom size/ }).click()
  const dialog = page.getByRole('dialog', { name: 'New design' })
  await dialog.getByLabel('Width in pixels').fill(String(width))
  await dialog.getByLabel('Height in pixels').fill(String(height))
  await dialog.getByRole('button', { name: 'Create design' }).click()
  await expectDesignSize(page, width, height)
  await expect(page.getByRole('button', { name: 'Zoom level' })).toHaveText('100%')
  return { width, height }
}

// The design's size, read from the canvas's own label (tool settings can show sizes too).
export async function expectDesignSize(page: Page, width: number, height: number) {
  await expect(page.getByRole('main').locator('canvas[aria-label]')).toHaveAttribute('aria-label', new RegExp(`, ${width} by ${height} pixels$`))
}

// Where a point of the design is on the screen.
export async function screenPoint(page: Page, size: Size, x: number, y: number) {
  const area = await page.evaluate(() => {
    const main = document.querySelector('main')!
    const rect = main.getBoundingClientRect()
    return { left: rect.left + main.clientLeft, top: rect.top + main.clientTop, width: main.clientWidth, height: main.clientHeight }
  })
  return { x: area.left + (area.width - size.width) / 2 + x, y: area.top + (area.height - size.height) / 2 + y }
}

export async function drag(page: Page, size: Size, points: [number, number][]) {
  const start = await screenPoint(page, size, ...points[0])
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) {
    const next = await screenPoint(page, size, x, y)
    await page.mouse.move(next.x, next.y, { steps: 12 })
  }
  await page.mouse.up()
}

export async function clickAt(page: Page, size: Size, x: number, y: number, modifiers: ('Shift' | 'Alt')[] = []) {
  const point = await screenPoint(page, size, x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(point.x, point.y)
  for (const key of modifiers) await page.keyboard.up(key)
}

// The color shown on screen at a point of the design (at 100% zoom).
export function designPixel(page: Page, size: Size, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([w, h, px, py]) => {
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const left = Math.round(((main.clientWidth - w) / 2) * dpr)
      const top = Math.round(((main.clientHeight - h) / 2) * dpr)
      return Array.from(canvas.getContext('2d')!.getImageData(left + Math.floor(px * dpr), top + Math.floor(py * dpr), 1, 1).data)
    },
    [size.width, size.height, x, y],
  )
}

export function expectColor(actual: number[], expected: [number, number, number], tolerance = 8) {
  for (let i = 0; i < 3; i++) expect(Math.abs(actual[i] - expected[i]), `channel ${i} of ${actual}`).toBeLessThanOrEqual(tolerance)
}

export const WHITE: [number, number, number] = [255, 255, 255]
export const INK: [number, number, number] = [27, 29, 35]
