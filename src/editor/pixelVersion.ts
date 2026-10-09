// Painting and undo change a layer's pixels in place, so the canvas alone can't tell whether its
// pixels changed. Every in-place change bumps the canvas's version, which lets saving skip
// layers that are the same as last time.
const versions = new WeakMap<HTMLCanvasElement, number>()

export function markPixelsChanged(canvas: HTMLCanvasElement): void {
  versions.set(canvas, pixelVersion(canvas) + 1)
}

export function pixelVersion(canvas: HTMLCanvasElement): number {
  return versions.get(canvas) ?? 0
}
