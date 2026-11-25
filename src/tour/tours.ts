import type { ToolId } from '../editor/types.ts'
import { addShapes, glide } from './draw.ts'
import { RECORDED } from './lines.ts'
import type { Tour, TourStep } from './tour.ts'

const toolStep = (id: ToolId | 'photo', target: string): TourStep => ({
  id,
  line: RECORDED[id],
  audio: `tour/tools-${id}.mp3`,
  target,
  run: (host) => id !== 'photo' && host.pickTool(id),
})

// A short check of the tour player, built from the lines already recorded. The real tours are
// written once the app's tools are final (see lines.ts); until then this one is only reached
// from tests.
export function playerCheck(): Tour {
  return {
    id: 'player-check',
    title: 'Tour check',
    design: { name: 'Tour check', width: 1200, height: 800 },
    steps: [
      { id: 'intro', line: RECORDED.intro, audio: 'tour/tools-intro.mp3' },
      toolStep('move', '[data-tour="tool-move"]'),
      {
        ...toolStep('shape', '[data-tour="tool-shape"]'),
        parts: [
          { at: 0.2, run: (host) => addShapes(host, 'Add shape', [{ name: 'Sun', type: 'ellipse', x: 0.2, y: 0.25, w: 0.12, h: 0.18, color: '#ffc233' }]) },
          { at: 0.5, run: (host) => addShapes(host, 'Add shape', [{ name: 'Star', type: 'star', x: 0.5, y: 0.5, w: 0.16, h: 0.24, color: '#3366ff' }]) },
          { at: 0.8, run: (host) => glide(host, 'Move', ['Star'], 0.25, 0) },
        ],
      },
      { id: 'no-voice', line: 'This step has no recording, so its words stay up for as long as they take to read.', target: '[data-tour="more-tools"]' },
    ],
  }
}
