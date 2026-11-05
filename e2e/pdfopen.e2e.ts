import type { Page } from '@playwright/test'
import { designPixel, expectColor, expectDesignSize } from './helpers.ts'
import { expect, test } from './setup.ts'

const pagesBar = (page: Page) => page.getByRole('navigation', { name: 'Pages' })
const pageButtons = (page: Page) => pagesBar(page).getByRole('button', { name: /^Page \d+$/ })

// A small PDF made by hand: two pages of 200 × 100 points, one with a red block on the left half,
// one with a blue block on the left half. The rest of each page is plain paper.
function twoPagePdf(): Buffer {
  const pages = ['1 0 0 rg 0 0 100 100 re f', '0 0 1 rg 0 0 100 100 re f']
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>`]
  pages.forEach((content, i) => {
    const contentId = 4 + i * 2
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents ${contentId} 0 R >>`)
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

test('a PDF opens with each of its pages as a page of the design', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({ name: 'flyer.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() })
  // Drawn at print detail: 200 points is 833 pixels.
  await expectDesignSize(page, 833, 416)
  const size = { width: 833, height: 416 }
  await expect(pageButtons(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Layer: Page picture' })).toBeAttached()
  await expect.poll(async () => (await designPixel(page, size, 200, 200)).slice(0, 3)).toEqual([255, 0, 0])
  // The paper is white.
  expectColor(await designPixel(page, size, 600, 200), [255, 255, 255])

  await pageButtons(page).nth(1).click()
  await expect.poll(async () => (await designPixel(page, size, 200, 200)).slice(0, 3)).toEqual([0, 0, 255])
  expectColor(await designPixel(page, size, 600, 200), [255, 255, 255])
})

test('a file that only says it is a PDF gives a calm note', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 nothing here') })
  await expect(page.getByText("This PDF couldn't be opened. It may be locked with a password or damaged.")).toBeVisible()
})
