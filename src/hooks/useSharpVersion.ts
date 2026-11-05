import { useSyncExternalStore } from 'react'
import { onSharpReady, sharpVersion } from '../editor/sharp.ts'

// Goes up each time a sharp copy of an enlarged picture is ready, so the screen draws it again.
export function useSharpVersion(): number {
  return useSyncExternalStore(onSharpReady, sharpVersion)
}
