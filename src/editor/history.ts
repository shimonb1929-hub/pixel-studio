// Undo and redo. Each entry knows how to go back (before) and forward (after); the editor
// decides what those mean. Entries with the same merge key that arrive close together become
// one step, so dragging a slider is a single undo instead of fifty.

export interface HistoryEntry<T> {
  label: string
  change: T
  // Rough memory used, so very large edits push out the oldest steps first.
  bytes: number
  mergeKey?: string
  time: number
}

export interface HistoryLimits {
  maxEntries: number
  maxBytes: number
}

export const MERGE_WINDOW_MS = 1000

const DEFAULT_LIMITS: HistoryLimits = { maxEntries: 100, maxBytes: 512 * 1024 * 1024 }

export class History<T> {
  private entries: HistoryEntry<T>[] = []
  // How many entries are currently applied. Undo moves it back, redo moves it forward.
  private position = 0
  // The position when the design was last saved; -1 means that state can't be reached anymore.
  private savedPosition = 0
  private readonly limits: HistoryLimits
  private readonly merge: (earlier: T, later: T) => T

  constructor(merge: (earlier: T, later: T) => T, limits: Partial<HistoryLimits> = {}) {
    this.merge = merge
    this.limits = { ...DEFAULT_LIMITS, ...limits }
  }

  push(entry: Omit<HistoryEntry<T>, 'time'>, now = Date.now()): void {
    // A new change after some undos throws away the steps that were undone.
    if (this.position < this.entries.length) {
      this.entries.length = this.position
      if (this.savedPosition > this.position) this.savedPosition = -1
    }

    const top = this.entries[this.position - 1]
    if (top && entry.mergeKey && top.mergeKey === entry.mergeKey && now - top.time < MERGE_WINDOW_MS) {
      this.entries[this.position - 1] = {
        ...top,
        change: this.merge(top.change, entry.change),
        bytes: top.bytes + entry.bytes,
        time: now,
      }
      // The saved state was the one before this merge, which no longer exists on its own.
      if (this.savedPosition === this.position) this.savedPosition = -1
      return
    }

    this.entries.push({ ...entry, time: now })
    this.position = this.entries.length
    this.trim()
  }

  undo(): HistoryEntry<T> | null {
    if (this.position === 0) return null
    this.position -= 1
    return this.entries[this.position]
  }

  redo(): HistoryEntry<T> | null {
    if (this.position >= this.entries.length) return null
    this.position += 1
    return this.entries[this.position - 1]
  }

  get undoLabel(): string | null {
    return this.position > 0 ? this.entries[this.position - 1].label : null
  }

  get redoLabel(): string | null {
    return this.position < this.entries.length ? this.entries[this.position].label : null
  }

  get isDirty(): boolean {
    return this.position !== this.savedPosition
  }

  get size(): number {
    return this.entries.length
  }

  markSaved(): void {
    this.savedPosition = this.position
  }

  clear(): void {
    this.entries = []
    this.position = 0
    this.savedPosition = 0
  }

  private trim(): void {
    let bytes = this.entries.reduce((sum, e) => sum + e.bytes, 0)
    while (this.entries.length > 1 && (this.entries.length > this.limits.maxEntries || bytes > this.limits.maxBytes)) {
      const dropped = this.entries.shift()!
      bytes -= dropped.bytes
      this.position -= 1
      this.savedPosition = this.savedPosition > 0 ? this.savedPosition - 1 : -1
    }
  }
}
