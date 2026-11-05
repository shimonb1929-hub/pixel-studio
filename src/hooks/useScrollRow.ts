import { useCallback, useEffect, useState, type RefObject } from 'react'

// For a row that scrolls sideways when the screen is too narrow (like a tool's settings bar):
// says whether more is hidden before or after what shows, in reading order (so it works in
// Hebrew and Yiddish too), and moves the row by most of its width.
export interface ScrollRow {
  moreBefore: boolean
  moreAfter: boolean
  step: (direction: 1 | -1) => void
}

function measure(el: HTMLElement) {
  const rtl = getComputedStyle(el).direction === 'rtl'
  // In a right-to-left row the browser counts scrollLeft from 0 down to a negative number.
  const scrolled = Math.abs(el.scrollLeft)
  const room = el.scrollWidth - el.clientWidth
  return { rtl, before: scrolled > 1, after: room - scrolled > 1 }
}

export function useScrollRow(ref: RefObject<HTMLElement | null>, watch: unknown): ScrollRow {
  const [more, setMore] = useState({ before: false, after: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { before, after } = measure(el)
    setMore((old) => (old.before === before && old.after === after ? old : { before, after }))
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Each tool's settings start from the beginning.
    el.scrollLeft = 0
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    const mutations = new MutationObserver(() => {
      update()
      for (const child of el.children) observer.observe(child)
    })
    mutations.observe(el, { childList: true, subtree: true })
    el.addEventListener('scroll', update, { passive: true })
    // A mouse wheel only goes up and down; here it moves the row along.
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || el.scrollWidth <= el.clientWidth) return
      if ((event.target as Element | null)?.closest('input, [role=slider], textarea, select')) return
      const { rtl } = measure(el)
      el.scrollBy({ left: rtl ? -event.deltaY : event.deltaY })
    }
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', wheel)
    }
  }, [ref, update, watch])

  const step = useCallback(
    (direction: 1 | -1) => {
      const el = ref.current
      if (!el) return
      const { rtl } = measure(el)
      const amount = Math.max(120, el.clientWidth * 0.7) * direction
      el.scrollBy({ left: rtl ? -amount : amount, behavior: 'smooth' })
    },
    [ref],
  )

  return { moreBefore: more.before, moreAfter: more.after, step }
}
