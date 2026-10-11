import type { TextStyle } from '../editor/types.ts'
import { DEFAULT_FONT } from './fonts.ts'

// Ready-made kinds of text to start from, sized to the design.
export type TextKind = 'heading' | 'subheading' | 'body'

export interface TextKindInfo {
  name: string
  // The words a new text of this kind starts with, all picked so typing replaces them.
  sample: string
  description: string
  // Size as a share of the design's shorter side.
  size: number
  weight: number
  lineHeight: number
  // Headings stay centered where they were added while you type over the sample words.
  align: 'auto' | 'center'
}

export const TEXT_KINDS: Record<TextKind, TextKindInfo> = {
  heading: { name: 'Heading', sample: 'Your heading', description: 'Big, bold words that catch the eye.', size: 0.11, weight: 800, lineHeight: 1.1, align: 'center' },
  subheading: { name: 'Subheading', sample: 'A line under the heading', description: 'Medium words that say a little more.', size: 0.06, weight: 600, lineHeight: 1.2, align: 'center' },
  body: { name: 'Body text', sample: 'Your text goes here. Click to change it.', description: 'Smaller words for details, in a box that wraps its lines.', size: 0.035, weight: 400, lineHeight: 1.4, align: 'auto' },
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: DEFAULT_FONT,
  size: 48,
  weight: 700,
  italic: false,
  color: '#1b1d23',
  align: 'auto',
  direction: 'auto',
  letterSpacing: 0,
  lineHeight: 1.2,
}

// A size that suits the design, for text added without choosing one.
export function textSizeFor(width: number, height: number, share: number): number {
  return Math.max(6, Math.round(Math.min(width, height) * share))
}
