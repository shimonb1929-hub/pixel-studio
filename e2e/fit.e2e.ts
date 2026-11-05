import { readFileSync } from 'node:fs'
import { describeProblems, findFitProblems } from './fit.ts'
import { expect, test } from './setup.ts'

// Nothing on top of anything else, no words cut off, nothing out of reach: on a phone, a tablet
// and a laptop, in English and in Hebrew, for every tool's settings bar and the main windows.
// (AUDIT=1 npx playwright test e2e/audit.e2e.ts looks at more sizes and every window, and writes a report.)

const SCREENS = [
  ['phone', 390, 844],
  ['tablet', 820, 1180],
  ['laptop', 1280, 720],
] as const
const TOOL_KEYS = 'vmcuptbefgiajshz'.split('')
const words = (lang: string): Record<string, string> => (lang === 'en' ? {} : JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8')))

for (const lang of ['en', 'he'] as const) {
  for (const [screen, width, height] of SCREENS) {
    test(`everything fits on a ${screen} in ${lang}`, async ({ page }) => {
      test.setTimeout(120_000)
      const tr = (s: string) => words(lang)[s] ?? s
      await page.setViewportSize({ width, height })
      await page.evaluate((l) => localStorage.setItem('pixel-studio-language', l), lang)
      await page.reload()
      const problems: string[] = []
      const look = async (where: string) => problems.push(...describeProblems(await findFitProblems(page)).map((p) => `${where}: ${p}`))

      await look('start screen')
      await page.getByRole('button', { name: new RegExp(tr('Custom size')) }).first().click()
      const dialog = page.getByRole('dialog').first()
      await look('new design window')
      await dialog.getByLabel(tr('Width in pixels')).fill('800')
      await dialog.getByLabel(tr('Height in pixels')).fill('600')
      await dialog.getByRole('button', { name: tr('Create design') }).click()

      const [before, after] = tr('{tool} settings').split('{tool}')
      const bar = page.locator('[role=toolbar]' + (before ? `[aria-label^="${before}"]` : '') + (after ? `[aria-label$="${after}"]` : ''))
      for (const key of TOOL_KEYS) {
        await page.locator('main').hover({ position: { x: 5, y: 5 } })
        await page.keyboard.press(key)
        await expect(bar).toHaveCount(1)
        const name = (await bar.getAttribute('aria-label')) ?? key
        await look(name)
        // Settings that don't fit are never just cut off: an arrow brings them in.
        const row = bar.locator('> div').first()
        const hidden = await row.evaluate((el) => el.scrollWidth - el.clientWidth)
        if (hidden > 2) {
          const more = bar.getByRole('button', { name: tr('More settings') })
          await expect(more, `${name} hides ${hidden}px with no arrow`).toBeVisible()
          await more.click()
          await expect(bar.getByRole('button', { name: tr('Earlier settings') })).toBeVisible()
          await look(`${name}, moved along`)
        }
      }

      await page.getByRole('button', { name: tr('Menu'), exact: true }).click()
      await look('Menu')
      await page.keyboard.press('Escape')

      expect(problems).toEqual([])
    })
  }
}
