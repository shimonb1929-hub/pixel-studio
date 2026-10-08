export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

const MODIFIER_LABELS = {
  mod: isMac ? 'Cmd' : 'Ctrl',
  alt: isMac ? 'Option' : 'Alt',
  shift: 'Shift',
}

export const ALT_LABEL = MODIFIER_LABELS.alt

// shortcut('mod', 'shift', 'E') -> "Ctrl+Shift+E" (or "Cmd+Shift+E" on a Mac)
export function shortcut(...parts: string[]): string {
  return parts.map((part) => MODIFIER_LABELS[part as keyof typeof MODIFIER_LABELS] ?? part).join('+')
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}
