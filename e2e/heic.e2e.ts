import { test, expect } from './setup.ts'
import { designPixel, expectColor, expectDesignSize } from './helpers.ts'

// A 400 × 300 phone photo (HEIC): red on the left half, blue on the right. Made in code with
// plain colors, so it is not a picture of anything.
const HEIC = Buffer.from(
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAVdtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABewABAAAAAAAAAysAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA12lwcnAAAAC4aXBjbwAAAHlodmNDAQNwAAAAkAAAAAAAPPAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAPLoCQGEAAQAsQgEBA3AAAAMAkAAAAwAAAwA8oAyIBMfeW6kkprm4CGgwIAAAAwMgAAADACFiAAEAB0QBwXKwYkAAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAABkAAAASwAAAAQcGl4aQAAAAADCAgIAAAAF2lwbWEAAAAAAAAAAQABBIECAwQAAAMzbWRhdAAAAycoAa8Gsoi6n52YgGOw3P++0H//+ce/of6fICf+IjaBDEFjKyei28oKzM91sUPKfTf3afiFJ//sC/bxx33FEYBJ8GGuZx/5Tkk3sTVgvDSYn+9H5RH2h8/5Akh/MCFTYS+c/0ZH6dVuJqeYbY24f5X+VmBnid+N6V/cDFnq/kx0ROliC128f/FKqggGIqqpcl4nN5u+jfAP5GT7pJfO8eqLdJC9d8n7PbZzV8Tu6DdCtM7X69wj5HI0bnAAAAMAAAMAAAMABoQa7eUFbAAAAwAA/QfpGswIVNhL5z/Rkfp1W4mp5htjbh/lf5WYGeJ344pX9wMWer+THRFz9KhjiT0rBG1aLDd+wpbKKG1pmJVUItoGkwdTngIfVSvUUCpP2YnW5Un+NFeptP+PVx7APIhX/cfSSzNTxbdhnePQqY2hrLlidxD++uo+FQI5/+P/e2uNvHXux/CX9Cl7B6AAAAMAAAMBMgKuAAADAO4AAAMBmkoGRmUHIC2rd/5CRi57SeLhGiS7syvkU+VjUfM75qV/cDFnq/kx0Rc/SoY4k9KwRtWiw3fsKWyihtaZiVVCLaBpMHU54CH1Ur1FAqT9mJ1uVJ/jTcLAn/Hq49gHkQr/uPpJZmp4tuwzvHoVMbQ1lyxO4h/fXUfCoEc//H/vbXG3jr3Y/hL+hS9g9AAAAwAAAwP0FJAAABOgAAKBEyxcyg5AW1bv/ISMXPaTxcI0SXdmV8inysaj5nfNSv7gYs9X8mOiLn6VDHEnpWCNq0WG79hS2UUNrTMSqoRbQNJg6nPAQ+qleooFSfsxOtypP8auLYE/49XHsA8iFf9x9JLM1PFt2Gd49CpjaGsuWJ3EP766j4VAjn/4/97a428de7H8Jf0KXsHoAAADAAA6AXMABegPUAAABDQB3lkNAhU2EvnP9GR+nVbianmG2NuH+V/lZgZ4nfjilf3AxZ6v5MdEXP0qGOJPSsEbVosN37ClsoobWmYlVQi2gaTB1OeAh9VK9RQKk/ZidblSf42QGRX/Ljr/0Cf5KusPWaDrdChbl8Wm54FZNsVPiZui2PaAAAADAAADAAADAYk=',
  'base64',
)

test.describe('phone photos (HEIC)', () => {
  test('open as a new design, even when the computer does not say they are pictures', async ({ page }) => {
    await page.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'application/octet-stream', buffer: HEIC })
    await expectDesignSize(page, 400, 300)
    await page.keyboard.press('ControlOrMeta+Alt+0')
    await expect(page.getByRole('button', { name: 'Zoom level' })).toHaveText('100%')
    const size = { width: 400, height: 300 }
    expectColor(await designPixel(page, size, 100, 150), [220, 40, 40], 12)
    expectColor(await designPixel(page, size, 300, 150), [40, 60, 220], 12)
  })

  test('a damaged phone photo explains itself', async ({ page }) => {
    const broken = Buffer.concat([HEIC.subarray(0, 40), Buffer.alloc(200)])
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: broken })
    await expect(page.getByRole('alert')).toContainText("This file couldn't be opened")
  })
})
