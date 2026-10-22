import { expect, test } from './setup.ts'

// Every built-in font loads in a real browser, and has the letters the font list says it has:
// Hebrew fonts draw Hebrew themselves and Yiddish fonts the double letters (the vowel points are
// checked in the font files when the list is made).
test('every font loads and has the letters it promises', async ({ page }) => {
  test.setTimeout(120_000)
  const problems = await page.evaluate(async () => {
    const { allFonts, fontInfo } = await import('/src/text/fonts.ts')
    type Font = ReturnType<typeof allFonts>[number]
    const load = async (font: Font) => {
      for (const file of font.files.filter((f) => f.style === 'normal')) {
        const face = new FontFace(`check-${font.id}`, `url("${new URL(file.url, document.baseURI).href}")`, { weight: file.weight })
        document.fonts.add(await face.load())
      }
    }
    const ctx = document.createElement('canvas').getContext('2d')!
    const width = (fonts: string, text: string) => {
      ctx.font = `40px ${fonts}`
      return ctx.measureText(text).width
    }
    // A font draws letters itself when what comes after it in the list makes no difference: two
    // stand-ins of different widths (both with Hebrew and English) give the same width.
    const drawsItself = (font: Font, text: string) =>
      width(`"check-${font.id}", "check-heebo"`, text) === width(`"check-${font.id}", "check-frank-ruhl-libre"`, text)

    const found: string[] = []
    await load(fontInfo('heebo')!)
    await load(fontInfo('frank-ruhl-libre')!)
    if (width('"check-heebo"', 'אבג Abc') === width('"check-frank-ruhl-libre"', 'אבג Abc')) {
      found.push('the two stand-ins are the same width, so this test cannot tell')
    }
    for (const font of allFonts()) {
      try {
        await load(font)
      } catch (error) {
        found.push(`${font.id}: ${String(error)}`)
        continue
      }
      if (font.hebrew && !drawsItself(font, 'אבגדהוזחטיכלמנסעפצקרשת')) found.push(`${font.id}: no Hebrew letters`)
      if (font.yiddish && !['װ', 'ױ', 'ײ'].every((text) => drawsItself(font, text))) found.push(`${font.id}: missing a Yiddish letter`)
      if (!font.hebrew && !drawsItself(font, 'Hamburgefonstiv')) found.push(`${font.id}: no English letters`)
    }
    return found
  })
  expect(problems).toEqual([])
})
