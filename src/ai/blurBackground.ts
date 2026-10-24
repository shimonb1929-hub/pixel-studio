import { blurPixels } from '../editor/adjust.ts'

// Blur the background (pro: Lens Blur, depth of field, portrait mode): the main thing in a photo
// stays sharp and everything behind it goes soft, like a photo from an expensive camera.
//
// The main thing is found by the same AI as Remove background, in the user's own photo; nothing is
// made up. The background is blurred from background pixels only ("normalized" blur: each pixel is
// the average of the background around it, not counting the main thing), so the main thing's
// colors never smear out into a halo around it. Under the main thing, the background is filled in
// from the background nearby, which only shows through its soft edge.

// How strong the blur is for a slider position (0 to 1), as a blur size in pixels of a picture
// whose longer side is `size`. The same position looks the same on a small and a big photo.
export function backgroundBlurSigma(amount: number, size: number): number {
  return Math.pow(Math.min(1, Math.max(0, amount)), 1.5) * 0.03 * size
}

// The slider starts here: clearly blurred, still natural.
export const DEFAULT_BACKGROUND_BLUR = 0.5

// How soft the main thing's edge is, in pixels of a mask whose longer side is `size`: a hard,
// pixel-sharp edge looks cut out.
export function edgeSoftness(size: number): number {
  return Math.max(1, size * 0.003)
}

// The AI's yes/no mask (1 = main thing) as soft weights from 0 to 255, with a feathered edge.
export function softMask(mask: Uint8Array, width: number, height: number, softness: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = mask[i] ? 255 : 0
    rgba[i * 4 + 3] = 255
  }
  blurPixels(rgba, width, height, softness)
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]
  return out
}

// How much each pixel counts as background (0 to 255), from the soft mask. Everything at least
// half main thing doesn't count at all, so none of its colors reach the background.
export function backgroundWeight(subject: number): number {
  return Math.max(0, 255 - 2 * subject)
}

// The background blurred by `sigma` pixels, from background pixels only, the same size as `data`
// (RGBA). `subject` holds the soft mask (0 to 255 for each pixel). Where no background is near
// enough (deep inside a big main thing), the blur reaches further and further until it finds
// some, so the soft edge never shows a dark or empty fringe. How see-through each pixel is stays
// as it was.
export function blurredBackground(data: Uint8ClampedArray, subject: Uint8ClampedArray, width: number, height: number, sigma: number): Uint8ClampedArray {
  const count = width * height
  const out = new Uint8ClampedArray(data.length)
  const filled = new Uint8Array(count)
  // Only pixels where the background shows at all need a color; the rest stay the main thing.
  let missing = 0
  for (let i = 0; i < count; i++) {
    if (subject[i] < 255) missing++
    else filled[i] = 1
  }
  const work = new Uint8ClampedArray(data.length)
  let reach = Math.max(sigma, 0)
  for (let pass = 0; pass < 12 && missing > 0; pass++) {
    for (let i = 0; i < count; i++) {
      const o = i * 4
      work[o] = data[o]
      work[o + 1] = data[o + 1]
      work[o + 2] = data[o + 2]
      // How much it counts goes in as how solid it is: blurring then divides the weighted colors
      // by the total weight, which is just the average of the background around each pixel.
      work[o + 3] = (data[o + 3] * backgroundWeight(subject[i])) / 255
    }
    blurPixels(work, width, height, reach)
    for (let i = 0; i < count; i++) {
      if (filled[i]) continue
      const o = i * 4
      // A few percent of background nearby is plenty to know its color.
      if (work[o + 3] < 6) continue
      out[o] = work[o]
      out[o + 1] = work[o + 1]
      out[o + 2] = work[o + 2]
      filled[i] = 1
      missing--
    }
    reach = Math.max(2, reach * 2.5)
  }
  for (let i = 0; i < count; i++) {
    const o = i * 4
    // Still missing (a photo that is all main thing): its own color.
    if (!filled[i] || subject[i] === 255) {
      out[o] = data[o]
      out[o + 1] = data[o + 1]
      out[o + 2] = data[o + 2]
    }
    out[o + 3] = data[o + 3]
  }
  return out
}

// Whether the AI's mask is a usable main thing: not nothing, and not the whole photo.
export function usableSubject(mask: Uint8Array): boolean {
  let kept = 0
  for (let i = 0; i < mask.length; i++) kept += mask[i] ? 1 : 0
  return kept >= mask.length * 0.005 && kept <= mask.length * 0.97
}
