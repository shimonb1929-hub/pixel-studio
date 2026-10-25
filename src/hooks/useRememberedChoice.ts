import { useState } from 'react'

// An on/off choice kept in this browser, so it is the same on the next visit (like "Show every
// choice" in the menu). Private windows may not keep it; it still works for now.
export function useRememberedChoice(key: string): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === 'on'
    } catch {
      return false
    }
  })
  function change(next: boolean) {
    setValue(next)
    try {
      localStorage.setItem(key, next ? 'on' : 'off')
    } catch {
      // Not kept, but the choice still holds until the page is closed.
    }
  }
  return [value, change]
}
