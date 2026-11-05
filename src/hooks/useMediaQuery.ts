import { useEffect, useState } from 'react'

// Whether a CSS media query matches now, kept up to date as the window changes size or turns.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}

// Wide enough to keep the panels in a column beside the design (a laptop, a desktop, or a tablet
// turned sideways). Narrower screens open the panels over the design when asked.
export const WIDE_SCREEN = '(min-width: 1024px)'
// A phone held upright: the tools sit in a row along the bottom, and panels slide up from below.
export const PHONE_SCREEN = '(max-width: 767px)'
