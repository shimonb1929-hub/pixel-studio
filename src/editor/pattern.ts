import type { PathSink } from './objects.ts'

// Pattern fills (pro: Pattern swatches): little shapes repeated across the inside of a shape, like
// dots, stripes or checks. They are drawn as real shapes, so they stay sharp at any size, and they
// keep their size when the shape is resized (a bigger shape gets more dots, not bigger ones).

export type PatternKind = 'dots' | 'stripes' | 'checks' | 'grid' | 'zigzag' | 'waves' | 'stars' | 'hearts'

export const PATTERN_KINDS: PatternKind[] = ['dots', 'stripes', 'checks', 'grid', 'zigzag', 'waves', 'stars', 'hearts']

export interface Pattern {
  kind: PatternKind
  // The color of the little shapes.
  color: string
  // The color behind them, or null to see through.
  background: string | null
  // How far apart they repeat, in design pixels.
  size: number
  // How far the pattern is turned, in degrees.
  angle: number
}

// At most this many little shapes are drawn: a tiny pattern on a huge shape grows its size instead,
// so drawing stays quick.
const MAX_CELLS = 6000

// A pattern that suits a shape of this size: about eight repeats across its shorter side.
export function startingPattern(color: string, background: string | null, w: number, h: number, kind: PatternKind = 'dots'): Pattern {
  const side = Math.max(1, Math.min(Math.abs(w), Math.abs(h)))
  return { kind, color, background, size: Math.max(4, Math.round(side / 8)), angle: kind === 'stripes' ? 45 : 0 }
}

// The repeat size actually drawn in a w by h box: the pattern's own, unless that would mean too
// many little shapes.
export function drawnSize(pattern: Pattern, w: number, h: number): number {
  const reach = Math.hypot(w, h)
  return Math.max(pattern.size, 1, reach / Math.sqrt(MAX_CELLS))
}

// Adds the little shapes of the pattern to `path`, covering a w by h box centered on 0, 0 (the way
// shapes are drawn). Everything goes the same way round, so they can be filled in one go.
export function patternPath<T extends PathSink>(pattern: Pattern, w: number, h: number, path: T): T {
  const s = drawnSize(pattern, w, h)
  // Far enough to cover the box however the pattern is turned.
  const reach = Math.hypot(w, h) / 2 + s
  const turn = (pattern.angle * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const at = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos]
  const move = (x: number, y: number) => path.moveTo(...at(x, y))
  const line = (x: number, y: number) => path.lineTo(...at(x, y))
  const curve = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => path.bezierCurveTo(...at(x1, y1), ...at(x2, y2), ...at(x, y))
  // A box in the pattern's own (turned) space, clockwise on screen.
  const box = (x: number, y: number, bw: number, bh: number) => {
    move(x, y)
    line(x + bw, y)
    line(x + bw, y + bh)
    line(x, y + bh)
    path.closePath()
  }
  // One repeat sits right in the middle of the shape, so the pattern is even on both sides.
  const half = s / 2
  const first = Math.floor(-reach / s)
  const last = Math.ceil(reach / s)
  const from = first * s - half
  const to = (last + 1) * s - half
  for (let row = first; row <= last; row++) {
    const y = row * s - half
    if (pattern.kind === 'stripes') {
      box(from, y, to - from, s / 2)
      continue
    }
    if (pattern.kind === 'grid') {
      const t = s * 0.12
      box(from, y, to - from, t)
      continue
    }
    if (pattern.kind === 'zigzag' || pattern.kind === 'waves') {
      // A band that goes up and down, a fifth of the repeat thick.
      const t = s * 0.2
      const middle = y + s / 2
      const high = middle - s * 0.2
      const low = middle + s * 0.2
      move(from, high)
      for (let x = from; x < to; x += s) {
        if (pattern.kind === 'zigzag') {
          line(x + s / 2, low)
          line(x + s, high)
        } else {
          curve(x + s / 4, high, x + s / 4, low, x + s / 2, low)
          curve(x + (3 * s) / 4, low, x + (3 * s) / 4, high, x + s, high)
        }
      }
      line(to, high + t)
      for (let x = to; x > from; x -= s) {
        if (pattern.kind === 'zigzag') {
          line(x - s / 2, low + t)
          line(x - s, high + t)
        } else {
          curve(x - s / 4, high + t, x - s / 4, low + t, x - s / 2, low + t)
          curve(x - (3 * s) / 4, low + t, x - (3 * s) / 4, high + t, x - s, high + t)
        }
      }
      path.closePath()
      continue
    }
    for (let column = first; column <= last; column++) {
      const x = column * s - half
      const cx = x + s / 2
      const cy = y + s / 2
      if (pattern.kind === 'dots') {
        const [px, py] = at(cx, cy)
        const r = s * 0.22
        path.moveTo(px + r, py)
        path.ellipse(px, py, r, r, 0, 0, Math.PI * 2)
      } else if (pattern.kind === 'checks') {
        if ((row + column) % 2 === 0) box(x, y, s, s)
      } else if (pattern.kind === 'stars') {
        const outer = s * 0.34
        const inner = outer * 0.42
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          const r = i % 2 === 0 ? outer : inner
          if (i === 0) move(cx + r * Math.cos(a), cy + r * Math.sin(a))
          else line(cx + r * Math.cos(a), cy + r * Math.sin(a))
        }
        path.closePath()
      } else if (pattern.kind === 'hearts') {
        const k = s * 0.3
        move(cx, cy + k)
        curve(cx - k * 1.2, cy + k * 0.1, cx - k * 1.1, cy - k * 1, cx, cy - k * 0.45)
        curve(cx + k * 1.1, cy - k * 1, cx + k * 1.2, cy + k * 0.1, cx, cy + k)
        path.closePath()
      }
    }
  }
  if (pattern.kind === 'grid') {
    // The lines going down, too.
    const t = s * 0.12
    for (let column = first; column <= last; column++) box(column * s - half, from, t, to - from)
  }
  return path
}

// A soft, light version of a color, for behind a pattern: the little shapes stand out, and the
// whole still looks like that color.
export function softTint(hex: string): string {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!value) return '#ffffff'
  const channel = (i: number) => Math.round(parseInt(value.slice(i, i + 2), 16) * 0.2 + 255 * 0.8)
  return `#${[0, 2, 4].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`
}
