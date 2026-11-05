// Measures how fast Pixel Studio answers: brush strokes, moving things, sliders, tools, panels,
// undo and zoom, on a big design with a big photo. Run against a built copy:
//   npm run build && npx vite preview --port 5199 &
//   node scripts/speed/measure.mjs http://localhost:5199
// For each action it reports how long from the input until the screen is drawn again (in ms).
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5199'
const only = process.argv[3]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// Every input records the time until the frame after it has been drawn.
await page.addInitScript(() => {
  const w = window
  w.__lat = []
  w.__long = []
  let pending = null
  w.__wait = []
  const note = (e) => {
    w.__wait.push(performance.now() - e.timeStamp)
    if (pending) return
    pending = e.timeStamp
    requestAnimationFrame(() => {
      const start = pending
      setTimeout(() => {
        w.__lat.push(performance.now() - start)
        pending = null
      }, 0)
    })
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'click', 'wheel', 'input']) window.addEventListener(type, note, { capture: true, passive: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) w.__long.push(entry.duration)
  }).observe({ type: 'longtask', buffered: true })
})

await page.goto(base)
await page.waitForLoadState('networkidle')

const results = []
async function measure(name, run) {
  if (only && !name.includes(only) && !name.startsWith('open new')) return
  await settle()
  await page.evaluate(() => {
    window.__lat = []
    window.__long = []
    window.__wait = []
  })
  const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE).test(name)
  let cdp
  if (profiling) {
    cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  const t0 = Date.now()
  await run()
  await settle()
  if (profiling) {
    const { profile } = await cdp.send('Profiler.stop')
    summarize(profile, name)
  }
  const wall = Date.now() - t0
  const { lat, long, wait } = await page.evaluate(() => ({ lat: window.__lat, long: window.__long, wait: window.__wait }))
  wait.sort((a, b) => a - b)
  lat.sort((a, b) => a - b)
  const pick = (q) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : 0)
  const row = {
    action: name,
    inputs: lat.length,
    p50: Math.round(pick(0.5)),
    p95: Math.round(pick(0.95)),
    worst: Math.round(lat.at(-1) ?? 0),
    longTasks: long.length,
    longest: Math.round(Math.max(0, ...long)),
    wall,
    // How long the browser took to hand the input to the page at all (not the app's doing).
    queued: Math.round(wait[Math.floor(wait.length / 2)] ?? 0),
  }
  results.push(row)
  console.log(JSON.stringify(row))
}

// Prints where the time went: own time and total time of the busiest functions.
function summarize(profile, name) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const dt = profile.timeDeltas
  const self = new Map()
  const total = new Map()
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
  profile.samples.forEach((id, i) => {
    const ms = (dt[i] ?? 0) / 1000
    const n = byId.get(id)
    self.set(key(n), (self.get(key(n)) ?? 0) + ms)
    const seen = new Set()
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const k = key(byId.get(cur))
      if (seen.has(k)) continue
      seen.add(k)
      total.set(k, (total.get(k) ?? 0) + ms)
    }
  })
  // Who calls the slow built-in drawing calls.
  const callers = new Map()
  profile.samples.forEach((id, i) => {
    const n = byId.get(id)
    if (n.callFrame.url) return
    const ms = (dt[i] ?? 0) / 1000
    const chain = []
    for (let cur = parent.get(id); cur !== undefined && chain.length < 3; cur = parent.get(cur)) {
      const c = byId.get(cur)
      if (c.callFrame.url) chain.push(key(c).replace(/ index-[^:]+/, ''))
    }
    const k = `${n.callFrame.functionName} <- ${chain.join(' <- ')}`
    callers.set(k, (callers.get(k) ?? 0) + ms)
  })
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `  ${v.toFixed(0).padStart(6)}ms  ${k}`).join('\n')
  console.log(`--- built-in calls by caller\n${top(callers)}`)
  console.log(`--- ${name}: own time\n${top(self)}\n--- total time\n${top(total)}`)
}

async function settle() {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
}

async function main() {
  const r = await page.evaluate(() => {
    const m = document.querySelector('main')
    const b = m.getBoundingClientRect()
    return { x: b.left, y: b.top, w: m.clientWidth, h: m.clientHeight }
  })
  return r
}

async function stroke(points, steps = 6) {
  const m = await main()
  const at = ([fx, fy]) => [m.x + m.w * fx, m.y + m.h * fy]
  const [sx, sy] = at(points[0])
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (const p of points.slice(1)) {
    const [x, y] = at(p)
    await page.mouse.move(x, y, { steps })
  }
  await page.mouse.up()
}

const ZIGZAG = [
  [0.3, 0.3],
  [0.7, 0.35],
  [0.3, 0.45],
  [0.7, 0.5],
  [0.3, 0.6],
  [0.7, 0.65],
  [0.3, 0.7],
  [0.7, 0.72],
  [0.3, 0.74],
  [0.7, 0.76],
]

// A big design, the size of a phone photo.
const W = 4000
const H = 3000
await measure('open new big design', async () => {
  await page.getByRole('button', { name: /Custom size/ }).click()
  const dialog = page.getByRole('dialog', { name: 'New design' })
  await dialog.getByLabel('Width in pixels').fill(String(W))
  await dialog.getByLabel('Height in pixels').fill(String(H))
  await dialog.getByRole('button', { name: 'Create design' }).click()
  await page.getByRole('main').locator('canvas[aria-label]:not([data-preview])').waitFor()
})

await page.getByRole('button', { name: 'Brush tool' }).click()
await measure('brush stroke (big design)', () => stroke(ZIGZAG))
await measure('brush stroke again (many strokes on the layer)', () => stroke(ZIGZAG))
await measure('brush hover (no button)', async () => {
  const m = await main()
  for (let i = 0; i < 60; i++) await page.mouse.move(m.x + m.w * (0.3 + i / 150), m.y + m.h * 0.5)
})
await measure('undo', async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+z')
    await settle()
  }
})
await measure('redo', async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+Shift+z')
    await settle()
  }
})
await page.getByRole('button', { name: 'Eraser tool' }).click().catch(() => {})
await measure('eraser stroke', () => stroke(ZIGZAG.slice(0, 5)))

// A big photo, made here (the user's own kind of picture).
const png = await page.evaluate(async ([w, h]) => {
  const canvas = new OffscreenCanvas(w, h)
  const g = canvas.getContext('2d')
  const gr = g.createLinearGradient(0, 0, w, h)
  gr.addColorStop(0, '#0ea5e9')
  gr.addColorStop(1, '#f59e0b')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`
    g.fillRect((i * 97) % w, (i * 53) % h, 120, 80)
  }
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}, [3000, 2000])
await measure('add big photo', async () => {
  await page.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.getByText('3000 × 2000 px').first().waitFor({ timeout: 30000 }).catch(() => {})
})

await page.getByRole('button', { name: 'Arrange tool' }).click().catch(async () => {
  await page.keyboard.press('v')
})
await measure('drag photo (Arrange)', () =>
  stroke(
    [
      [0.5, 0.5],
      [0.6, 0.55],
      [0.45, 0.6],
      [0.5, 0.5],
    ],
    15,
  ),
)
await measure('hover over things (Arrange)', async () => {
  const m = await main()
  for (let i = 0; i < 60; i++) await page.mouse.move(m.x + m.w * (0.1 + i / 80), m.y + m.h * 0.4)
})
await page.getByRole('button', { name: 'Brush tool' }).click()
await measure('brush stroke on photo', () => stroke(ZIGZAG.slice(0, 5)))

await measure('zoom with wheel', async () => {
  const m = await main()
  await page.mouse.move(m.x + m.w / 2, m.y + m.h / 2)
  await page.keyboard.down('Control')
  await settle()
  await page.evaluate(() => (window.__lat = []))
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -40 : 40)
  await page.keyboard.up('Control')
})
await measure('scroll around', async () => {
  for (let i = 0; i < 30; i++) await page.mouse.wheel(i % 2 ? 30 : -30, 20)
})

const tools = ['Arrange', 'Select', 'Shape', 'Pen', 'Text', 'Brush', 'Eraser', 'Fill', 'Adjust', 'Brush']
await measure('switch tools', async () => {
  for (const t of tools) {
    const b = page.getByRole('button', { name: `${t} tool` })
    if (await b.count()) {
      const box = await b.first().boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await settle()
      }
    }
  }
})

await measure('press keys for tools', async () => {
  for (const k of ['v', 'b', 'e', 't', 'b', 'v', 'b']) {
    await page.keyboard.press(k)
    await settle()
  }
})

// Menus, dialogs and panels: each opens with a click and closes with Escape.
async function clickName(name) {
  const b = page.getByRole('button', { name, exact: true }).first()
  const box = await b.boundingBox().catch(() => null)
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await settle()
  return true
}
for (const name of ['Menu', 'What do you want to do?', 'Help', 'Download', 'More tools', 'Make other sizes', 'Gradient']) {
  await measure(`open ${name}`, async () => {
    if (await clickName(name)) {
      await page.keyboard.press('Escape')
      await settle()
    }
  })
}
await measure('pick colors', async () => {
  for (const name of ['Red', 'Blue', 'Green', 'Black']) await clickName(name)
})
await measure('layer buttons (new, duplicate, delete)', async () => {
  for (const name of ['New layer', 'Duplicate layer', 'Delete layer', 'Delete layer']) await clickName(name)
})

// A slider: drag its thumb.
await page.getByRole('button', { name: 'Adjust tool' }).click().catch(() => {})
await settle()
await measure('drag a slider (Adjust)', async () => {
  const slider = page.locator('input[type=range]:visible').first()
  const box = await slider.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 0; i <= 40; i++) await page.mouse.move(box.x + 4 + (box.width - 8) * (i / 40), box.y + box.height / 2)
  await page.mouse.up()
})
await page.keyboard.press('Escape')

await page.getByRole('button', { name: 'Brush tool' }).click()
await measure('drag brush size slider', async () => {
  const slider = page.locator('input[type=range]:visible').first()
  const box = await slider.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 0; i <= 40; i++) await page.mouse.move(box.x + 4 + (box.width - 8) * (i / 40), box.y + box.height / 2)
  await page.mouse.up()
})

await page.getByRole('button', { name: 'Text tool' }).click()
await measure('type text', async () => {
  const m = await main()
  await page.mouse.click(m.x + m.w * 0.4, m.y + m.h * 0.4)
  await settle()
  await page.keyboard.type('Hello there, this is fast typing', { delay: 10 })
  await page.keyboard.press('Escape')
})

// A busy design: many words and shapes, then painting over it.
await measure('add 12 text boxes', async () => {
  const m = await main()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('t')
    await page.mouse.click(m.x + m.w * (0.25 + (i % 4) * 0.15), m.y + m.h * (0.25 + Math.floor(i / 4) * 0.2))
    await settle()
    await page.keyboard.type('Words ' + i)
    await page.keyboard.press('Escape')
    await settle()
  }
})
await page.keyboard.press('b')
await measure('brush stroke over many words', () => stroke(ZIGZAG.slice(0, 5)))
await page.keyboard.press('v')
await measure('drag a text box (Arrange)', async () => {
  await stroke([[0.25, 0.25], [0.3, 0.3], [0.35, 0.25]], 15)
})
await measure('select all + delete + undo', async () => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await page.keyboard.press('Control+z')
  await settle()
})

console.log('\nAction | inputs | p50 | p95 | worst | long tasks | longest')
for (const r of results) console.log(`${r.action} | ${r.inputs} | ${r.p50} | ${r.p95} | ${r.worst} | ${r.longTasks} | ${r.longest}`)
if (errors.length) console.log('page errors:', errors)
await browser.close()
