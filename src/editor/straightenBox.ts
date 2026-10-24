import { polygonBounds, type Rect } from './geometry.ts'
import { boxCorners, normalizeAngle, type TransformBox } from './transform.ts'

// Straighten, on the design: once straighten.ts knows how far a photo leans, how its box turns,
// how much it grows so no empty corners show, and whether it needs trimming to its frame.

// The turn (degrees) that makes a picture's lines level, given how they lean in its own pixels.
// A mirrored picture leans the other way on the design.
export function levelingTurn(box: TransformBox, tilt: number): number {
  const mirrored = box.width < 0 !== box.height < 0
  const turn = mirrored ? tilt : -tilt
  return turn === 0 ? 0 : turn
}

// The quarter turn a box is nearest to: straightening turns it from there, so a photo the person
// turned on its side on purpose stays on its side.
export function quarterTurn(rotation: number): number {
  return normalizeAngle(Math.round(rotation / (Math.PI / 2)) * (Math.PI / 2))
}

// How much bigger a w × h picture must get, turned by `degrees`, to still cover its own upright
// frame with no see-through corners.
export function coverScale(width: number, height: number, degrees: number): number {
  const w = Math.abs(width)
  const h = Math.abs(height)
  const a = (Math.abs(degrees) * Math.PI) / 180
  if (a === 0 || w === 0 || h === 0) return 1
  return Math.cos(a) + Math.max(w / h, h / w) * Math.sin(a)
}

// The picture's box turned by `degrees` from its upright frame and grown just enough that the
// frame stays covered.
export function straightenedBox(box: TransformBox, degrees: number): TransformBox {
  const frame = quarterTurn(box.rotation)
  const scale = coverScale(box.width, box.height, degrees)
  return { ...box, width: box.width * scale, height: box.height * scale, rotation: normalizeAngle(frame + (degrees * Math.PI) / 180) }
}

// The upright frame the picture filled before it was turned, on the design.
export function frameRect(box: TransformBox): Rect {
  return polygonBounds(boxCorners({ ...box, rotation: quarterTurn(box.rotation) }))!
}

// True when the grown picture would show outside its frame somewhere on the page, so it needs
// trimming. A photo filling the whole page doesn't: the page's edge already trims it, and its
// pixels stay exactly as they were.
export function needsTrim(turned: TransformBox, frame: Rect, page: { width: number; height: number }): boolean {
  const bounds = polygonBounds(boxCorners(turned))!
  const left = Math.max(0, bounds.x)
  const top = Math.max(0, bounds.y)
  const right = Math.min(page.width, bounds.x + bounds.width)
  const bottom = Math.min(page.height, bounds.y + bounds.height)
  const slack = 0.5
  return left < frame.x - slack || top < frame.y - slack || right > frame.x + frame.width + slack || bottom > frame.y + frame.height + slack
}

// How detailed the trimmed picture is: its own pixels for each design pixel of the frame, so the
// part that shows keeps the original's detail (nothing is enlarged), and its size in pixels.
export function trimmedSize(box: TransformBox, sourceWidth: number, sourceHeight: number, degrees: number): { density: number; width: number; height: number } {
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const density = Math.max(sourceWidth / w, sourceHeight / h) / coverScale(w, h, degrees)
  return { density, width: Math.max(1, Math.round(w * density)), height: Math.max(1, Math.round(h * density)) }
}
