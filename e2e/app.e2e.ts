import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Every test fails if the page logs an error or throws.
let errors: string[] = []

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/')
})

test.afterEach(() => {
  expect(errors, 'console errors').toEqual([])
})

// A 600 × 400 gradient with a dark square in the middle, made by the browser itself.
async function makePng(page: Page, width = 600, height = 400): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w, h)
      const g = canvas.getContext('2d')!
      const gradient = g.createLinearGradient(0, 0, w, h)
      gradient.addColorStop(0, '#0ea5e9')
      gradient.addColorStop(1, '#f59e0b')
      g.fillStyle = gradient
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#111111'
      g.fillRect(w / 2 - 50, h / 2 - 50, 100, 100)
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary)
    },
    [width, height],
  )
  return Buffer.from(base64, 'base64')
}

async function openPicture(page: Page, name = 'test-photo.png') {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: await makePng(page) })
  await expect(page.getByText('600 × 400 px')).toBeVisible()
}

const zoomLevel = (page: Page) => page.getByRole('button', { name: 'Zoom level' })

// Reads one pixel of the visible canvas, at CSS coordinates inside the workspace.
function canvasPixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('main canvas') as HTMLCanvasElement
      const dpr = devicePixelRatio
      return Array.from(canvas.getContext('2d')!.getImageData(px * dpr, py * dpr, 1, 1).data)
    },
    [x, y],
  )
}

// Decodes a downloaded file in the browser and reads one pixel of it.
function filePixel(page: Page, file: Buffer, x: number, y: number) {
  return page.evaluate(
    async ([base64, px, py]) => {
      const bytes = Uint8Array.from(atob(base64 as string), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes]))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const g = canvas.getContext('2d')!
      g.drawImage(bitmap, 0, 0)
      return { width: bitmap.width, height: bitmap.height, pixel: Array.from(g.getImageData(px as number, py as number, 1, 1).data) }
    },
    [file.toString('base64'), x, y] as const,
  )
}

async function downloadAs(page: Page, format: 'PNG' | 'JPG'): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Download your design' })
  await dialog.getByRole('radio', { name: format }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download' }).click()])
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) }
}

test.describe('starting', () => {
  test('welcome screen has no pictures and explains each size', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'What are you making today?' })).toBeVisible()
    await expect(page.locator('img')).toHaveCount(0)
    await page.getByRole('button', { name: /Phone story/ }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Full-screen phone stories')
  })

  test('one click on a size starts a design', async ({ page }) => {
    await page.getByRole('button', { name: /Square post/ }).click()
    await expect(page.getByText('1080 × 1080 px')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Layers' })).toContainText('Background')
    await expect(page.getByRole('button', { name: 'Layer: Layer 1' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('header')).toContainText('Square post')
    // White background in the middle of the design.
    const box = (await page.locator('main').boundingBox())!
    expect(await canvasPixel(page, box.width / 2, box.height / 2)).toEqual([255, 255, 255, 255])
  })

  test('custom size dialog explains and checks every option', async ({ page }) => {
    await page.getByRole('button', { name: /Custom size/ }).click()
    const dialog = page.getByRole('dialog', { name: 'New design' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Name')).toBeFocused()

    // Hover help shows above the dialog, not hidden behind it.
    await dialog.getByText('Background', { exact: true }).hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
    expect(await page.getByRole('tooltip').evaluate((el) => !!el.closest('dialog'))).toBe(true)

    await dialog.getByRole('radio', { name: 'See-through' }).click()
    await expect(dialog).toContainText('Starts empty and see-through')

    await dialog.getByLabel('Width in pixels').fill('0')
    await expect(dialog).toContainText('at least 1 pixel')
    await expect(dialog.getByRole('button', { name: 'Create design' })).toHaveAttribute('aria-disabled', 'true')
    await dialog.getByRole('button', { name: 'Create design' }).click({ force: true })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Width in pixels').fill('300')
    await dialog.getByLabel('Height in pixels').fill('500')
    await dialog.getByRole('button', { name: 'Swap width and height' }).click()
    await expect(dialog.getByLabel('Width in pixels')).toHaveValue('500')
    await expect(dialog).toContainText('so it\'s wide')
    await dialog.getByLabel('Height in pixels').press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByText('500 × 300 px')).toBeVisible()
    await expect(page.locator('header')).toContainText('My design 1')
  })

  test('dialogs close with Escape, Cancel and a click outside', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'New design' })
    await page.getByRole('button', { name: /Custom size/ }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: /Custom size/ }).click()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: /Custom size/ }).click()
    await page.mouse.click(10, 450)
    await expect(dialog).toBeHidden()
  })

  test('opens a picture from the file picker at real size', async ({ page }) => {
    await openPicture(page)
    await expect(zoomLevel(page)).toHaveText('100%')
    await expect(page.locator('header')).toContainText('test-photo.png')
  })

  test('opens a picture dropped onto the window', async ({ page }) => {
    const png = (await makePng(page)).toString('base64')
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
      const target = document.querySelector('main')!
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }))
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
    }, png)
    await expect(page.locator('header')).toContainText('dropped.png')
  })

  test('explains a file that is not a picture', async ({ page }) => {
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.getByRole('alert')).toContainText('"notes.txt" is not a picture or a Pixel Studio project.')
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('alert')).toBeHidden()
  })
})

test.describe('looking around', () => {
  test.beforeEach(async ({ page }) => openPicture(page))

  test('zoom controls and shortcuts', async ({ page }) => {
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(zoomLevel(page)).toHaveText('200%')
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect(zoomLevel(page)).toHaveText('100%')
    await page.keyboard.press('Control+Equal')
    await expect(zoomLevel(page)).toHaveText('200%')
    await page.keyboard.press('Control+Minus')
    await expect(zoomLevel(page)).toHaveText('100%')
    await page.keyboard.press('Control+0')
    await expect(zoomLevel(page)).not.toHaveText('100%')
    await zoomLevel(page).click()
    await expect(zoomLevel(page)).toHaveText('100%')
    await page.getByRole('button', { name: 'Fit on screen' }).click()
    await expect(zoomLevel(page)).not.toHaveText('100%')
    await page.keyboard.press('Control+Alt+0')
    await expect(zoomLevel(page)).toHaveText('100%')
  })

  test('Ctrl + scroll zooms toward the pointer', async ({ page }) => {
    const box = (await page.locator('main').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await expect(zoomLevel(page)).not.toHaveText('100%')
    expect(parseFloat((await zoomLevel(page).textContent())!)).toBeGreaterThan(100)
  })

  test('shows where the pointer is on the design', async ({ page }) => {
    const box = (await page.locator('main').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByText(/X 3\d\d\s+Y 2\d\d/)).toBeVisible()
  })

  test('Hand tool and Space + drag slide the design', async ({ page }) => {
    await page.keyboard.press('h')
    const box = (await page.locator('main').boundingBox())!
    const cx = box.width / 2
    const cy = box.height / 2
    const before = await canvasPixel(page, cx, cy)
    await page.mouse.move(box.x + cx, box.y + cy)
    await page.mouse.down()
    await page.mouse.move(box.x + cx + 120, box.y + cy + 80, { steps: 5 })
    await page.mouse.up()
    const afterHand = await canvasPixel(page, cx, cy)
    expect(afterHand).not.toEqual(before)

    // With the Zoom tool, holding Space switches to the Hand for a moment.
    await page.keyboard.press('z')
    await page.keyboard.down('Space')
    await expect(page.getByRole('status')).toContainText('Hand')
    await page.mouse.down()
    await page.mouse.move(box.x + cx - 200, box.y + cy - 150, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Space')
    await expect(page.getByRole('status')).toContainText('Zoom')
    await expect(zoomLevel(page)).toHaveText('100%')
    expect(await canvasPixel(page, cx, cy)).not.toEqual(afterHand)
  })

  test('Zoom tool zooms in on click and out with Alt + click', async ({ page }) => {
    await page.getByRole('button', { name: 'Zoom tool' }).click()
    await expect(page.getByRole('status')).toContainText('Click to zoom in')
    const canvas = page.locator('main canvas[aria-label]')
    await canvas.click({ position: { x: 300, y: 300 } })
    await expect(zoomLevel(page)).toHaveText('200%')
    await canvas.click({ position: { x: 300, y: 300 }, modifiers: ['Alt'] })
    await expect(zoomLevel(page)).toHaveText('100%')
  })

  test('the design stays centered when the window changes size', async ({ page }) => {
    // The dark square sits in the middle of the test picture.
    const middle = async () => {
      const box = (await page.locator('main').boundingBox())!
      return canvasPixel(page, box.width / 2, box.height / 2)
    }
    expect(await middle()).toEqual([17, 17, 17, 255])
    await page.setViewportSize({ width: 1000, height: 760 })
    await expect.poll(middle).toEqual([17, 17, 17, 255])
    await page.setViewportSize({ width: 1600, height: 1000 })
    await expect.poll(middle).toEqual([17, 17, 17, 255])
  })

  test('tools explain themselves on hover', async ({ page }) => {
    await page.getByRole('button', { name: 'Hand tool' }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Slide your design around')
    await page.getByRole('button', { name: 'Zoom tool' }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Click a spot to zoom in')
  })
})

test.describe('search and menu', () => {
  test('finds actions from everyday words', async ({ page }) => {
    await openPicture(page)
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: 'What do you want to do?' })
    await expect(search).toBeFocused()
    await search.fill('closer')
    await expect(page.getByRole('option').first()).toContainText('Zoom in')
    await search.press('Enter')
    await expect(zoomLevel(page)).toHaveText('200%')

    await page.keyboard.press('/')
    await search.fill('save')
    await expect(page.getByRole('option').first()).toContainText('Download')
    await search.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Download your design' })).toBeVisible()
  })

  test('says when nothing matches and explains what is not ready yet', async ({ page }) => {
    await page.getByRole('button', { name: /What do you want to do/ }).click()
    const search = page.getByRole('combobox')
    await search.fill('zzzz')
    await expect(page.getByRole('listbox')).toContainText('Nothing found')
    await search.fill('download')
    await expect(page.getByRole('option').first()).toContainText('Start a new design or open a picture first.')
    await search.press('Enter')
    await expect(page.getByRole('combobox')).toBeVisible()
    await search.press('Escape')
    await expect(page.getByRole('combobox')).toBeHidden()
  })

  test('arrow keys pick a result', async ({ page }) => {
    await openPicture(page)
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox')
    await search.fill('zoom')
    await search.press('ArrowDown')
    await expect(page.getByRole('option', { selected: true })).toContainText('Zoom out')
    await search.press('Enter')
    await expect(zoomLevel(page)).toHaveText('67%')
  })

  test('menu works with mouse and keyboard and explains items', async ({ page }) => {
    const menuButton = page.getByRole('button', { name: 'Menu' })
    await menuButton.click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: /^Download…/ }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Start a new design or open a picture first.')
    // Disabled on purpose: force the click to prove it does nothing.
    await menu.getByRole('menuitem', { name: /^Download…/ }).click({ force: true })
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(menuButton).toBeFocused()

    await menuButton.press('Enter')
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'New design' })).toBeVisible()
  })
})

test.describe('downloading', () => {
  test('Download is explained but does nothing before there is a design', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Download', exact: true })
    await button.hover()
    await expect(page.getByRole('tooltip')).toContainText('Start a new design or open a picture first.')
    // Hovering a disabled button keeps its normal color.
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(51, 102, 255)')
    await button.click({ force: true })
    await page.keyboard.press('Control+s')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('JPG and PNG downloads are real picture files', async ({ page }) => {
    await openPicture(page)
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Download your design' })
    await dialog.getByRole('radio', { name: 'JPG' }).click()
    await expect(dialog).toContainText(/About \d+ KB/)
    await dialog.getByLabel('Quality').fill('40')
    await expect(dialog).toContainText('Low quality')
    await page.keyboard.press('Escape')

    const jpg = await downloadAs(page, 'JPG')
    expect(jpg.name).toBe('test-photo.jpg')
    expect([...jpg.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8])

    const png = await downloadAs(page, 'PNG')
    expect(png.name).toBe('test-photo.png')
    expect(png.bytes.subarray(1, 4).toString()).toBe('PNG')
    const decoded = await filePixel(page, png.bytes, 300, 200)
    expect(decoded.width).toBe(600)
    expect(decoded.height).toBe(400)
    expect(decoded.pixel).toEqual([17, 17, 17, 255])
  })

  test('see-through designs stay see-through in PNG and turn white in JPG', async ({ page }) => {
    await page.getByRole('button', { name: /Custom size/ }).click()
    const dialog = page.getByRole('dialog', { name: 'New design' })
    await dialog.getByLabel('Width in pixels').fill('64')
    await dialog.getByLabel('Height in pixels').fill('64')
    await dialog.getByRole('radio', { name: 'See-through' }).click()
    await dialog.getByRole('button', { name: 'Create design' }).click()

    const png = await downloadAs(page, 'PNG')
    expect((await filePixel(page, png.bytes, 10, 10)).pixel[3]).toBe(0)
    const jpg = await downloadAs(page, 'JPG')
    const white = (await filePixel(page, jpg.bytes, 10, 10)).pixel
    expect(white.slice(0, 3).every((v) => v > 250)).toBe(true)
  })

  test('hidden layers are left out of the download', async ({ page }) => {
    await openPicture(page)
    const box = (await page.locator('main').boundingBox())!
    const before = await canvasPixel(page, box.width / 2, box.height / 2)
    await page.getByRole('button', { name: 'Hide Picture' }).click()
    expect(await canvasPixel(page, box.width / 2, box.height / 2)).not.toEqual(before)
    const png = await downloadAs(page, 'PNG')
    expect((await filePixel(page, png.bytes, 300, 200)).pixel[3]).toBe(0)
    await page.getByRole('button', { name: 'Show Picture' }).click()
    expect(await canvasPixel(page, box.width / 2, box.height / 2)).toEqual(before)
  })
})

test('closing a design goes back to the start', async ({ page }) => {
  await openPicture(page)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Close design' }).click()
  await expect(page.getByRole('heading', { name: 'What are you making today?' })).toBeVisible()
})

test('Space presses buttons when no design is open', async ({ page }) => {
  await page.getByRole('button', { name: /Custom size/ }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog', { name: 'New design' })).toBeVisible()
})
