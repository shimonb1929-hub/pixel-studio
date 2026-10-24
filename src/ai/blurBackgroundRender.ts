import { createCanvas, getContext2d } from '../editor/document.ts'
import { backgroundBlurSigma, blurredBackground, edgeSoftness, softMask } from './blurBackground.ts'
import { AI_PICTURE_SIDE, findThing, type FoundMask } from './segment.ts'

// Finding the main thing in a photo and drawing it with the background blurred behind it.

// Previews stay quick by working on at most this many pixels.
const MAX_PREVIEW_PIXELS = 1_500_000
// A strong blur is worked out on a smaller copy and enlarged again: a blurred picture has no fine
// detail to lose, and it's many times quicker. This much blur (in pixels of the smaller copy) is
// the least it is worked out at; quick previews go smaller sooner.
const APPLY_BLUR_DETAIL = 3
const PREVIEW_BLUR_DETAIL = 1.5
// Even at full detail, the background is never worked out on more pixels than this.
const MAX_WORK_PIXELS = 4_000_000

// The photo's main thing, found by the AI in the photo itself (the same way as Remove
// background). `key` stands for the photo's pixels, so asking again is quick.
export async function findMainThing(source: HTMLCanvasElement, key: string): Promise<FoundMask> {
  const scale = Math.min(1, AI_PICTURE_SIDE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const picture = () => {
    const small = createCanvas(width, height)
    const ctx = small.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  }
  // A box just inside the edges asks for the main thing in the photo.
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.01))
  return findThing(`${key}:${width}x${height}`, picture, [], [inset, inset, width - inset, height - inset])
}

// The main thing's soft edge as a picture (see-through where the background is), the size of the
// AI's mask. Worked out once per photo.
const softEdges = new WeakMap<FoundMask, HTMLCanvasElement>()
function subjectPicture(found: FoundMask): HTMLCanvasElement {
  const kept = softEdges.get(found)
  if (kept) return kept
  const soft = softMask(found.mask, found.width, found.height, edgeSoftness(Math.max(found.width, found.height)))
  const canvas = createCanvas(found.width, found.height)
  const ctx = getContext2d(canvas)
  const pixels = ctx.createImageData(found.width, found.height)
  for (let i = 0; i < soft.length; i++) pixels.data[i * 4 + 3] = soft[i]
  ctx.putImageData(pixels, 0, 0)
  softEdges.set(found, canvas)
  return canvas
}

// `source` drawn at a new size. `read` when its pixels will be read back.
function drawnAt(source: CanvasImageSource, width: number, height: number, read = false): HTMLCanvasElement {
  const canvas = createCanvas(width, height)
  const ctx = read ? canvas.getContext('2d', { willReadFrequently: true })! : getContext2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

// How big a preview needs to be, from 0 to 1 of the photo's own size.
export function blurPreviewScale(source: HTMLCanvasElement): number {
  return Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (source.width * source.height)))
}

// The photo with its background blurred by `amount` (0 to 1), at `scale` of its own size (1 to
// keep it). The main thing stays exactly as sharp as it was.
export function renderBlurredBackground(source: HTMLCanvasElement, found: FoundMask, amount: number, scale = 1, preview = false): HTMLCanvasElement {
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const out = drawnAt(source, width, height)
  const sigma = backgroundBlurSigma(amount, Math.max(width, height))
  if (sigma < 0.3) return out

  // The background, worked out on a smaller copy.
  const detail = preview ? PREVIEW_BLUR_DETAIL : APPLY_BLUR_DETAIL
  const shrink = Math.min(1, detail / sigma, Math.sqrt(MAX_WORK_PIXELS / (width * height)))
  const workWidth = Math.max(1, Math.round(width * shrink))
  const workHeight = Math.max(1, Math.round(height * shrink))
  const subject = subjectPicture(found)
  const workSubject = drawnAt(subject, workWidth, workHeight, true)
  const softWork = new Uint8ClampedArray(workWidth * workHeight)
  const subjectPixels = workSubject.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, workWidth, workHeight).data
  for (let i = 0; i < softWork.length; i++) softWork[i] = subjectPixels[i * 4 + 3]
  const work = drawnAt(source, workWidth, workHeight, true)
  const workCtx = work.getContext('2d', { willReadFrequently: true })!
  const photo = workCtx.getImageData(0, 0, workWidth, workHeight)
  photo.data.set(blurredBackground(photo.data, softWork, workWidth, workHeight, sigma * (workWidth / width)))
  workCtx.putImageData(photo, 0, 0)

  // Enlarged to full size, see-through where the main thing is (soft along its edge)...
  const behind = drawnAt(work, width, height)
  const behindCtx = getContext2d(behind)
  behindCtx.globalCompositeOperation = 'destination-out'
  behindCtx.imageSmoothingEnabled = true
  behindCtx.imageSmoothingQuality = 'high'
  behindCtx.drawImage(subject, 0, 0, width, height)
  // ...and laid over the sharp photo, keeping how see-through the photo is.
  const ctx = getContext2d(out)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(behind, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return out
}
