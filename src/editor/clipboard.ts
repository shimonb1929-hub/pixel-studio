import type { Piece } from './pixels.ts'

// Pixel Studio keeps its own copy of what you copied, with where it came from, so pasting puts
// it back in the same spot. It also tries to put a picture on the computer's clipboard, so you
// can paste into other programs.
let internal: Piece | null = null
// Whether that picture has reached the computer's clipboard yet.
let systemCopy: 'pending' | 'written' | 'failed' = 'failed'
// Leaving the window means a picture may have been copied in another program since.
let leftSinceCopy = false

if (typeof window !== 'undefined') window.addEventListener('blur', () => (leftSinceCopy = true))

export function getClipboard(): Piece | null {
  return internal
}

export function setClipboard(piece: Piece): void {
  internal = piece
  leftSinceCopy = false
  systemCopy = 'pending'
  void writeSystemClipboard(piece.canvas).then((ok) => {
    if (internal === piece) systemCopy = ok ? 'written' : 'failed'
  })
}

// When a picture is pasted from the computer's clipboard, works out whether it's really Pixel
// Studio's own last copy (which should go back where it came from). Call it the moment the paste
// happens: the returned check uses the clipboard state of that moment, even after the pasted
// picture has taken a while to decode.
export function ownCopyCheck(): (width: number, height: number) => Piece | null {
  const piece = internal
  const state = systemCopy
  const left = leftSinceCopy
  return (width, height) => {
    if (!piece) return null
    // Copying to the computer's clipboard takes a moment, or may not be allowed. Until it's
    // there, a quick Ctrl+V brings back whatever was copied before, so the latest copy here wins,
    // unless you've been to another program since.
    if (state !== 'written') return left ? null : piece
    return piece.canvas.width === width && piece.canvas.height === height ? piece : null
  }
}

async function writeSystemClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false
    const blob = new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not copy'))), 'image/png'),
    )
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    // Some browsers don't allow this; copying still works inside Pixel Studio.
    return false
  }
}
