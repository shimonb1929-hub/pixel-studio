import { fontsVersion } from '../text/fonts.ts'
import type { Layer } from './types.ts'

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

// Only pixel layers change in place; every other kind gets a new object when it changes. Text also
// looks different once its font arrives, and hidden parts change in place while being brushed. Each
// count only goes up, so their sum changes whenever one does.
export function layerVersion(layer: Layer): number {
  const hidden = layer.hide ? pixelVersion(layer.hide.canvas) : 0
  if (layer.kind === 'raster') return pixelVersion(layer.canvas) + hidden
  return (layer.kind === 'text' || layer.kind === 'table' ? fontsVersion() : 0) + hidden
}
