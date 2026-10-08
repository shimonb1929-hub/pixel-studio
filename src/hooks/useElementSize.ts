import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Size {
  width: number
  height: number
}

// The inside size of an element (without its border), kept up to date as it resizes.
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
