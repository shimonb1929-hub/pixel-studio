import { drag, inkIn, newDesign } from './helpers.ts'
import { expect, test } from './setup.ts'

test('make a brush from a shape and paint a trail of it', async ({ page }) => {
  const size = await newDesign(page, 400, 300)
  await page.keyboard.press('u')
  await page.getByRole('radio', { name: 'Star' }).click()
  await drag(page, size, [
    [20, 20],
    [80, 80],
  ])
  await page.keyboard.press('b')
  await page.getByRole('button', { name: /^Brushes:/ }).click()
  const brushes = page.getByRole('dialog', { name: 'Brushes' })
  await brushes.getByRole('button', { name: 'Make a brush' }).click()
  await expect(page.getByRole('button', { name: 'Brushes: My brush 1' })).toBeVisible()

  const before = await inkIn(page, size, 100, 180, 260, 60)
  await drag(page, size, [
    [120, 210],
    [240, 210],
    [340, 210],
  ])
  expect(await inkIn(page, size, 100, 180, 260, 60)).toBeGreaterThan(before + 200)

  // It's kept with the other brushes, and can be taken away.
  await page.getByRole('button', { name: /^Brushes:/ }).click()
  await expect(brushes.getByRole('radio', { name: 'My brush 1' })).toBeVisible()
  await brushes.getByRole('button', { name: 'Remove My brush 1' }).click()
  await expect(brushes.getByRole('radio', { name: 'My brush 1' })).toHaveCount(0)
})
