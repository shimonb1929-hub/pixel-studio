import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Size {
  width: number
  height: number
}

function measure(element: HTMLElement, setSize: (update: (current: Size) => Size) => void) {
  const width = element.clientWidth
  const height = element.clientHeight
  setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
}

// The inside size of an element (without its border), kept up to date as it resizes.
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => measure(element, setSize))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  // Also measured after every change on screen, before it shows: the observer only tells a frame
  // later, and in that frame things would be drawn for the old size (like a design that has just
  // opened, before the panels beside it took their room).
  useLayoutEffect(() => {
    if (ref.current) measure(ref.current, setSize)
  })

  return size
}
