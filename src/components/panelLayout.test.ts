import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, MAX_WIDTH, MIN_WIDTH, canMove, isDefaultLayout, movePanel, setShown, tidyLayout } from './panelLayout.ts'

describe('panel layout', () => {
  it('moves a panel up and down among the others', () => {
    const moved = movePanel(DEFAULT_LAYOUT, 'effects', -1)
    expect(moved.order).toEqual(['settings', 'effects', 'color', 'layers'])
    expect(movePanel(moved, 'effects', -1).order).toEqual(['effects', 'settings', 'color', 'layers'])
    // Already at the top, or next to Layers at the bottom: nothing changes.
    expect(canMove(DEFAULT_LAYOUT, 'settings', -1)).toBe(false)
    expect(canMove(DEFAULT_LAYOUT, 'effects', 1)).toBe(false)
  })

  it('puts Layers on top or at the bottom', () => {
    const top = movePanel(DEFAULT_LAYOUT, 'layers', -1)
    expect(top.order).toEqual(['layers', 'settings', 'color', 'effects'])
    expect(canMove(top, 'layers', -1)).toBe(false)
    expect(movePanel(top, 'color', 1).order).toEqual(['layers', 'settings', 'effects', 'color'])
    expect(movePanel(top, 'layers', 1).order).toEqual(DEFAULT_LAYOUT.order)
  })

  it('hides and shows panels, and knows when it is back to how it was', () => {
    const hidden = setShown(DEFAULT_LAYOUT, 'color', false)
    expect(hidden.hidden).toEqual(['color'])
    expect(isDefaultLayout(hidden)).toBe(false)
    expect(isDefaultLayout(setShown(hidden, 'color', true))).toBe(true)
  })

  it('mends a kept layout that is old or broken', () => {
    expect(tidyLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(tidyLayout({ order: ['color', 'layers', 'color', 'nope'], hidden: ['effects', 'x'], width: 9999 })).toEqual({
      order: ['color', 'settings', 'effects', 'layers'],
      hidden: ['effects'],
      width: MAX_WIDTH,
    })
    expect(tidyLayout({ width: 10 }).width).toBe(MIN_WIDTH)
    expect(tidyLayout({ order: ['layers', 'effects'] }).order).toEqual(['layers', 'effects', 'settings', 'color'])
  })
})
