import { describe, expect, it } from 'vitest'
import { MAX_SAVE_WAIT_MS, SAVE_DELAY_MS, saveDelay } from './useAutosave.ts'

describe('saveDelay', () => {
  it('waits a moment after a change', () => {
    expect(saveDelay(1000, 1000)).toBe(SAVE_DELAY_MS)
  })

  it('never waits past the longest wait, even when changes keep coming', () => {
    expect(saveDelay(0, MAX_SAVE_WAIT_MS - 300)).toBe(300)
    expect(saveDelay(0, MAX_SAVE_WAIT_MS + 5000)).toBe(0)
  })
})
