import type { BrushSettings } from '../editor/brushes.ts'
import type { EditorDocument, PixelLayer, ToolId, Viewport } from '../editor/types.ts'
import type { HandStep } from './hand.ts'
import type { SoundName } from './sounds.ts'

// What a tour can do in the app while it talks: pick a tool and change the design (each change is
// a normal undo step, so the user keeps the result and can undo it).
export interface TourHost {
  pickTool: (tool: ToolId) => void
  getDoc: () => EditorDocument | null
  // Quick changes with the same `mergeKey` become one undo step (like something gliding).
  change: (label: string, update: (doc: EditorDocument) => EditorDocument, mergeKey?: string) => void
  select: (layerId: string) => void
  // Paints on a layer of pixels, inside `area` (design coordinates), as one undo step.
  paint: (label: string, layerId: string, area: { x: number; y: number; width: number; height: number }, draw: (ctx: CanvasRenderingContext2D, layer: PixelLayer) => void) => void
  // How the page is shown (so the tour's pointer knows where things are on screen).
  getViewport: () => Viewport
  // Chooses a color, exactly as picking it in the Color panel would (for what is picked, if anything).
  pickColor: (hex: string) => void
  // Changes the brush's settings, as moving its sliders would.
  setBrush: (change: Partial<BrushSettings>) => void
}

export interface TourStep {
  id: string
  // What the guide says. Words in [brackets] only told the voice how to sound.
  line: string
  // The recording of the line, in public/ (like 'tour/tools-move.mp3'). Without one, the words
  // are shown for as long as they take to read.
  audio?: string
  // What to shine the spotlight on: a CSS selector, usually [data-tour="…"].
  target?: string
  // Shows something in the app while the line is spoken. Steps that come later (in `parts`) let
  // a demo build up while the guide talks, `at` being how far through the line (0 to 1).
  run?: (host: TourHost) => void
  parts?: { at: number; run: (host: TourHost) => void; sound?: SoundName }[]
  sound?: SoundName
  // Shows the tools being used by the tour's pointer, step by step, while the line is spoken. The
  // next line waits until it is done.
  act?: (hand: HandStep, host: TourHost) => Promise<void>
}

export interface Tour {
  id: string
  title: string
  steps: TourStep[]
  // Tours that show things on a design start on a new, empty one of this size.
  design?: { name: string; width: number; height: number }
  // The tour's pointer does the work on the page: the words then sit at the side, out of its way.
  pointer?: boolean
}

// The words shown on screen while a line is spoken.
export const caption = (line: string) => line.replace(/\[[^\]]*\]\s*/g, '').trim()

// How many of the words have been said when `fraction` of the recording has played. Longer words
// take longer to say, so each word counts by its letters (plus a little for the gap after it).
export function wordsSpoken(words: string[], fraction: number): number {
  if (fraction <= 0) return 0
  if (fraction >= 1) return words.length
  const weights = words.map((w) => w.length + 2)
  const total = weights.reduce((a, b) => a + b, 0)
  let said = 0
  for (let i = 0; i < words.length; i++) {
    said += weights[i]
    if (said / total > fraction) return i
  }
  return words.length
}

// How long the words take to read when there is no recording, in seconds.
export function readingTime(line: string): number {
  const words = caption(line).split(/\s+/).filter(Boolean).length
  return Math.max(2.5, words * 0.36 + 0.8)
}
