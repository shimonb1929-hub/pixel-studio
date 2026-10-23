import { useSyncExternalStore } from 'react'

// What sizes and places are counted in. Designs are always made of pixels; the other units are a
// way of typing and reading them, using the design's pixels per inch.
export type Unit = 'px' | 'in' | 'cm' | 'mm'

export const UNITS: Unit[] = ['px', 'in', 'cm', 'mm']

// 300 pixels per inch is sharp on paper; the printed-page presets are made at it.
export const DEFAULT_PPI = 300
export const MAX_PPI = 2400

const PER_INCH: Record<Unit, number> = { px: 1, in: 1, cm: 2.54, mm: 25.4 }
// Enough places to be exact on paper without long tails: 8.5 in, 21 cm, 297 mm.
const PLACES: Record<Unit, number> = { px: 0, in: 2, cm: 2, mm: 1 }

export function pixelsToUnit(pixels: number, unit: Unit, ppi: number): number {
  if (unit === 'px') return Math.round(pixels)
  const places = 10 ** PLACES[unit]
  return Math.round(((pixels / ppi) * PER_INCH[unit]) * places) / places
}

// Rounded to whole pixels, so nothing ends up blurry.
export function unitToPixels(value: number, unit: Unit, ppi: number): number {
  if (unit === 'px') return Math.round(value)
  return Math.round((value / PER_INCH[unit]) * ppi)
}

// A number as typed in the boxes: "8.5", never "8.50" or "8,5".
export function formatInUnit(pixels: number, unit: Unit, ppi: number): string {
  return String(pixelsToUnit(pixels, unit, ppi))
}

// Keeps digits and the first dot, so "8.5" can be typed but "8.5.1" can't. A comma counts as a dot,
// the way much of the world writes it.
export function decimalInput(value: string): string {
  const [whole, ...rest] = value.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

// The same, with a minus sign allowed in front, for places left of or above the design.
export function signedDecimalInput(value: string): string {
  return (value.trim().startsWith('-') ? '-' : '') + decimalInput(value)
}

export function documentPpi(doc: { ppi?: number }): number {
  return doc.ppi && doc.ppi > 0 ? doc.ppi : DEFAULT_PPI
}

// The unit chosen last time is kept in this browser, so it's the same on the next visit.
const STORAGE_KEY = 'pixel-studio-unit'
const listeners = new Set<() => void>()
let current: Unit = readSaved()

function readSaved(): Unit {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    if (saved && (UNITS as string[]).includes(saved)) return saved as Unit
  } catch {
    // No saved choice.
  }
  return 'px'
}

export function getUnit(): Unit {
  return current
}

export function setUnit(next: Unit) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private windows may not keep it; the unit still changes for now.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useUnit(): [Unit, (next: Unit) => void] {
  return [useSyncExternalStore(subscribe, getUnit, () => 'px' as Unit), setUnit]
}
