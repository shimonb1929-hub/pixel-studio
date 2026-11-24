import type { Rect } from './geometry.ts'

// Where a picture changed since the screen last drew it.
export class ChangedAreas {
  private areas: Rect[] = []
  private everything = true

  note(area: Rect): void {
    if (!this.everything) this.areas.push(area)
  }

  noteAll(): void {
    this.everything = true
    this.areas = []
  }

  // What changed since the last call: everything, or some areas.
  take(): Rect[] | 'all' {
    const taken = this.everything ? 'all' : this.areas
    this.everything = false
    this.areas = []
    return taken
  }
}
