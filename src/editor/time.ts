import { dateLocale, language, t } from '../i18n/i18n.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// When a design was last changed, the way a person would say it: "5 minutes ago", "yesterday".
export function describeEdited(time: number, now = Date.now()): string {
  const ago = now - time
  if (ago < MINUTE) return t('Edited just now')
  if (ago < HOUR) {
    const minutes = Math.floor(ago / MINUTE)
    return minutes === 1 ? t('Edited 1 minute ago') : t('Edited {count} minutes ago', { count: minutes })
  }
  const then = new Date(time)
  const today = new Date(now)
  if (sameDay(then, today)) {
    return t('Edited today at {time}', { time: then.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' }) })
  }
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (sameDay(then, yesterday)) return t('Edited yesterday')
  const sameYear = then.getFullYear() === today.getFullYear()
  const month = language() === 'yi' ? 'numeric' : 'short'
  return t('Edited {date}', { date: then.toLocaleDateString(dateLocale(), { month, day: 'numeric', year: sameYear ? undefined : 'numeric' }) })
}
