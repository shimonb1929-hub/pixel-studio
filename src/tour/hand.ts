import type { Viewport } from '../editor/types.ts'
import { play, type SoundName } from './sounds.ts'

// The tour's pointer: an arrow that moves over the app and really uses it, the way a person would.
// It clicks the same buttons, drags on the page with the same tools and types into the same text,
// so what a tour shows is exactly what the tools do. It's an arrow, like the mouse pointer: never
// a hand or a finger.

// The pointer the tour presses with. Browsers only let real pointers be held by an element, so
// holding this one is quietly skipped (the tour lets go of it itself).
const HAND_ID = 4077

let patched = false
function allowTourPointer() {
  if (patched || typeof Element === 'undefined') return
  patched = true
  const set = Element.prototype.setPointerCapture
  const release = Element.prototype.releasePointerCapture
  const has = Element.prototype.hasPointerCapture
  Element.prototype.setPointerCapture = function (id: number) {
    if (id !== HAND_ID) set.call(this, id)
  }
  Element.prototype.releasePointerCapture = function (id: number) {
    if (id !== HAND_ID) release.call(this, id)
  }
  Element.prototype.hasPointerCapture = function (id: number) {
    return id === HAND_ID ? false : has.call(this, id)
  }
}

export interface HandHost {
  getViewport: () => Viewport
  // Where the tour should shine its light while the pointer works (a CSS selector), or nothing.
  spot: (selector: string | null) => void
}

interface PressOptions {
  shift?: boolean
  alt?: boolean
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// One pointer for a whole tour. Each step's actions wait for the step before to finish, and
// skipping ahead hurries what's left so it's done at once (the result is the same, just quicker).
export class Hand {
  private queue: Promise<void> = Promise.resolve()
  private hurriedUpTo = -1
  private last = -1
  private cursor: HTMLDivElement | null = null
  private at = { x: 0, y: 0 }
  private host: HandHost

  constructor(host: HandHost) {
    this.host = host
    allowTourPointer()
  }

  // Runs one step's actions after the ones already waiting. Resolves when they are done.
  run(act: (hand: HandStep) => Promise<void>): Promise<void> {
    const token = ++this.last
    const step = new HandStep(this, token)
    const done = this.queue.then(() => act(step)).catch((error: unknown) => console.warn('Tour step', error))
    this.queue = done
    return done
  }

  // Everything waiting so far is done at once.
  hurry() {
    this.hurriedUpTo = this.last
  }

  hurried(token: number) {
    return token <= this.hurriedUpTo
  }

  private closed = false

  remove() {
    this.closed = true
    this.hurry()
    this.cursor?.remove()
    this.cursor = null
    this.host.spot(null)
  }

  spot(selector: string | null) {
    this.host.spot(selector)
  }

  // The arrow on screen.
  arrow(): HTMLDivElement | null {
    if (this.cursor || this.closed) return this.cursor
    const div = document.createElement('div')
    div.setAttribute('aria-hidden', 'true')
    div.dataset.tourPointer = ''
    div.style.cssText = 'position:fixed;left:0;top:0;z-index:60;pointer-events:none;width:28px;height:28px;transition:transform 120ms ease-out;filter:drop-shadow(0 2px 3px rgb(0 0 0 / .35))'
    div.innerHTML =
      '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2.5v17.2l4.6-4.4 3 6.9 3.1-1.4-3-6.8 6.4-.2z" fill="#fff" stroke="#1a1f2c" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.appendChild(div)
    this.cursor = div
    this.place(window.innerWidth * 0.55, window.innerHeight * 0.45)
    return div
  }

  place(x: number, y: number) {
    this.at = { x, y }
    if (this.cursor) this.cursor.style.translate = `${x - 3}px ${y - 2}px`
  }

  where() {
    return this.at
  }

  press(down: boolean) {
    if (this.cursor) this.cursor.style.transform = down ? 'scale(0.82)' : ''
  }

  // Where a point of the page (0 to 1 across it) is on screen.
  screen(x: number, y: number, doc: { width: number; height: number }): { x: number; y: number } | null {
    const canvas = document.querySelector('[data-tour="canvas"]')
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const v = this.host.getViewport()
    return { x: rect.left + v.panX + x * doc.width * v.zoom, y: rect.top + v.panY + y * doc.height * v.zoom }
  }
}

// What one step's actions can do. Every action waits for the one before.
export class HandStep {
  private hand: Hand
  private token: number

  constructor(hand: Hand, token: number) {
    this.hand = hand
    this.token = token
  }

  get quick() {
    return this.hand.hurried(this.token)
  }

  // Waits a while (only a moment when hurried: the app still needs to draw in between).
  async wait(ms: number) {
    if (this.quick) {
      await frame()
      await frame()
      return
    }
    const until = performance.now() + ms
    while (performance.now() < until && !this.quick) await frame()
  }

  spot(selector: string | null) {
    this.hand.spot(selector)
  }

  sound(name: SoundName) {
    if (!this.quick) play(name)
  }

  // Glides the arrow to a point on screen.
  async moveTo(x: number, y: number, ms = 500) {
    this.hand.arrow()
    const from = this.hand.where()
    if (this.quick) {
      this.hand.place(x, y)
      return
    }
    const start = performance.now()
    for (;;) {
      const f = Math.min(1, (performance.now() - start) / ms)
      const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2
      this.hand.place(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      if (f >= 1 || this.quick) break
      await frame()
    }
    this.hand.place(x, y)
  }

  // Glides the arrow to a point of the page (shares of it), without pressing.
  async pointAt(doc: { width: number; height: number }, at: [number, number], ms = 600) {
    const p = this.hand.screen(at[0], at[1], doc)
    if (p) await this.moveTo(p.x, p.y, ms)
  }

  // Finds a button or control by a CSS selector.
  find(selector: string): HTMLElement | null {
    const all = [...document.querySelectorAll<HTMLElement>(selector)]
    return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null
  }

  // Points at a control (lighting it up) without pressing it.
  async point(selector: string, ms = 600) {
    const el = this.find(selector)
    if (!el) return null
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    this.spot(selector)
    const r = el.getBoundingClientRect()
    await this.moveTo(r.left + r.width / 2, r.top + r.height / 2, ms)
    return el
  }

  // Points at a control and clicks it, just like a person.
  async click(selector: string, ms = 600) {
    const el = await this.point(selector, ms)
    if (!el) return false
    await this.wait(150)
    this.hand.press(true)
    this.sound('tick')
    el.click()
    await this.wait(120)
    this.hand.press(false)
    await this.wait(250)
    return true
  }

  // Clicks a button by the words on it, like Apply, looking only inside `within`.
  async clickText(text: string, within = 'body', ms = 600) {
    // The button may take a moment to wake up after the change before it (Apply, Crop).
    const ready = () =>
      [...document.querySelectorAll<HTMLButtonElement>(`${within} button`)].find((b) => b.textContent?.trim() === text && b.getClientRects().length > 0 && !b.disabled)
    let button = ready()
    for (let i = 0; !button && i < 90; i++) {
      await frame()
      button = ready()
    }
    if (!button) return false
    button.dataset.tourPress = ''
    try {
      return await this.click('[data-tour-press]', ms)
    } finally {
      delete button.dataset.tourPress
    }
  }

  // Presses on the page, moves through the points (shares of the page), and lets go: a drag with
  // whatever tool is picked. One point is a click.
  async drag(doc: { width: number; height: number }, points: [number, number][], options: PressOptions & { ms?: number } = {}) {
    const target = document.querySelector<HTMLElement>('[data-tour="canvas"]')
    if (!target || points.length === 0) return
    const screens = points.map(([x, y]) => this.hand.screen(x, y, doc)!).filter(Boolean)
    const fire = (type: string, p: { x: number; y: number }, buttons: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: HAND_ID,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons,
          clientX: p.x,
          clientY: p.y,
          shiftKey: !!options.shift,
          altKey: !!options.alt,
          pressure: buttons ? 0.5 : 0,
        }),
      )
    await this.moveTo(screens[0].x, screens[0].y, 500)
    // Like a real mouse, the pointer is over the spot before it presses (Zoom zooms where it is).
    fire('pointermove', screens[0], 0)
    await this.wait(120)
    this.hand.press(true)
    fire('pointerdown', screens[0], 1)
    // Points are spread over the time the drag takes, with little steps in between, so the tools
    // see a smooth movement like a real hand's.
    const ms = options.ms ?? 600
    const pieces: { x: number; y: number }[] = []
    for (let i = 1; i < screens.length; i++) {
      const a = screens[i - 1]
      const b = screens[i]
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6))
      for (let k = 1; k <= n; k++) pieces.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
    }
    const start = performance.now()
    let sent = 0
    while (sent < pieces.length) {
      const due = this.quick ? pieces.length : Math.min(pieces.length, Math.ceil(((performance.now() - start) / ms) * pieces.length))
      while (sent < due) {
        const p = pieces[sent++]
        fire('pointermove', p, 1)
        this.hand.place(p.x, p.y)
      }
      if (sent < pieces.length) await frame()
    }
    const end = pieces[pieces.length - 1] ?? screens[0]
    fire('pointerup', end, 0)
    this.hand.press(false)
    await this.wait(150)
  }

  // Types into whatever is being edited, letter by letter.
  async type(text: string, perLetter = 70) {
    for (const letter of text) {
      document.execCommand('insertText', false, letter)
      if (!this.quick && letter !== ' ') play('tick')
      await this.wait(perLetter)
    }
  }

  // Presses a key, like Enter or Escape, where the typing is.
  async key(key: string) {
    const target = (document.activeElement as HTMLElement | null) ?? document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
    await this.wait(200)
  }

  // Moves a slider (found by its label, like "Size") to `to` (0 to 1 along it), gliding there the
  // way a dragged slider would.
  async slide(label: string, to: number, ms = 700) {
    const labels = [...document.querySelectorAll<HTMLLabelElement>('label')].filter((l) => l.textContent?.trim() === label && l.getClientRects().length > 0)
    const input = labels.map((l) => document.getElementById(l.htmlFor)).find((el): el is HTMLInputElement => el instanceof HTMLInputElement)
    if (!input) return false
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = input.getBoundingClientRect()
    this.hand.spot(`#${CSS.escape(input.id)}`)
    const from = Number(input.value) / Number(input.max || 1000)
    await this.moveTo(r.left + r.width * from, r.top + r.height / 2, 500)
    this.hand.press(true)
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const start = performance.now()
    for (;;) {
      const f = this.quick ? 1 : Math.min(1, (performance.now() - start) / ms)
      const now = from + (to - from) * f
      setValue.call(input, String(Math.round(now * Number(input.max || 1000))))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      this.hand.place(r.left + r.width * now, r.top + r.height / 2)
      if (f >= 1) break
      await frame()
    }
    this.hand.press(false)
    await this.wait(300)
    return true
  }

  // Anything else: a change the tour makes itself (like a slider's new value), shown where it is.
  async do(run: () => void, after = 250) {
    run()
    await this.wait(after)
  }
}
