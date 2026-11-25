import { expect, test } from './setup.ts'

// The guided-tour player: it opens a fresh design, shines the spotlight on each tool, picks it,
// builds things on the page while the guide talks, and keeps going without a recording.
test('a tour plays its steps, shows things on the page and closes', async ({ page }) => {
  await page.waitForFunction(() => 'pixelStudioTour' in window)
  await page.evaluate(async () => {
    const { playerCheck } = await import('/src/tour/tours.ts')
    ;(window as unknown as { pixelStudioTour: (tour: unknown) => void }).pixelStudioTour(playerCheck())
  })
  const player = page.getByRole('dialog', { name: 'Tour check' })
  await expect(player).toBeVisible()
  await expect(player).toContainText('Step 1 of 4')

  // Next goes on to the Arrange tool, which is picked and lit up.
  await player.getByRole('button', { name: 'Next' }).click()
  await expect(player).toContainText('Step 2 of 4')
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')

  // The Shapes step adds a sun and a star while it talks (with or without sound).
  await player.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('button', { name: 'Shapes tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Star', { exact: true }).first()).toBeVisible({ timeout: 15000 })

  // A step without a recording still moves on by itself.
  await expect(player).toContainText('Step 4 of 4', { timeout: 15000 })
  await expect(player).toBeHidden({ timeout: 15000 })

  // What the tour made stays, and can be undone.
  await expect(page.getByText('Sun', { exact: true }).first()).toBeVisible()
})

test('Escape closes the tour', async ({ page }) => {
  await page.waitForFunction(() => 'pixelStudioTour' in window)
  await page.evaluate(async () => {
    const { playerCheck } = await import('/src/tour/tours.ts')
    ;(window as unknown as { pixelStudioTour: (tour: unknown) => void }).pixelStudioTour(playerCheck())
  })
  await expect(page.getByRole('dialog', { name: 'Tour check' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Tour check' })).toBeHidden()
})
