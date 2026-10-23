import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets several copies of the project run their browser tests side by side.
const PORT = Number(process.env.E2E_PORT ?? 5180)

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
    {
      // Sharp "Retina" screens draw two pixels per point, which catches rounding mistakes.
      name: 'chromium-hidpi',
      use: { ...devices['Desktop Chrome HiDPI'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
