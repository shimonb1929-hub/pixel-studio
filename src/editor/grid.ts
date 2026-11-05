import type { Rect } from './geometry.ts'

// Squared paper over the page, and rulers along the edges of the view. The grid's squares are a
// round number of pixels that suits the design's size (about twenty across the long side), and
// things line up with its lines while they are moved, like with the page's edges.

const NICE = [1, 2, 2.5, 5]

// The round number (1, 2, 2.5 or 5 times a power of ten) closest above `rough`.
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  for (const n of NICE) if (n * power >= rough - 1e-9) return n * power
  return 10 * power
}

// The size of a grid square for a design, in pixels: whole pixels, so things stay sharp.
export function gridStep(width: number, height: number): number {
  return Math.max(1, Math.round(niceStep(Math.max(width, height) / 20)))
}

// Where the grid's lines are across a page of this size (the page edges are left out: they are
// lines things line up with already).
export function gridPositions(size: number, step: number): number[] {
  const out: number[] = []
  for (let at = step; at < size - 1e-9; at += step) out.push(at)
  return out
}

// The grid's lines, as thin rectangles that things line up with while they are moved.
export function gridLines(width: number, height: number, step = gridStep(width, height)): Rect[] {
  return [
    ...gridPositions(width, step).map((x) => ({ x, y: 0, width: 0, height })),
    ...gridPositions(height, step).map((y) => ({ x: 0, y, width, height: 0 })),
  ]
}

// The marks on a ruler: a numbered mark every `step` design units, with `minor` smaller marks
// between, spaced so numbers never crowd (at least `minGap` screen pixels apart).
export function rulerSpacing(unitsPerScreenPixel: number, minGap = 64): { step: number; minor: number } {
  const step = niceStep(minGap * unitsPerScreenPixel)
  const first = String(step / 10 ** Math.floor(Math.log10(step)))
  return { step, minor: first === '2.5' || first === '5' ? 5 : first === '2' ? 4 : 10 }
}
