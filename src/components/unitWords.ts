import { live, msg, t } from '../i18n/i18n.ts'
import type { Unit } from '../editor/units.ts'

// The units' names, for menus and for after a number.
export const UNIT_CHOICES: { value: Unit; label: string; description: string }[] = live([
  { value: 'px', label: msg('Pixels'), description: msg('Count in pixels. Best for screens, posts and websites.') },
  { value: 'in', label: msg('Inches'), description: msg('Count in inches. Best for things you will print.') },
  { value: 'cm', label: msg('Centimeters'), description: msg('Count in centimeters. Best for things you will print.') },
  { value: 'mm', label: msg('Millimeters'), description: msg('Count in millimeters, for exact print sizes like business cards.') },
])

// The short name shown after a number: 12 px, 8.5 in, 21 cm.
export function unitShort(unit: Unit): string {
  if (unit === 'in') return t('in')
  if (unit === 'cm') return t('cm')
  if (unit === 'mm') return t('mm')
  return 'px'
}
