import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { startLanguages } from './i18n/i18n.ts'
import { startOwnFonts } from './text/ownFonts.ts'

// The finished site keeps its files in the browser, so the installed app works without internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

// Fonts added from this computer before come back onto the list.
void startOwnFonts()

// The language list is fetched first, so the app never flashes up in another language.
void startLanguages().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
