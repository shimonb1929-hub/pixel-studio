import { Hand, ZoomIn, type LucideIcon } from 'lucide-react'
import type { ToolId } from './editor/types.ts'
import { ALT_LABEL } from './keys.ts'

export interface ToolInfo {
  id: ToolId
  name: string
  key: string
  icon: LucideIcon
  // Shown when hovering the tool.
  description: string
  // Shown at the top of the canvas while the tool is in use.
  hint: string
  // Extra words people might type into search to find this tool.
  keywords: string[]
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'hand',
    name: 'Hand',
    key: 'H',
    icon: Hand,
    description:
      'Slide your design around to see a different part of it. It never changes your design. ' +
      'Tip: hold Space to use the Hand at any time.',
    hint: 'Drag to slide your design around.',
    keywords: ['move around', 'pan', 'scroll', 'slide', 'drag', 'navigate', 'look around'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    key: 'Z',
    icon: ZoomIn,
    description: `Look closer or step back. Click a spot to zoom in on it. Hold ${ALT_LABEL} and click to zoom out.`,
    hint: `Click to zoom in. Hold ${ALT_LABEL} and click to zoom out.`,
    keywords: ['magnify', 'magnifying glass', 'closer', 'bigger', 'smaller', 'look closer'],
  },
]
