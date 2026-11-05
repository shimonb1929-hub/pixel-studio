import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface Size {
  width: number
  height: number
}

// Only a real change of size is passed on: asking React to keep the same size still draws the whole
// app again, and this runs after every change on screen.
function measure(element: HTMLElement, last: { current: Size }, setSize: (size: Size) => void) {
  const width = element.clientWidth
  const height = element.clientHeight
  if (last.current.width === width && last.current.height === height) return
  last.current = { width, height }
  setSize(last.current)
}

// The inside size of an element (without its border), kept up to date as it resizes.
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const last = useRef(size)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => measure(element, last, setSize))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  // Also measured after every change on screen, before it shows: the observer only tells a frame
  // later, and in that frame things would be drawn for the old size (like a design that has just
  // opened, before the panels beside it took their room). It only sets a new size when the size
  // really changed, so it settles right away.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (ref.current) measure(ref.current, last, setSize)
  })

  return size
}
