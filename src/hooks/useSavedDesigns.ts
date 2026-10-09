import { useCallback, useEffect, useState } from 'react'
import { listDesigns, type SavedDesign } from '../editor/library.ts'

// The designs kept in this browser, newest first, read again whenever the window comes back
// into focus (another tab may have changed them).
export function useSavedDesigns() {
  const [designs, setDesigns] = useState<SavedDesign[]>([])
  const [loadedAt, setLoadedAt] = useState(() => Date.now())

  const refresh = useCallback(() => {
    listDesigns()
      .then((list) => {
        setDesigns(list)
        setLoadedAt(Date.now())
      })
      // Without storage there is simply nothing to show; saving explains the problem when it happens.
      .catch(() => setDesigns([]))
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  return { designs, loadedAt, refresh }
}
