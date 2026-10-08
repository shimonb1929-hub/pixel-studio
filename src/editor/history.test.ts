import { describe, expect, it } from 'vitest'
import { History, MERGE_WINDOW_MS } from './history.ts'

interface Change {
  from: number
  to: number
}

const merge = (a: Change, b: Change): Change => ({ from: a.from, to: b.to })

function step(label: string, from: number, to: number, extra: { mergeKey?: string; bytes?: number } = {}) {
  return { label, change: { from, to }, bytes: extra.bytes ?? 0, mergeKey: extra.mergeKey }
}

describe('History', () => {
  it('undoes and redoes in order', () => {
    const history = new History(merge)
    history.push(step('A', 0, 1))
    history.push(step('B', 1, 2))
    expect(history.undoLabel).toBe('B')
    expect(history.undo()?.label).toBe('B')
    expect(history.undo()?.label).toBe('A')
    expect(history.undo()).toBeNull()
    expect(history.redoLabel).toBe('A')
    expect(history.redo()?.label).toBe('A')
    expect(history.redo()?.label).toBe('B')
    expect(history.redo()).toBeNull()
  })

  it('throws away undone steps when something new happens', () => {
    const history = new History(merge)
    history.push(step('A', 0, 1))
    history.push(step('B', 1, 2))
    history.undo()
    history.push(step('C', 1, 3))
    expect(history.redoLabel).toBeNull()
    expect(history.size).toBe(2)
    expect(history.undo()?.label).toBe('C')
    expect(history.undo()?.label).toBe('A')
  })

  it('merges quick changes with the same key into one step', () => {
    const history = new History(merge)
    history.push(step('Opacity', 100, 90, { mergeKey: 'opacity:1' }), 0)
    history.push(step('Opacity', 90, 50, { mergeKey: 'opacity:1' }), 300)
    history.push(step('Opacity', 50, 40, { mergeKey: 'opacity:2' }), 400)
    expect(history.size).toBe(2)
    history.undo()
    expect(history.undo()?.change).toEqual({ from: 100, to: 50 })
  })

  it('does not merge changes that are far apart in time', () => {
    const history = new History(merge)
    history.push(step('Opacity', 100, 90, { mergeKey: 'opacity:1' }), 0)
    history.push(step('Opacity', 90, 50, { mergeKey: 'opacity:1' }), MERGE_WINDOW_MS + 1)
    expect(history.size).toBe(2)
  })

  it('knows when there are changes since the last save', () => {
    const history = new History(merge)
    expect(history.isDirty).toBe(false)
    history.push(step('A', 0, 1))
    expect(history.isDirty).toBe(true)
    history.markSaved()
    expect(history.isDirty).toBe(false)
    history.undo()
    expect(history.isDirty).toBe(true)
    history.redo()
    expect(history.isDirty).toBe(false)
  })

  it('stays dirty when the saved step is replaced by a new branch', () => {
    const history = new History(merge)
    history.push(step('A', 0, 1))
    history.push(step('B', 1, 2))
    history.markSaved()
    history.undo()
    history.push(step('C', 1, 3))
    history.undo()
    history.push(step('D', 1, 4))
    expect(history.isDirty).toBe(true)
  })

  it('stays dirty when a merge changes the saved step', () => {
    const history = new History(merge)
    history.push(step('Opacity', 100, 90, { mergeKey: 'o' }), 0)
    history.markSaved()
    history.push(step('Opacity', 90, 80, { mergeKey: 'o' }), 100)
    expect(history.isDirty).toBe(true)
  })

  it('drops the oldest steps when there are too many', () => {
    const history = new History(merge, { maxEntries: 3 })
    for (let i = 0; i < 5; i++) history.push(step(`S${i}`, i, i + 1))
    expect(history.size).toBe(3)
    expect(history.undo()?.label).toBe('S4')
    expect(history.undo()?.label).toBe('S3')
    expect(history.undo()?.label).toBe('S2')
    expect(history.undo()).toBeNull()
  })

  it('drops the oldest steps when they use too much memory, but keeps the newest', () => {
    const history = new History(merge, { maxBytes: 100 })
    history.push(step('Small', 0, 1, { bytes: 40 }))
    history.push(step('Small', 1, 2, { bytes: 40 }))
    history.push(step('Big', 2, 3, { bytes: 90 }))
    expect(history.size).toBe(1)
    expect(history.undoLabel).toBe('Big')
    history.push(step('Huge', 3, 4, { bytes: 500 }))
    expect(history.size).toBe(1)
    expect(history.undoLabel).toBe('Huge')
  })

  it('is dirty forever once the saved state is dropped', () => {
    const history = new History(merge, { maxEntries: 2 })
    history.markSaved()
    history.push(step('A', 0, 1))
    history.push(step('B', 1, 2))
    history.push(step('C', 2, 3))
    history.undo()
    history.undo()
    expect(history.isDirty).toBe(true)
  })

  it('clears everything', () => {
    const history = new History(merge)
    history.push(step('A', 0, 1))
    history.clear()
    expect(history.size).toBe(0)
    expect(history.undoLabel).toBeNull()
    expect(history.isDirty).toBe(false)
  })
})
