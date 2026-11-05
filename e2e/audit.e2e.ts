import { test } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { describeProblems, findFitProblems } from './fit.ts'

// A long look at every screen: not a pass/fail test, it writes a report (AUDIT=1 to run).
test.skip(!process.env.AUDIT, 'Run with AUDIT=1')
test.setTimeout(600_000)

const SCREENS = [
  ['phone', 390, 844],
  ['tablet', 820, 1180],
  ['tablet-wide', 1180, 820],
  ['laptop-small', 1280, 720],
  ['laptop', 1366, 768],
  ['desktop', 1440, 900],
  ['wide', 1920, 1080],
] as const
const LANGS = ['en', 'he', 'yi'] as const
const TOOL_KEYS = 'vmcuptbefgiajshz'.split('')

const words = (lang: string): Record<string, string> => (lang === 'en' ? {} : JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8')))

for (const lang of LANGS) {
  for (const [screen, width, height] of SCREENS) {
    test(`audit ${lang} ${screen}`, async ({ page }) => {
      const w = words(lang)
      const tr = (s: string) => w[s] ?? s
      const report: Record<string, string[]> = {}
      const errors: string[] = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.setViewportSize({ width, height })
      await page.addInitScript((l) => localStorage.setItem('pixel-studio-language', l), lang)
      await page.goto('/')
      const look = async (label: string, within = 'body') => {
        await page.waitForTimeout(150)
        const found = [...new Set(describeProblems(await findFitProblems(page, within)))]
        if (found.length) report[label] = found
      }

      await look('start screen')
      await page.getByRole('button', { name: new RegExp(tr('Custom size')) }).first().click()
      await look('new design window')
      const dialog = page.getByRole('dialog').first()
      await dialog.getByLabel(tr('Width in pixels')).fill('800')
      await dialog.getByLabel(tr('Height in pixels')).fill('600')
      await dialog.getByRole('button', { name: tr('Create design') }).click()
      await page.waitForTimeout(400)
      await look('editor')

      for (const key of TOOL_KEYS) {
        await page.locator('main').hover({ position: { x: 5, y: 5 } }).catch(() => {})
        await page.keyboard.press(key)
        await page.waitForTimeout(150)
        const [before, after] = tr('{tool} settings').split('{tool}')
        const barSelector = '[role=toolbar]' + (before ? `[aria-label^="${before}"]` : '') + (after ? `[aria-label$="${after}"]` : '')
        const bar = await page.locator(barSelector).first().getAttribute('aria-label', { timeout: 2000 }).catch(() => key)
        const hidden = await page.locator(barSelector).first().evaluate((el) => el.scrollWidth - el.clientWidth, null, { timeout: 2000 }).catch(() => 0)
        if (hidden > 2) (report['bar needs scrolling'] ??= []).push(`${bar}: ${hidden}px hidden`)
        await look(`tool ${key} (${bar})`)
      }

      // Every Menu item that opens a window.
      const menu = page.getByRole('button', { name: tr('Menu'), exact: true })
      if (await menu.isVisible()) {
        await menu.click()
        await look('Menu')
        const items = await page.getByRole('menuitem').allTextContents()
        await page.keyboard.press('Escape')
        for (const item of items) {
          const title = item.replace(/[⌘⇧⌥].*$|Ctrl.*$/, '').trim()
          if (!title.endsWith('…')) continue
          if ([tr('Open…'), tr('Add a photo…'), tr('Close design')].includes(title)) continue
          if (!(await menu.click({ timeout: 3000 }).then(() => true, () => false))) { report[`window: ${title}`] = ['could not open Menu (something left open)']; continue }
          await page.getByRole('menuitem', { name: title }).first().click({ timeout: 3000 }).catch(() => {})
          await page.waitForTimeout(400)
          await look(`window: ${title}`)
          await page.keyboard.press('Escape')
          await page.keyboard.press('Escape')
          const close = page.getByRole('dialog').getByRole('button', { name: tr('Close'), exact: true })
          if (await close.first().isVisible().catch(() => false)) await close.first().click({ timeout: 2000 }).catch(() => {})
          await page.waitForTimeout(150)
        }
      } else report['Menu'] = ['Menu button not visible']

      report['errors'] = errors
      mkdirSync('audit', { recursive: true })
      writeFileSync(`audit/${lang}-${screen}.json`, JSON.stringify(report, null, 1))
    })
  }
}

