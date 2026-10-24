import type { Language } from '../i18n/i18n.ts'
import type { Pixels } from '../editor/upscale.ts'
import { applyAffine, boxMatrix, type Affine } from '../editor/transform.ts'
import { insertLayerAboveActive, keepTogether } from '../editor/layers.ts'
import type { EditorDocument, LayerGroup, PixelLayer, TextLayer, TextStyle } from '../editor/types.ts'
import type { OcrLanguage } from './ocrFiles.ts'

// Words from a picture: turning what text recognition found into real text on the design, each line
// where it was in the picture, about the same size and color. Plain math, kept apart from the
// recognizer itself so it can be tested.

export interface OcrBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

// One line of words found in the picture, in the picture's pixels, in reading order.
export interface FoundLine {
  text: string
  box: OcrBox
  // Where the letters stand: the baseline's two ends.
  baseline: OcrBox | null
  // How sure the recognizer is, 0 to 100.
  confidence: number
}

// The parts of a recognizer result that are used (tesseract.js's Page).
export interface RecognizedPage {
  blocks:
    | {
        paragraphs: {
          lines: { text: string; confidence: number; bbox: OcrBox; baseline?: OcrBox | null }[]
        }[]
      }[]
    | null
}

// Lines the recognizer is less sure of than this are left out: on photos that are mostly not text
// it "reads" shadows and patterns as letters.
export const MIN_CONFIDENCE = 45

// The recognizer marks which way some lines read with invisible marks; the text works that out by
// itself, and stray marks would only get in the way of typing.
const DIRECTION_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

// Letters and digits of any language.
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu

// The lines worth keeping, tidied: spaces trimmed, lines that are mostly marks and lines the
// recognizer wasn't sure of left out.
export function foundLines(page: RecognizedPage, minConfidence = MIN_CONFIDENCE): FoundLine[] {
  const lines: FoundLine[] = []
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.replace(DIRECTION_MARKS, '').replace(/\s+/g, ' ').trim()
        if (!text || line.confidence < minConfidence) continue
        const marks = text.replace(/\s/g, '').length
        const letters = text.match(LETTER_OR_DIGIT)?.length ?? 0
        if (letters === 0 || letters < marks * 0.5) continue
        if (line.bbox.x1 - line.bbox.x0 < 2 || line.bbox.y1 - line.bbox.y0 < 2) continue
        lines.push({ text, box: line.bbox, baseline: line.baseline ?? null, confidence: line.confidence })
      }
    }
  }
  return lines
}

// Lines found on a copy of the picture made `factor` times bigger, back in the picture's own pixels.
export function scaleLines(lines: FoundLine[], factor: number): FoundLine[] {
  const scale = (b: OcrBox): OcrBox => ({ x0: b.x0 / factor, y0: b.y0 / factor, x1: b.x1 / factor, y1: b.y1 / factor })
  return lines.map((line) => ({ ...line, box: scale(line.box), baseline: line.baseline && scale(line.baseline) }))
}

// The languages to look for at first: the app's own language, and English.
export function defaultOcrLanguages(app: Language): OcrLanguage[] {
  if (app === 'he') return ['heb', 'eng']
  if (app === 'yi') return ['yid', 'eng']
  return ['eng']
}

// The recognizer reads Hebrew best when it's asked for first, and Yiddish when Hebrew isn't asked for.
export function ocrLanguageCode(languages: OcrLanguage[]): string {
  const order: OcrLanguage[] = ['heb', 'yid', 'eng']
  return order.filter((l) => languages.includes(l)).join('+') || 'eng'
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

export interface InkLook {
  color: string
  // How much of the line's box the letters cover (0 to 1); thick letters cover more.
  coverage: number
}

// The color of the letters in a box of the picture. Letters cover less of their box than the
// background does, so the pixels are split into a light and a dark group (where the split leaves
// the two groups most different), and the smaller group is the letters. Only the letters' middles
// count, not the soft pixels along their edges.
export function inkLook(pixels: Pixels, box: OcrBox): InkLook {
  const x0 = Math.max(0, Math.floor(box.x0))
  const y0 = Math.max(0, Math.floor(box.y0))
  const x1 = Math.min(pixels.width, Math.ceil(box.x1))
  const y1 = Math.min(pixels.height, Math.ceil(box.y1))
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)))
  const lights: number[] = []
  const at: number[] = []
  const histogram = new Array<number>(256).fill(0)
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * pixels.width + x) * 4
      const a = pixels.data[i + 3] / 255
      // See-through counts as white paper.
      const light = Math.round((pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114) * a + 255 * (1 - a))
      lights.push(light)
      at.push(i)
      histogram[light]++
    }
  }
  if (lights.length === 0) return { color: '#000000', coverage: 0 }
  // Otsu's split: the brightness that makes the two groups most different.
  const total = lights.length
  let sumAll = 0
  for (let v = 0; v < 256; v++) sumAll += v * histogram[v]
  let below = 0
  let sumBelow = 0
  let best = -1
  let split = 128
  for (let v = 0; v < 256; v++) {
    below += histogram[v]
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    sumBelow += v * histogram[v]
    const meanBelow = sumBelow / below
    const meanAbove = (sumAll - sumBelow) / above
    const spread = below * above * (meanBelow - meanAbove) ** 2
    if (spread > best) {
      best = spread
      split = v
    }
  }
  const dark = lights.filter((v) => v <= split).length
  const inkIsDark = dark <= total - dark
  const ink = lights.map((v, k) => ({ v, i: at[k] })).filter(({ v }) => (inkIsDark ? v <= split : v > split))
  // The half of the letter pixels furthest from the split: the letters' middles.
  ink.sort((a, b) => (inkIsDark ? a.v - b.v : b.v - a.v))
  const middles = ink.slice(0, Math.max(1, Math.ceil(ink.length / 2)))
  let r = 0
  let g = 0
  let b = 0
  for (const { i } of middles) {
    const a = pixels.data[i + 3] / 255
    r += pixels.data[i] * a + 255 * (1 - a)
    g += pixels.data[i + 1] * a + 255 * (1 - a)
    b += pixels.data[i + 2] * a + 255 * (1 - a)
  }
  const n = middles.length
  return { color: hex(r / n, g / n, b / n), coverage: ink.length / total }
}

// A letter size for a line that is `width` wide in the picture, given how wide its words are at
// size 100. It's kept near what the line's height suggests, in case the font is much wider or
// narrower than the one in the picture.
export function lineSize(widthAt100: number, width: number, height: number): number {
  const byWidth = widthAt100 > 0 ? (100 * width) / widthAt100 : height
  return Math.min(height * 1.7, Math.max(height * 0.8, byWidth))
}

// How a text look measures (as textMeasure in src/text/textLayer.ts gives it).
export interface Measure {
  width: (text: string, direction: 'ltr' | 'rtl') => number
  // Where the letters stand, from the top of a line of this height (when known).
  baseline?: (lineHeight: number) => number
}

const RTL_FIRST = /^[^\p{L}]*[\p{Script=Hebrew}]/u

// Where the picture's pixels land on the design.
function pictureToDesign(photo: PixelLayer): { matrix: Affine; scale: number; rotation: number } {
  if (photo.box) {
    const matrix = boxMatrix(photo.box, photo.canvas.width, photo.canvas.height)
    const scale = Math.sqrt(Math.abs((photo.box.width * photo.box.height) / (photo.canvas.width * photo.canvas.height)))
    return { matrix, scale, rotation: photo.box.rotation }
  }
  return { matrix: { a: 1, b: 0, c: 0, d: 1, e: photo.x, f: photo.y }, scale: 1, rotation: 0 }
}

// Real text for every found line, placed where it was in the photo (on the design), about as big as
// it was and in its color. Direction and lining up are left to the text itself ('auto'), so Hebrew
// and Yiddish read right to left by themselves. `pixels` is the photo's own pixels; `measure` gives
// the font's measurements for a look.
export function wordLayers(
  lines: FoundLine[],
  photo: PixelLayer,
  pixels: Pixels,
  base: TextStyle,
  measure: (style: TextStyle) => Measure,
  newId: () => string,
  name: (text: string) => string,
): TextLayer[] {
  const { matrix, scale, rotation } = pictureToDesign(photo)
  return lines.map((line) => {
    const direction = RTL_FIRST.test(line.text) ? 'rtl' : 'ltr'
    const look = inkLook(pixels, line.box)
    const width = line.box.x1 - line.box.x0
    const height = line.box.y1 - line.box.y0
    const at100 = measure({ ...base, size: 100 }).width(line.text, direction)
    const size = lineSize(at100, width, height) * scale
    const style: TextStyle = { ...base, size, color: look.color, weight: look.coverage > 0.36 ? 700 : 400, align: 'auto', direction: 'auto' }
    const fits = measure(style)
    const lineHeight = size * style.lineHeight
    const textWidth = fits.width(line.text, direction)
    // Lined up on the picture's baseline when the recognizer found one, else on the line's middle.
    const middleX = (line.box.x0 + line.box.x1) / 2
    let middleY = (line.box.y0 + line.box.y1) / 2
    if (line.baseline && line.baseline.x1 !== line.baseline.x0 && fits.baseline) {
      const along = (middleX - line.baseline.x0) / (line.baseline.x1 - line.baseline.x0)
      const baselineY = line.baseline.y0 + (line.baseline.y1 - line.baseline.y0) * along
      middleY = baselineY + (lineHeight / 2 - fits.baseline(lineHeight)) / scale
    }
    const center = applyAffine(matrix, { x: middleX, y: middleY })
    return {
      id: newId(),
      kind: 'text',
      name: name(line.text),
      visible: true,
      opacity: 1,
      locked: false,
      adjust: null,
      box: { cx: center.x, cy: center.y, width: textWidth, height: lineHeight, rotation },
      text: line.text,
      style,
      wrap: false,
    }
  })
}

// Puts the found words on the design just above their photo, in reading order, kept together as one
// thing (when there is more than one line) so they move as one. The photo stays as it was.
export function addWordLayers(doc: EditorDocument, photoId: string, words: TextLayer[], group: LayerGroup): EditorDocument {
  if (words.length === 0 || !doc.layers.some((l) => l.id === photoId)) return doc
  let next: EditorDocument = { ...doc, activeLayerId: photoId }
  for (const word of words) next = insertLayerAboveActive(next, word)
  return words.length > 1 ? keepTogether(next, words.map((w) => w.id), group) : next
}
