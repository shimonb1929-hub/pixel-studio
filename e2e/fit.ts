import type { Page } from '@playwright/test'

// Finds layout mistakes on what is showing right now:
// - text that is cut off (it doesn't fit its box and the box hides the rest),
// - buttons, boxes and words that sit on top of each other,
// - buttons pushed out of their box or off the screen where nothing can scroll to them.
// Scrolling rows (like a tool's settings bar) are fine: things in them are reachable.
export interface FitProblem {
  kind: 'cut off' | 'overlap' | 'out of reach'
  what: string
  other?: string
}

export async function findFitProblems(page: Page, within = 'body'): Promise<FitProblem[]> {
  // Let windows and panels finish sliding or fading in first.
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]))
  return page.evaluate((rootSelector) => {
    const problems: { kind: 'cut off' | 'overlap' | 'out of reach'; what: string; other?: string }[] = []
    const root = document.querySelector(rootSelector)
    if (!root) return problems
    const vw = innerWidth
    const vh = innerHeight

    const name = (el: Element) => {
      const label = el.getAttribute('aria-label') || (el as HTMLElement).innerText?.trim().split('\n')[0] || el.getAttribute('placeholder') || ''
      const where = el.closest('[aria-label]')
      const place = where && where !== el ? ` in "${where.getAttribute('aria-label')}"` : ''
      return `${el.tagName.toLowerCase()} "${label.slice(0, 40)}"${place}`
    }
    const visible = (el: Element) => {
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      for (let p: Element | null = el; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (Number(s.opacity) === 0 || s.visibility === 'hidden') return false
        if (p.getAttribute('aria-hidden') === 'true' && p !== el) return false
      }
      return true
    }
    const clips = (s: CSSStyleDeclaration, axis: 'x' | 'y') => {
      const v = axis === 'x' ? s.overflowX : s.overflowY
      return v === 'hidden' || v === 'clip'
    }
    const scrolls = (s: CSSStyleDeclaration, axis: 'x' | 'y') => {
      const v = axis === 'x' ? s.overflowX : s.overflowY
      return v === 'auto' || v === 'scroll'
    }

    // 1. Cut-off words: a box that hides overflow but whose words are wider than it.
    // Deliberate "…" endings on long names the user typed are fine when the full name is on hover.
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (el instanceof SVGElement || el.tagName === 'CANVAS' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') continue
      if (el.isContentEditable) continue
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())
      if (!hasText || !visible(el)) continue
      const s = getComputedStyle(el)
      if (el.closest('[data-fit-ok]')) continue
      const overX = el.scrollWidth - el.clientWidth > 1 && clips(s, 'x')
      const overY = el.scrollHeight - el.clientHeight > 2 && clips(s, 'y') && s.webkitLineClamp === 'none'
      if ((overX || overY) && !(s.textOverflow === 'ellipsis' && el.title) ) {
        problems.push({ kind: 'cut off', what: name(el) + (s.textOverflow === 'ellipsis' ? ' (…)' : '') })
      }
    }

    // 2. Things pushed outside a box that hides them, or off the screen.
    const things = [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [role=slider], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox]')]
      .filter((el) => visible(el) && !el.closest('[data-fit-ok]'))
    for (const el of things) {
      const r = el.getBoundingClientRect()
      let box = { left: 0, top: 0, right: vw, bottom: vh }
      let scrollX = false
      let scrollY = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (scrolls(s, 'x')) scrollX = true
        if (scrolls(s, 'y')) scrollY = true
        if ((clips(s, 'x') && !scrollX) || (clips(s, 'y') && !scrollY)) {
          const pr = p.getBoundingClientRect()
          if (clips(s, 'x') && !scrollX) box = { ...box, left: Math.max(box.left, pr.left), right: Math.min(box.right, pr.right) }
          if (clips(s, 'y') && !scrollY) box = { ...box, top: Math.max(box.top, pr.top), bottom: Math.min(box.bottom, pr.bottom) }
        }
        if (s.position === 'fixed') break
      }
      const outX = !scrollX && (r.left < box.left - 1 || r.right > box.right + 1)
      const outY = !scrollY && (r.top < box.top - 1 || r.bottom > box.bottom + 1)
      if (outX || outY) problems.push({ kind: 'out of reach', what: name(el) })
    }

    // 3. Overlap: two controls (or a control and words) covering each other.
    // Only things that are drawn on top count: a menu over the page is meant to cover it.
    const words = [...root.querySelectorAll<HTMLElement>('span, label, p, h1, h2, h3, kbd')].filter(
      (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && !el.closest('button, a, [role=menuitem], [role=option], [role=radio], [role=tab]'),
    )
    const all = [...things, ...words]
    // The part of each thing that can be seen: boxes that scroll or hide overflow cut it down.
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect()
      let { left, top, right, bottom } = r
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        const pr = p.getBoundingClientRect()
        if (s.overflowX !== 'visible') { left = Math.max(left, pr.left); right = Math.min(right, pr.right) }
        if (s.overflowY !== 'visible') { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom) }
        if (s.position === 'fixed') break
      }
      return { left, top, right, bottom, width: right - left, height: bottom - top }
    }
    const rects = all.map(seen)
    const layer = (el: Element) => el.closest('dialog, [role=dialog], [role=menu], [role=listbox], [role=tooltip], [data-popup]') ?? document.body
    // A thing counts only where it isn't covered by something else (a window over the page, say).
    const showing = all.map((el, i) => {
      const r = rects[i]
      if (r.width <= 0 || r.height <= 0) return false
      const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1)
      const y = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1)
      const top = document.elementFromPoint(x, y)
      return !!top && (el.contains(top) || top.contains(el) || top === el)
    })
    // Words placed inside a box on purpose, like "px" or "wide" at the end of a number box.
    const adornment = (a: Element, b: Element) => {
      const field = a.matches('input, select, textarea') ? a : b.matches('input, select, textarea') ? b : null
      const word = field === a ? b : a
      return !!field && !word.matches('input, select, textarea, button') && getComputedStyle(word).position === 'absolute' && !!field.parentElement?.contains(word)
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]
        const b = all[j]
        if (a.contains(b) || b.contains(a)) continue
        if (layer(a) !== layer(b) || !showing[i] || !showing[j] || adornment(a, b)) continue
        const ra = rects[i]
        const rb = rects[j]
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (w > 3 && h > 3) {
          problems.push({ kind: 'overlap', what: name(a), other: name(b) })
        }
      }
    }
    return problems
  }, within)
}

export function describeProblems(problems: FitProblem[]) {
  return problems.map((p) => `${p.kind}: ${p.what}${p.other ? ` and ${p.other}` : ''}`)
}
