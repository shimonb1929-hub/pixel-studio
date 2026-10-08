import { test as base, expect } from '@playwright/test'

// Every test starts on a fresh page and fails if the page logs an error or throws.
export const test = base.extend<{ watchErrors: void }>({
  watchErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
      page.on('pageerror', (error) => errors.push(String(error)))
      await page.goto('/')
      await use()
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
