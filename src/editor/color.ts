import { live, msg } from '../i18n/i18n.ts'
export interface Rgb {
  r: number
  g: number
  b: number
}

// Hue 0–360, saturation and value 0–1.
export interface Hsv {
  h: number
  s: number
  v: number
}

// Accepts "#3366ff", "3366FF", "#36f" or "36f". Returns "#3366ff", or null if it isn't a color code.
export function normalizeHex(input: string): string | null {
  const text = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(text)) return `#${[...text].map((c) => c + c).join('')}`
  if (/^[0-9a-f]{6}$/.test(text)) return `#${text}`
  return null
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000'
  const value = parseInt(normalized.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = v - c
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) }
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex))
}

// Dark text on light colors, white text on dark ones.
export function isLight(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}

export const SWATCHES: { hex: string; name: string }[] = live([
  { hex: '#1b1d23', name: msg('Black') },
  { hex: '#4b5262', name: msg('Dark gray') },
  { hex: '#9aa1ad', name: msg('Gray') },
  { hex: '#e3e6eb', name: msg('Light gray') },
  { hex: '#ffffff', name: msg('White') },
  { hex: '#7a4a2a', name: msg('Brown') },
  { hex: '#c98a5a', name: msg('Tan') },
  { hex: '#f3d2b3', name: msg('Peach') },
  { hex: '#fbe7a1', name: msg('Cream') },
  { hex: '#ef4444', name: msg('Red') },
  { hex: '#f97316', name: msg('Orange') },
  { hex: '#facc15', name: msg('Yellow') },
  { hex: '#22c55e', name: msg('Green') },
  { hex: '#14b8a6', name: msg('Teal') },
  { hex: '#0ea5e9', name: msg('Sky blue') },
  { hex: '#3b5bfd', name: msg('Blue') },
  { hex: '#8b5cf6', name: msg('Purple') },
  { hex: '#ec4899', name: msg('Pink') },
])
