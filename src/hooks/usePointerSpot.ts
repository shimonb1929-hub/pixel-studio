import { useSyncExternalStore } from 'react'
import type { Point } from '../editor/types.ts'

// Where the pointer is over the design, for the rulers and the position readout. It changes on
// every move of the mouse, so it is kept out of the app's own state: only what shows it is drawn
// again, not every panel.
let spot: Point | null = null
const listeners = new Set<() => void>()

export function setPointerSpot(next: Point | null): void {
  if (next === spot || (next && spot && next.x === spot.x && next.y === spot.y)) return
  spot = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePointerSpot(): Point | null {
  return useSyncExternalStore(subscribe, () => spot)
}
