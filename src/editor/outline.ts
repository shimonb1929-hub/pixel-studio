import type { Rect } from './geometry.ts'
import type { Point } from './types.ts'

export interface TracedOutline {
  // Closed loops along pixel edges; holes come out as their own loops.
  loops: Point[][]
  // The smallest rectangle around every selected pixel, or null if nothing is selected.
  bounds: Rect | null
}

// Directions as [dx, dy]: right, down, left, up. Walking each loop this way keeps the selected
// pixels on the right-hand side.
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

// Finds the outline of the selected pixels in a grid (1 = selected), as loops of corner points.
// offsetX/offsetY move the result, for grids cut from part of a larger area.
export function traceOutline(grid: Uint8Array, width: number, height: number, offsetX = 0, offsetY = 0): TracedOutline {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && grid[y * width + x] === 1
  const stride = width + 1
  // Each boundary edge, keyed by its start corner; a corner can start two edges where pixels touch diagonally.
  const edges = new Map<number, number[]>()
  const addEdge = (x0: number, y0: number, direction: number) => {
    const key = y0 * stride + x0
    const list = edges.get(key)
    if (list) list.push(direction)
    else edges.set(key, [direction])
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] !== 1) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (!at(x, y - 1)) addEdge(x, y, 0)
      if (!at(x + 1, y)) addEdge(x + 1, y, 1)
      if (!at(x, y + 1)) addEdge(x + 1, y + 1, 2)
      if (!at(x - 1, y)) addEdge(x, y + 1, 3)
    }
  }

  const loops: Point[][] = []
  for (const [startKey, startList] of edges) {
    while (startList.length > 0) {
      const firstDirection = startList.pop()!
      const loop: Point[] = []
      let key = startKey
      let direction = firstDirection
      let previous = -1
      for (;;) {
        const x = key % stride
        const y = (key - x) / stride
        // Only corners where the outline turns become points of the loop.
        if (direction !== previous) loop.push({ x: x + offsetX, y: y + offsetY })
        const [dx, dy] = DIRECTIONS[direction]
        key = (y + dy) * stride + (x + dx)
        previous = direction
        if (key === startKey) break
        const next = edges.get(key)
        if (!next || next.length === 0) break
        // Where two regions touch at a corner, turn right so they stay separate shapes.
        const right = (direction + 1) % 4
        const pick = next.includes(right) ? right : next[0]
        next.splice(next.indexOf(pick), 1)
        direction = pick
      }
      // If the loop arrives back going the same way it left, the start sits mid-way along an edge.
      if (previous === firstDirection && loop.length > 1) loop.shift()
      loops.push(loop)
    }
  }

  const bounds = maxX < minX ? null : { x: minX + offsetX, y: minY + offsetY, width: maxX - minX + 1, height: maxY - minY + 1 }
  return { loops, bounds }
}
