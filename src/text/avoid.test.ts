import { describe, expect, it } from 'vitest'
import type { AvoidArea } from '../editor/types.ts'
import { avoidMargins, avoidSlots, reachInRow } from './avoid.ts'
import { graphemes, layoutText, lineInRow, type LayoutSettings, type TextMeasure } from './layout.ts'

// Every letter (and space) is 10 pixels wide; lines are 15 pixels tall.
const measure: TextMeasure = { width: (text) => graphemes(text).length * 10, ascent: 8, descent: 2 }
const settings: LayoutSettings = { size: 10, lineHeight: 1.5, align: 'auto', direction: 'auto' }

const square = (x: number, y: number, w: number, h: number, side: AvoidArea['side'], gap = 0): AvoidArea => ({
  outlines: [
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  ],
  gap,
  side,
})

describe('room in each row', () => {
  it('measures how far a thing reaches across a row, with its space around it', () => {
    const area = square(100, 20, 50, 30, 'left', 5)
    expect(reachInRow(area, 0, 10)).toBeNull()
    expect(reachInRow(area, 15, 30)).toEqual([95, 155])
    // A diamond reaches further across in its middle rows.
    const diamond: AvoidArea = { outlines: [[{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }]], gap: 0, side: 'right' }
    expect(reachInRow(diamond, 0, 10)).toEqual([40, 60])
    expect(reachInRow(diamond, 45, 55)).toEqual([0, 100])
  })

  it('keeps text on its side, and leaves rows too narrow for words empty', () => {
    const slots = avoidSlots([square(150, 15, 50, 15, 'left')], 200, 15, 10)
    expect(slots(0)).toEqual({ x: 0, width: 200, narrowed: false })
    expect(slots(1)).toEqual({ x: 0, width: 150, narrowed: true })
    expect(slots(2)).toEqual({ x: 0, width: 200, narrowed: false })
    expect(avoidSlots([square(20, 15, 175, 15, 'left')], 200, 15, 10)(1)).toBeNull()
    expect(avoidSlots([square(20, 15, 50, 15, 'none')], 200, 15, 10)(1)).toBeNull()
    expect(avoidMargins([square(0, 15, 50, 15, 'right')], 200, 15, 10)).toEqual([
      { left: 0, right: 0 },
      { left: 50, right: 0 },
      { left: 0, right: 0 },
    ])
  })
})

describe('text flowing around things', () => {
  it('wraps each line to the room in its row and skips rows with none', () => {
    const rows = avoidSlots([square(0, 15, 100, 15, 'right'), square(0, 30, 200, 15, 'none')], 200, 15, 10)
    const layout = layoutText('aaaa bbbb cccc dddd eeee ffff gggg hhhh', settings, 200, measure, undefined, undefined, rows)
    expect(layout.lines.map((l) => [l.text, l.row, l.x])).toEqual([
      ['aaaa bbbb cccc dddd', 0, 0],
      ['eeee ffff', 1, 100],
      ['gggg hhhh', 3, 0],
    ])
    expect(layout.height).toBe(60)
    expect(lineInRow(layout, 2)?.text).toBe('eeee ffff')
  })

  it('moves a word that does not fit beside something down, instead of splitting it', () => {
    const rows = avoidSlots([square(0, 0, 150, 15, 'right')], 200, 15, 10)
    const layout = layoutText('abcdefgh ij', settings, 200, measure, undefined, undefined, rows)
    expect(layout.lines.map((l) => [l.text, l.row])).toEqual([['abcdefgh ij', 1]])
  })

  it('lines up right-to-left text with the right edge of its room', () => {
    const rows = avoidSlots([square(120, 0, 80, 15, 'left')], 200, 15, 10)
    const layout = layoutText('אבג דהו זחט', settings, 200, measure, undefined, undefined, rows)
    expect(layout.lines[0].row).toBe(0)
    expect(layout.lines[0].x + layout.lines[0].width).toBe(120)
  })
})
