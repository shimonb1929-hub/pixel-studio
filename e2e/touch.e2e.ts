import type { CDPSession, Page } from '@playwright/test'
import { test, expect } from './setup.ts'
import { newDesign, paintedIn, screenPoint, type Size } from './helpers.ts'

// Fingers on a tablet or phone, sent the way a touch screen sends them.
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) })
}

// The color on screen at a point of the page (not of the design).
function screenColor(page: Page, point: { x: number; y: number }): Promise<number[]> {
  return page.evaluate(async ({ x, y }) => {
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const dpr = devicePixelRatio
    const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.floor((x - rect.left) * dpr), Math.floor((y - rect.top) * dpr), 1, 1).data
    return [r, g, b]
  }, point)
}

async function fingers(page: Page, size: Size, at: [number, number][]) {
  return Promise.all(at.map(([x, y]) => screenPoint(page, size, x, y)))
}

test.describe('fingers on a touch screen', () => {
  test('two fingers spread apart zoom in, without painting', async ({ page }) => {
    const size = await newDesign(page)
    const cdp = await page.context().newCDPSession(page)
    await touch(cdp, 'touchStart', await fingers(page, size, [[180, 150]]))
    await touch(cdp, 'touchStart', await fingers(page, size, [[180, 150], [220, 150]]))
    for (let step = 1; step <= 8; step++) {
      await touch(cdp, 'touchMove', await fingers(page, size, [[180 - step * 10, 150], [220 + step * 10, 150]]))
    }
    await touch(cdp, 'touchEnd', [])
    const zoom = Number((await page.getByRole('button', { name: 'Zoom level' }).textContent())?.replace('%', ''))
    expect(zoom).toBeGreaterThan(200)
    // Nothing was painted, so there is nothing to undo.
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-disabled', 'true')
  })

  test('two fingers moved together move the view', async ({ page }) => {
    const size = await newDesign(page)
    // A spot just inside the page's left edge: white, until the view moves right past it.
    const spot = await screenPoint(page, size, 25, 150)
    expect(await screenColor(page, spot)).toEqual([255, 255, 255])
    const cdp = await page.context().newCDPSession(page)
    const start = await fingers(page, size, [[150, 150], [250, 150]])
    await touch(cdp, 'touchStart', start.slice(0, 1))
    await touch(cdp, 'touchStart', start)
    for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', start.map((p) => ({ x: p.x + step * 10, y: p.y + step * 6 })))
    await touch(cdp, 'touchEnd', [])
    await expect(page.getByRole('button', { name: 'Zoom level' })).toHaveText('100%')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-disabled', 'true')
    expect(await screenColor(page, spot)).not.toEqual([255, 255, 255])
  })

  test('a second finger that comes late still moves the view, and the paint it began goes away', async ({ page }) => {
    const size = await newDesign(page)
    const cdp = await page.context().newCDPSession(page)
    const [a, b] = await fingers(page, size, [[150, 150], [250, 150]])
    await touch(cdp, 'touchStart', [a])
    await touch(cdp, 'touchMove', [{ x: a.x + 20, y: a.y }])
    await page.waitForTimeout(400)
    await touch(cdp, 'touchStart', [{ x: a.x + 20, y: a.y }, b])
    for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', [{ x: a.x + 20 + step * 10, y: a.y }, { x: b.x + step * 10, y: b.y }])
    await touch(cdp, 'touchEnd', [])
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-disabled', 'true')
    expect(await paintedIn(page, size, { x: 0, y: 0, width: 400, height: 300 })).toBe(0)
  })

  test('a late second finger while moving a thing puts it back and moves the view', async ({ page }) => {
    const size = await newDesign(page)
    await page.keyboard.press('u')
    await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
    await page.mouse.move(0, 0)
    const [from, to] = await fingers(page, size, [[150, 100], [250, 200]])
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.press('v')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).not.toHaveAttribute('aria-disabled', 'true')
    const steps = await page.evaluate(() => document.querySelectorAll('[aria-label="Layer list"] [aria-label^="Layer: "]').length)
    const cdp = await page.context().newCDPSession(page)
    const [a, b] = await fingers(page, size, [[200, 150], [300, 250]])
    await touch(cdp, 'touchStart', [a])
    for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', [{ x: a.x + step * 10, y: a.y }])
    await page.waitForTimeout(300)
    await touch(cdp, 'touchStart', [{ x: a.x + 40, y: a.y }, b])
    for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', [{ x: a.x + 40 + step * 10, y: a.y + step * 6 }, { x: b.x + step * 10, y: b.y + step * 6 }])
    await touch(cdp, 'touchEnd', [])
    // The rectangle stayed where it was drawn: one step to undo (drawing it), not a move.
    await page.mouse.move(5, 5)
    await page.getByRole('button', { name: 'Undo', exact: true }).hover()
    await expect(page.getByRole('tooltip')).not.toContainText('Move')
    expect(steps).toBe(1)
  })

  test('one finger still paints', async ({ page }) => {
    const size = await newDesign(page)
    const cdp = await page.context().newCDPSession(page)
    const points = await fingers(page, size, [[100, 150], [150, 150], [200, 150], [250, 150]])
    await touch(cdp, 'touchStart', [points[0]])
    for (const point of points.slice(1)) await touch(cdp, 'touchMove', [point])
    await touch(cdp, 'touchEnd', [])
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).not.toHaveAttribute('aria-disabled', 'true')
    expect(await paintedIn(page, size, { x: 90, y: 140, width: 170, height: 20 })).toBeGreaterThan(0)
  })
})
