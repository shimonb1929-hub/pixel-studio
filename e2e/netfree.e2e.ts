import type { BrowserContext } from '@playwright/test'
import { addBallPhoto, AI_TIMEOUT, BALL, SKY } from './aiPhoto.ts'
import { clickAt, designPixel, expectColor, newDesign, WHITE } from './helpers.ts'
import { expect, test } from './setup.ts'

// Pixel Studio is used behind NetFree, a filter that blocks or holds outside sites. These tests
// block every request to anywhere but the test server, the way a strict filter would, and check
// that the AI tools still work: everything they need must come from our own site.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Blocks everything that isn't the test server, and notes what was asked for.
async function blockOutsideSites(context: BrowserContext) {
  const outside: string[] = []
  const local: string[] = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL_HOSTS.has(url.hostname)) {
      local.push(url.pathname)
      return route.continue()
    }
    outside.push(url.href)
    return route.abort('blockedbyclient')
  })
  return { outside, local }
}

test('Remove background works with every outside site blocked', async ({ page, context }) => {
  test.setTimeout(AI_TIMEOUT + 30_000)
  const requests = await blockOutsideSites(context)
  await page.goto('/')
  const size = await newDesign(page)
  await addBallPhoto(page)
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0]).toBe(SKY[0])

  await page.keyboard.press('v')
  await clickAt(page, size, 200, 150)
  await page.getByRole('button', { name: 'Remove background' }).click()
  await expect.poll(async () => (await designPixel(page, size, 60, 50))[0], { timeout: AI_TIMEOUT }).toBe(WHITE[0])
  expectColor(await designPixel(page, size, 200, 150), BALL)

  expect(requests.outside).toEqual([])
  // The model really came from our own site (so the block above covered the AI's requests too).
  expect(requests.local).toContain('/models/Xenova/slimsam-77-uniform/onnx/vision_encoder.onnx')
  expect(requests.local).toContain('/models/Xenova/slimsam-77-uniform/onnx/prompt_encoder_mask_decoder.onnx')
  expect(requests.local.some((path) => /ort-wasm-simd-threaded.*\.wasm$/.test(path))).toBe(true)
})

test('Magic select works with every outside site blocked', async ({ page, context }) => {
  test.setTimeout(AI_TIMEOUT + 30_000)
  const requests = await blockOutsideSites(context)
  await page.goto('/')
  const size = await newDesign(page)
  await addBallPhoto(page)

  await page.keyboard.press('m')
  await page.getByRole('radio', { name: 'Magic' }).click()
  await clickAt(page, size, 200, 150)
  await expect.poll(async () => page.getByRole('button', { name: 'Delete selected area' }).isEnabled(), { timeout: AI_TIMEOUT }).toBe(true)
  await page.getByRole('button', { name: 'Delete selected area' }).click()
  // The ball is gone and the sky around it stays.
  await expect.poll(async () => (await designPixel(page, size, 200, 150))[1]).toBeGreaterThan(240)
  expectColor(await designPixel(page, size, 60, 50), SKY)

  expect(requests.outside).toEqual([])
  expect(requests.local).toContain('/models/Xenova/slimsam-77-uniform/config.json')
})
