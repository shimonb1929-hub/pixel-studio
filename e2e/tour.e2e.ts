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

// Skips through a tour quickly: each step's demo still happens when it is reached.
async function skipThrough(page: import('@playwright/test').Page, title: string, steps: number) {
  await page.getByRole('button', { name: title }).click()
  const player = page.getByRole('dialog', { name: title })
  await expect(player).toBeVisible()
  for (let step = 1; step < steps; step++) {
    await expect(player).toContainText(`Step ${step} of ${steps}`)
    await page.waitForTimeout(300)
    await player.getByRole('button', { name: 'Next' }).click()
  }
  await expect(player).toContainText(`Step ${steps} of ${steps}`)
  await player.getByRole('button', { name: 'Finish' }).click()
  await expect(player).toBeHidden()
}

test('the deep dive shows every tool working', async ({ page }) => {
  await skipThrough(page, 'Every tool, up close', 21)
  for (const name of ['Star', 'Box', 'Hexagon', 'Arrow', 'Leaf', 'Hello', 'Paint']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
})

test('the showcase paints a whole night garden', async ({ page }) => {
  await skipThrough(page, 'Night garden showcase', 12)
  for (const name of ['Sky', 'Moon', 'Star', 'Hills', 'Grass', 'Flower', 'Night Garden']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
})

test('the guide speaks: its recorded voice plays from inside the app', async ({ page }) => {
  await page.addInitScript(() => {
    const played: string[] = []
    ;(window as unknown as { played: string[] }).played = played
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      const src = this.src
      return original.call(this).then(() => {
        if (src.startsWith('data:audio/mpeg') && src.length > 5000) played.push(src.slice(0, 20))
      })
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Meet the tools' }).click()
  await expect(page.getByRole('dialog', { name: 'Meet the tools' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { played: string[] }).played.length), { timeout: 15000 }).toBeGreaterThan(0)
})
