const MINUTE = 60_000
const HOUR = 60 * MINUTE

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// When a design was last changed, the way a person would say it: "5 minutes ago", "yesterday".
export function describeEdited(time: number, now = Date.now()): string {
  const ago = now - time
  if (ago < MINUTE) return 'Edited just now'
  if (ago < HOUR) {
    const minutes = Math.floor(ago / MINUTE)
    return `Edited ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  const then = new Date(time)
  const today = new Date(now)
  if (sameDay(then, today)) {
    return `Edited today at ${then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (sameDay(then, yesterday)) return 'Edited yesterday'
  const sameYear = then.getFullYear() === today.getFullYear()
  return `Edited ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}`
}
