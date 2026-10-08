import { FilePlus, FolderOpen } from 'lucide-react'
import { shortcut } from '../keys.ts'
import { Tooltip } from './Tooltip.tsx'

interface WelcomeScreenProps {
  onNew: () => void
  onOpen: () => void
}

export function WelcomeScreen({ onNew, onOpen }: WelcomeScreenProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-100">Pixel Studio</h1>
        <p className="mt-2 text-sm text-zinc-400">Start with a blank image or open one from your computer.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Tooltip
            title="New image"
            shortcut={shortcut('mod', 'alt', 'N')}
            description="Start with an empty image. You choose how big it is and its background color."
          >
            <button
              type="button"
              onClick={onNew}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <FilePlus size={16} />
              New image
            </button>
          </Tooltip>
          <Tooltip
            title="Open image"
            shortcut={shortcut('mod', 'O')}
            description="Pick a picture file from your computer (PNG, JPG, GIF, WebP and more) to edit it."
          >
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-2 rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <FolderOpen size={16} />
              Open image…
            </button>
          </Tooltip>
        </div>
        <p className="mt-6 text-xs text-zinc-500">You can also drag a picture file from your computer and drop it here.</p>
      </div>
    </div>
  )
}
