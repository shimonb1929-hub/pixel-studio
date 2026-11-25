import { expect, test } from './setup.ts'

// Guided tours start from the start screen, open a fresh design, light up and pick each tool,
// and build things on the page while the guide talks. What they make stays, as the user's own.
test('the tools tour lights up each tool and shows them working', async ({ page }) => {
  await page.getByRole('button', { name: 'Meet the tools' }).click()
  const player = page.getByRole('dialog', { name: 'Meet the tools' })
  await expect(player).toBeVisible()
  await expect(player).toContainText('Step 1 of 16')

  await player.getByRole('button', { name: 'Next' }).click()
  await expect(player).toContainText('Step 2 of 16')
  await expect(page.getByRole('button', { name: 'Arrange tool' })).toHaveAttribute('aria-pressed', 'true')

  // Shapes: the tool is picked and shapes appear while the guide talks about it.
  for (let i = 0; i < 3; i++) await player.getByRole('button', { name: 'Next' }).click()
  await expect(player).toContainText('Step 5 of 16')
  await expect(page.getByRole('button', { name: 'Shapes tool' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Star', { exact: true }).first()).toBeVisible({ timeout: 15000 })

  // Pausing holds the step; playing goes on.
  await player.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1500)
  await expect(player).toContainText('Step 5 of 16')
  await player.getByRole('button', { name: 'Play' }).click()

  // Escape stops the tour; what it made stays.
  await page.keyboard.press('Escape')
  await expect(player).toBeHidden()
  await expect(page.getByText('Star', { exact: true }).first()).toBeVisible()
})

test('the poster tour makes a whole poster, ready to download', async ({ page }) => {
  await page.getByRole('button', { name: 'Make a poster' }).click()
  const player = page.getByRole('dialog', { name: 'Make a poster' })
  await expect(player).toBeVisible()
  // Skip through quickly: each step's demo still happens when it is reached.
  for (let step = 1; step < 11; step++) {
    await expect(player).toContainText(`Step ${step} of 11`)
    await page.waitForTimeout(300)
    await player.getByRole('button', { name: 'Next' }).click()
  }
  await expect(player).toContainText('Step 11 of 11')
  await player.getByRole('button', { name: 'Finish' }).click()
  await expect(player).toBeHidden()
  for (const name of ['Sun', 'Hill', 'Flower', 'Spring Garden Fair', 'Details']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
})

test('Help offers the tours too', async ({ page }) => {
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Help' })
  await help.getByRole('button', { name: 'Meet the tools' }).click()
  await expect(page.getByRole('dialog', { name: 'Meet the tools' })).toBeVisible()
})
