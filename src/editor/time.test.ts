import { describe, expect, it } from 'vitest'
import { describeEdited } from './time.ts'

describe('describeEdited', () => {
  const now = new Date(2026, 9, 9, 15, 30).getTime()

  it('says how long ago in everyday words', () => {
    expect(describeEdited(now - 20_000, now)).toBe('Edited just now')
    expect(describeEdited(now - 60_000, now)).toBe('Edited 1 minute ago')
    expect(describeEdited(now - 45 * 60_000, now)).toBe('Edited 45 minutes ago')
    expect(describeEdited(new Date(2026, 9, 9, 9, 5).getTime(), now)).toBe('Edited today at 9:05 AM')
    expect(describeEdited(new Date(2026, 9, 8, 23, 59).getTime(), now)).toBe('Edited yesterday')
    expect(describeEdited(new Date(2026, 2, 14).getTime(), now)).toBe('Edited Mar 14')
    expect(describeEdited(new Date(2025, 11, 31).getTime(), now)).toBe('Edited Dec 31, 2025')
  })

  it('treats a clock set slightly wrong as just now', () => {
    expect(describeEdited(now + 5000, now)).toBe('Edited just now')
  })
})
