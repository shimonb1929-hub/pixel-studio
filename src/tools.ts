import { Hand, ZoomIn, type LucideIcon } from 'lucide-react'
import type { ToolId } from './editor/types.ts'
import { ALT_LABEL } from './keys.ts'

export interface ToolInfo {
  id: ToolId
  name: string
  key: string
  icon: LucideIcon
  description: string
  // Shown in the bar under the menu while the tool is selected.
  howTo: string
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'hand',
    name: 'Hand',
    key: 'H',
    icon: Hand,
    description:
      'Moves your view around the image, like sliding a paper on a desk. It never changes the image. ' +
      'Tip: hold Space with any tool to use the Hand for a moment.',
    howTo: 'Drag on the image to move around.',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    key: 'Z',
    icon: ZoomIn,
    description: `Gets closer to or farther from the image. Click a spot to zoom in on it. Hold ${ALT_LABEL} and click to zoom out.`,
    howTo: `Click to zoom in. Hold ${ALT_LABEL} and click to zoom out.`,
  },
]
