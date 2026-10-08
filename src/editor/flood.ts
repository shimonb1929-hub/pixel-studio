import type { Rect } from './geometry.ts'

export interface Region {
  // 1 for each pixel in the region, for the whole width × height area.
  mask: Uint8Array
  bounds: Rect
}

// Finds all pixels connected to (x, y) whose color is close to the color there. `tolerance` is
// how far apart (0–255) any of red, green, blue or see-through may be and still count as close.
export function floodRegion(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, tolerance: number): Region | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const start = (y * width + x) * 4
  const [r0, g0, b0, a0] = [data[start], data[start + 1], data[start + 2], data[start + 3]]
  const matches = (i: number) => {
    const p = i * 4
    return (
      Math.abs(data[p] - r0) <= tolerance &&
      Math.abs(data[p + 1] - g0) <= tolerance &&
      Math.abs(data[p + 2] - b0) <= tolerance &&
      Math.abs(data[p + 3] - a0) <= tolerance
    )
  }

  const mask = new Uint8Array(width * height)
  let minX = x
  let maxX = x
  let minY = y
  let maxY = y
  // Scanline fill: fill a whole run of a row at once, then look above and below it.
  const stack: number[] = [x, y]
  while (stack.length > 0) {
    const sy = stack.pop()!
    const sx = stack.pop()!
    let left = sx
    const row = sy * width
    if (mask[row + left] || !matches(row + left)) continue
    while (left > 0 && !mask[row + left - 1] && matches(row + left - 1)) left--
    let right = sx
    while (right < width - 1 && !mask[row + right + 1] && matches(row + right + 1)) right++
    for (let i = left; i <= right; i++) mask[row + i] = 1
    if (left < minX) minX = left
    if (right > maxX) maxX = right
    if (sy < minY) minY = sy
    if (sy > maxY) maxY = sy
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= height) continue
      const nrow = ny * width
      let i = left
      while (i <= right) {
        // Push one seed for each separate run in the neighboring row.
        if (!mask[nrow + i] && matches(nrow + i)) {
          stack.push(i, ny)
          while (i <= right && !mask[nrow + i] && matches(nrow + i)) i++
        }
        i++
      }
    }
  }
  return { mask, bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } }
}

// Grows a region by one pixel in every direction, so a fill tucks under soft outlines instead
// of leaving a thin pale gap along them.
export function growRegion(region: Region, width: number, height: number): Region {
  const { mask, bounds } = region
  const grown = new Uint8Array(mask)
  const x0 = Math.max(0, bounds.x - 1)
  const y0 = Math.max(0, bounds.y - 1)
  const x1 = Math.min(width - 1, bounds.x + bounds.width)
  const y1 = Math.min(height - 1, bounds.y + bounds.height)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * width + x]) continue
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) near = true
        }
      }
      if (near) grown[y * width + x] = 1
    }
  }
  return { mask: grown, bounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } }
}
