import { useEffect, useRef, useState, type DependencyList } from 'react'

// Like useMemo, but worked out again only once the browser has a quiet moment, for answers that
// take a while and don't have to show the very instant something changes. The first answer is
// worked out right away, so nothing starts out empty.
export function useIdleValue<T>(compute: () => T, deps: DependencyList): T {
  const [value, setValue] = useState(compute)
  const computeRef = useRef(compute)
  const first = useRef(true)
  useEffect(() => {
    computeRef.current = compute
  })
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const run = () => setValue(() => computeRef.current())
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 400 })
      return () => cancelIdleCallback(id)
    }
    const id = window.setTimeout(run, 50)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
