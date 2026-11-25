import type { ToolId } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import { addShadow, addShapes, addText, glide, pickNamed, setPageColor, type TourShape } from './draw.ts'
import { POSTER, RECORDED } from './lines.ts'
import type { Tour, TourStep } from './tour.ts'

// The guided tours. Each line is spoken by the recorded voice (see lines.ts) while the spotlight
// shows where things are and the tour shows on the page what they do. Everything a tour makes is
// plain shapes and words, so it is the user's own design afterwards, and every step can be undone.

const TOOL = (id: ToolId) => `[data-tour="tool-${id}"]`

function toolStep(id: ToolId, extra: Partial<TourStep> = {}): TourStep {
  return { id, line: RECORDED[id], audio: `tour/tools-${id}.mp3`, target: TOOL(id), run: (host) => host.pickTool(id), ...extra }
}

const star = (name: string, x: number, y: number, size: number, color: string): TourShape => ({ name, type: 'star', x, y, w: size, h: size * 1.5, color })

// The quick tour: every tool in a sentence, picked and lit up, with a few things made on the page
// along the way so the tools are seen working.
export function toolsTour(): Tour {
  return {
    id: 'tools',
    title: t('Meet the tools'),
    design: { name: t('Meet the tools'), width: 1200, height: 800 },
    steps: [
      { id: 'intro', line: RECORDED.intro, audio: 'tour/tools-intro.mp3', sound: 'sparkle' },
      toolStep('move'),
      toolStep('select'),
      toolStep('crop'),
      toolStep('shape', {
        parts: [
          { at: 0.25, run: (h) => addShapes(h, t('Add shape'), [{ name: t('Box'), type: 'rectangle', x: 0.25, y: 0.45, w: 0.16, h: 0.24, color: '#3366ff', corners: 0.3 }]) },
          { at: 0.45, run: (h) => addShapes(h, t('Add shape'), [{ name: t('Circle'), type: 'ellipse', x: 0.45, y: 0.45, w: 0.14, h: 0.21, color: '#ffb020' }]) },
          { at: 0.65, run: (h) => addShapes(h, t('Add shape'), [star(t('Star'), 0.65, 0.45, 0.15, '#22c38e')]) },
        ],
      }),
      toolStep('pen'),
      toolStep('text', {
        parts: [{ at: 0.3, run: (h) => addText(h, t('Add text'), { name: t('Hello'), text: 'Hello! שלום!', x: 0.5, y: 0.18, w: 0.8, size: 0.07, weight: 800, color: '#1a1f2c' }) }],
      }),
      { id: 'photo', line: RECORDED.photo, audio: 'tour/tools-photo.mp3', target: '[data-tour="add-photo"]' },
      toolStep('brush'),
      toolStep('eraser'),
      toolStep('fade'),
      toolStep('fill'),
      toolStep('adjust'),
      toolStep('heal'),
      { id: 'more', line: RECORDED.more, audio: 'tour/tools-more.mp3', target: '[data-tour="more-tools"]', run: (h) => h.pickTool('move') },
      {
        id: 'end',
        line: RECORDED.end,
        audio: 'tour/tools-end.mp3',
        sound: 'sparkle',
        parts: [{ at: 0.3, run: (h) => glide(h, t('Move'), [t('Star')], 0.15, 0) }],
      },
    ],
  }
}

const SKY = '#cfe8ff'
const TITLE = 'Spring Garden Fair'

// The poster tour: a whole design, from an empty page to a download, one trick at a time.
export function posterTour(): Tour {
  const line = (id: keyof typeof POSTER, extra: Partial<TourStep> = {}): TourStep => ({ id, line: POSTER[id], audio: `tour/poster-${id}.mp3`, ...extra })
  return {
    id: 'poster',
    title: t('Make a poster'),
    design: { name: t('My poster'), width: 1080, height: 1350 },
    steps: [
      line('intro', { sound: 'sparkle' }),
      line('page', { parts: [{ at: 0.75, run: (h) => setPageColor(h, t('Page color'), SKY) }] }),
      line('sun', {
        target: TOOL('shape'),
        run: (h) => h.pickTool('shape'),
        parts: [{ at: 0.55, run: (h) => addShapes(h, t('Add shape'), [{ name: t('Sun'), type: 'ellipse', x: 0.76, y: 0.16, w: 0.26, h: 0.208, color: '#ffc233' }]) }],
      }),
      line('hills', {
        parts: [
          { at: 0.15, run: (h) => addShapes(h, t('Add shape'), [{ name: t('Hill'), type: 'ellipse', x: 0.22, y: 0.97, w: 1.05, h: 0.36, color: '#7ccf6b' }]) },
          { at: 0.35, run: (h) => addShapes(h, t('Add shape'), [{ name: t('Hill'), type: 'ellipse', x: 0.85, y: 1.0, w: 1.1, h: 0.38, color: '#57b25a' }]) },
        ],
      }),
      line('flowers', {
        parts: [0.12, 0.3, 0.48, 0.66, 0.84].map((at, i) => ({
          at,
          run: (h) => addShapes(h, t('Add shape'), [star(t('Flower'), 0.1 + i * 0.2, 0.84 + (i % 2) * 0.05, 0.07, i % 2 ? '#ffffff' : '#ff6fa1')]),
        })),
      }),
      line('title', {
        target: TOOL('text'),
        run: (h) => h.pickTool('text'),
        parts: [{ at: 0.55, run: (h) => addText(h, t('Add text'), { name: TITLE, text: TITLE, x: 0.5, y: 0.42, w: 0.86, size: 0.105, weight: 800, color: '#1d3557' }) }],
      }),
      line('details', {
        parts: [{ at: 0.45, run: (h) => addText(h, t('Add text'), { name: t('Details'), text: 'Sunday, May 3 · 10 AM to 4 PM\nCity Park', x: 0.5, y: 0.6, w: 0.8, size: 0.042, weight: 500, color: '#1d3557' }) }],
      }),
      line('shadow', {
        parts: [
          { at: 0.1, run: (h) => pickNamed(h, TITLE) },
          { at: 0.7, run: (h) => addShadow(h, t('Shadow'), TITLE) },
        ],
      }),
      line('arrange', {
        target: TOOL('move'),
        run: (h) => h.pickTool('move'),
        parts: [
          { at: 0.25, run: (h) => pickNamed(h, t('Sun')) },
          { at: 0.35, run: (h) => glide(h, t('Move'), [t('Sun')], -0.06, 0.03, 1400) },
        ],
      }),
      line('download', { target: '[data-tour="download"]' }),
      line('end', { sound: 'sparkle' }),
    ],
  }
}

// The tours people can start, in the order they're offered.
export const TOURS = [
  { id: 'tools', start: toolsTour, title: () => t('Meet the tools'), description: () => t('A quick, spoken walk past every tool: what it does, in one sentence each. About two minutes.') },
  { id: 'poster', start: posterTour, title: () => t('Make a poster'), description: () => t('Watch a whole poster being made, from an empty page to a download, with a tip at every step.') },
]
