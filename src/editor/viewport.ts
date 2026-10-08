import type { Point, Viewport } from './types.ts'

export const MIN_ZOOM = 0.01
export const MAX_ZOOM = 32

// The steps Zoom In / Zoom Out and the Zoom tool move between.
export const ZOOM_LEVELS = [
  0.01, 0.02, 0.03, 0.04, 0.05, 0.0625, 1 / 12, 0.125, 1 / 6, 0.25, 1 / 3, 0.5, 2 / 3, 1, 2, 3, 4, 5, 6,
  7, 8, 12, 16, 24, 32,
]

const EPSILON = 1e-6

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function nextZoomLevel(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom + EPSILON) ?? MAX_ZOOM
  return ZOOM_LEVELS.findLast((level) => level < zoom - EPSILON) ?? MIN_ZOOM
}

// Changes the zoom while keeping the document point under (x, y) in place.
export function zoomAtPoint(viewport: Viewport, zoom: number, x: number, y: number): Viewport {
  const next = clampZoom(zoom)
  const docX = (x - viewport.panX) / viewport.zoom
  const docY = (y - viewport.panY) / viewport.zoom
  return { zoom: next, panX: x - docX * next, panY: y - docY * next }
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy }
}

export function centeredViewport(
  docWidth: number,
  docHeight: number,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
): Viewport {
  const next = clampZoom(zoom)
  return {
    zoom: next,
    panX: (viewWidth - docWidth * next) / 2,
    panY: (viewHeight - docHeight * next) / 2,
  }
}

export function fitViewport(
  docWidth: number,
  docHeight: number,
  viewWidth: number,
  viewHeight: number,
  { allowUpscale = true, padding = 40 } = {},
): Viewport {
  if (viewWidth <= 0 || viewHeight <= 0) return { zoom: 1, panX: 0, panY: 0 }
  const availableWidth = Math.max(1, viewWidth - padding * 2)
  const availableHeight = Math.max(1, viewHeight - padding * 2)
  let zoom = Math.min(availableWidth / docWidth, availableHeight / docHeight)
  if (!allowUpscale) zoom = Math.min(zoom, 1)
  return centeredViewport(docWidth, docHeight, viewWidth, viewHeight, zoom)
}

export function screenToDocument(viewport: Viewport, x: number, y: number): Point {
  return { x: (x - viewport.panX) / viewport.zoom, y: (y - viewport.panY) / viewport.zoom }
}

export function formatZoom(zoom: number): string {
  return `${Number((zoom * 100).toFixed(2))}%`
}
