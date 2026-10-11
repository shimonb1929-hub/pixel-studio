import { useSyncExternalStore } from 'react'
import { fontsVersion, onFontsLoaded } from '../text/fonts.ts'

// Goes up each time a font finishes loading, so whatever shows text draws it again in that font.
export function useFontsVersion(): number {
  return useSyncExternalStore(onFontsLoaded, fontsVersion)
}
