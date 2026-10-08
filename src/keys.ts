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

// Inputs that aren't for typing, like sliders, shouldn't swallow shortcuts such as Ctrl+Z.
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file'])

// True when keys pressed should go into a text box rather than trigger shortcuts.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
}
