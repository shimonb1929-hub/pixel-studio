import type { Page } from '@playwright/test'
import { expectColor, expectDesignSize } from './helpers.ts'
import { expect, test } from './setup.ts'

const layerNames = (page: Page) => page.getByRole('list', { name: 'Layer list' }).getByRole('button', { name: /^Layer: / }).allTextContents()

// A logo from another program: a red square, a blue circle moved into place by its group, and a
// green bar with a black outline drawn with path commands. The script and the link must never run.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" onload="window.ran = true">
  <script>window.ran = true</script>
  <rect x="10" y="10" width="30" height="30" fill="#ff0000"/>
  <g transform="translate(60 25)"><circle r="15" style="fill: rgb(0, 0, 255)"/></g>
  <path d="M80 10 h10 v30 h-10 z" fill="#00aa00" stroke="#000" stroke-width="1"/>
  <text x="5" y="48">Hi</text>
</svg>`

// The color on screen at a point of the design, whatever the zoom (the design is centered).
async function shown(page: Page, size: { width: number; height: number }, x: number, y: number): Promise<number[]> {
  const zoom = Number((await page.getByRole('button', { name: 'Zoom level' }).textContent())!.replace('%', '')) / 100
  return page.evaluate(
    async ([w, h, px, py, z]) => {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame)
      const main = document.querySelector('main')!
      const canvas = main.querySelector('canvas')!
      const dpr = devicePixelRatio
      const sx = (main.clientWidth / 2 + (px - w / 2) * z) * dpr
      const sy = (main.clientHeight / 2 + (py - h / 2) * z) * dpr
      return [...canvas.getContext('2d')!.getImageData(Math.round(sx), Math.round(sy), 1, 1).data.slice(0, 3)]
    },
    [size.width, size.height, x, y, zoom] as const,
  )
}

test('an SVG opens as shapes that stay sharp, kept together, with the picture hidden below', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) })
  // Small drawings are made bigger: 100 × 50 opens as 1000 × 500.
  await expectDesignSize(page, 1000, 500)
  const size = { width: 1000, height: 500 }
  // The words in it show only in the hidden picture; the three drawn parts are shapes.
  expect(await layerNames(page)).toEqual(['Part 3', 'Part 2', 'Part 1', 'Original picture'])
  await expect(page.getByRole('button', { name: 'Layer: Original picture' })).toBeAttached()
  expect(await page.evaluate(() => (window as unknown as { ran?: boolean }).ran)).toBeUndefined()

  expectColor(await shown(page, size, 250, 250), [255, 0, 0])
  // The circle sits where its group moved it.
  expectColor(await shown(page, size, 600, 250), [0, 0, 255])
  expect((await shown(page, size, 600, 80))[0]).toBeGreaterThan(200)
  expectColor(await shown(page, size, 850, 250), [0, 170, 0])
  // Its outline is there too, and the page stays see-through like the SVG.
  await expect(page.getByRole('button', { name: 'Layer: Original picture' })).toBeAttached()
})

test('an SVG keeps its shape when its size and view box differ, and never loads anything from outside', async ({ page }) => {
  const outside: string[] = []
  page.on('request', (request) => !request.url().startsWith('http://localhost') && !request.url().startsWith('data:') && !request.url().startsWith('blob:') && outside.push(request.url()))
  const square = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 100" style="background-image:url(https://example.com/tracker.png)">
  <rect width="100" height="100" fill="#0000ff" style="filter:url(https://example.com/f.svg#x)"/>
</svg>`
  await page.locator('input[type=file]').setInputFiles({ name: 'square.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(square) })
  await expectDesignSize(page, 1000, 500)
  const size = { width: 1000, height: 500 }
  // A square in the middle, as browsers show it, not stretched to the full width.
  expectColor(await shown(page, size, 500, 250), [0, 0, 255])
  expectColor(await shown(page, size, 270, 250), [0, 0, 255])
  expect((await shown(page, size, 150, 250))[0]).toBeGreaterThan(150)
  expect(outside).toEqual([])
})
