import { useEffect, useState } from 'react'

// Chrome and Edge offer to install a site as an app through this event.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallApp {
  // True when running as the installed app, or right after installing it.
  installed: boolean
  // True when this browser can install Pixel Studio right now.
  canInstall: boolean
  install: () => Promise<void>
}

export function useInstallApp(): InstallApp {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches ?? false)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keep the offer for the Install button instead of the browser's own pop-up.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    installed,
    canInstall: prompt !== null,
    async install() {
      if (!prompt) return
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setPrompt(null)
    },
  }
}
