import type { ToolId } from '../editor/types.ts'
import { t } from '../i18n/i18n.ts'
import type { PathNode, ShapePath } from '../editor/path.ts'
import { addGlow, addPaintLayer, addShadow, addShapes, addText, animate, bend, glide, pickNamed, setFill, setLook, setPageColor, stroke, type TourShape } from './draw.ts'
import { DETAIL, POSTER, RECORDED, SHOWCASE } from './lines.ts'
import type { HandStep } from './hand.ts'
import type { Tour, TourHost, TourStep } from './tour.ts'

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
          { at: 0.25, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Box'), type: 'rectangle', x: 0.25, y: 0.45, w: 0.16, h: 0.24, color: '#3366ff', corners: 0.3 }]) },
          { at: 0.45, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Circle'), type: 'ellipse', x: 0.45, y: 0.45, w: 0.14, h: 0.21, color: '#ffb020' }]) },
          { at: 0.65, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [star(t('Star'), 0.65, 0.45, 0.15, '#22c38e')]) },
        ],
      }),
      toolStep('pen'),
      toolStep('text', {
        parts: [{ at: 0.3, sound: 'type', run: (h) => addText(h, t('Add text'), { name: t('Hello'), text: 'Hello! שלום!', x: 0.5, y: 0.18, w: 0.8, size: 0.07, weight: 800, color: '#1a1f2c' }) }],
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
        parts: [{ at: 0.3, sound: 'slide', run: (h) => glide(h, t('Move'), [t('Star')], 0.15, 0) }],
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
      line('page', { parts: [{ at: 0.75, sound: 'change', run: (h) => setPageColor(h, t('Page color'), SKY) }] }),
      line('sun', {
        target: TOOL('shape'),
        run: (h) => h.pickTool('shape'),
        parts: [{ at: 0.55, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Sun'), type: 'ellipse', x: 0.76, y: 0.16, w: 0.26, h: 0.208, color: '#ffc233' }]) }],
      }),
      line('hills', {
        parts: [
          { at: 0.15, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Hill'), type: 'ellipse', x: 0.22, y: 0.97, w: 1.05, h: 0.36, color: '#7ccf6b' }]) },
          { at: 0.35, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Hill'), type: 'ellipse', x: 0.85, y: 1.0, w: 1.1, h: 0.38, color: '#57b25a' }]) },
        ],
      }),
      line('flowers', {
        parts: [0.12, 0.3, 0.48, 0.66, 0.84].map((at, i) => ({
          at,
          sound: 'pop' as const,
          run: (h) => addShapes(h, t('Add shape'), [star(t('Flower'), 0.1 + i * 0.2, 0.84 + (i % 2) * 0.05, 0.07, i % 2 ? '#ffffff' : '#ff6fa1')]),
        })),
      }),
      line('title', {
        target: TOOL('text'),
        run: (h) => h.pickTool('text'),
        parts: [{ at: 0.55, sound: 'type', run: (h) => addText(h, t('Add text'), { name: TITLE, text: TITLE, x: 0.5, y: 0.42, w: 0.86, size: 0.105, weight: 800, color: '#1d3557' }) }],
      }),
      line('details', {
        parts: [{ at: 0.45, sound: 'type', run: (h) => addText(h, t('Add text'), { name: t('Details'), text: 'Sunday, May 3 · 10 AM to 4 PM\nCity Park', x: 0.5, y: 0.6, w: 0.8, size: 0.042, weight: 500, color: '#1d3557' }) }],
      }),
      line('shadow', {
        parts: [
          { at: 0.1, sound: 'tick', run: (h) => pickNamed(h, TITLE) },
          { at: 0.7, sound: 'shine', run: (h) => addShadow(h, t('Shadow'), TITLE) },
        ],
      }),
      line('arrange', {
        target: TOOL('move'),
        run: (h) => h.pickTool('move'),
        parts: [
          { at: 0.25, sound: 'tick', run: (h) => pickNamed(h, t('Sun')) },
          { at: 0.35, sound: 'slide', run: (h) => glide(h, t('Move'), [t('Sun')], -0.06, 0.03, 1400) },
        ],
      }),
      line('download', { target: '[data-tour="download"]' }),
      line('end', { sound: 'sparkle' }),
    ],
  }
}

// A point of a curve shape, with its two handles (all from -0.5 to 0.5 across the shape's box).
const node = (x: number, y: number, inX = x, inY = y, outX = x, outY = y): PathNode => ({ x, y, in: { x: inX, y: inY }, out: { x: outX, y: outY }, smooth: inX !== x || inY !== y })

// A leaf: sharp tips at the top and bottom, smooth curves on both sides.
const LEAF: ShapePath = { closed: true, nodes: [node(0, -0.5), node(0.5, 0, 0.5, -0.3, 0.5, 0.3), node(0, 0.5), node(-0.5, 0, -0.5, 0.3, -0.5, -0.3)] }

// The deep dive: every tool up close, with something made on the page for most of them, so how it
// is used and what it can do are both seen.
export function detailTour(): Tour {
  const line = (id: keyof typeof DETAIL, extra: Partial<TourStep> = {}): TourStep => ({ id, line: DETAIL[id], audio: `tour/detail-${id}.mp3`, ...extra })
  const tool = (id: ToolId, extra: Partial<TourStep> = {}): TourStep => line(id, { target: TOOL(id), run: (h) => h.pickTool(id), ...extra })
  const STAR = t('Star')
  const BOX = t('Box')
  const HEX = t('Hexagon')
  const PAINT = t('Paint')
  const WORDS = t('Hello')
  return {
    id: 'detail',
    title: t('Every tool, up close'),
    design: { name: t('Every tool, up close'), width: 1200, height: 800 },
    steps: [
      line('intro', { sound: 'sparkle' }),
      line('settings', { target: '[data-tour="settings"]', run: (h) => h.pickTool('shape') }),
      tool('move', {
        parts: [
          { at: 0.12, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [star(STAR, 0.5, 0.5, 0.12, '#ffb020')]) },
          { at: 0.3, sound: 'slide', run: (h) => glide(h, t('Move'), [STAR], 0.16, 0) },
          { at: 0.5, sound: 'grow', run: (h) => animate(h, t('Resize'), [STAR], (b, e) => ({ ...b, width: b.width * (1 + 0.5 * e), height: b.height * (1 + 0.5 * e) })) },
          { at: 0.68, sound: 'slide', run: (h) => animate(h, t('Turn'), [STAR], (b, e) => ({ ...b, rotation: b.rotation + e * (Math.PI / 5) })) },
        ],
      }),
      tool('select'),
      tool('crop'),
      tool('shape', {
        parts: [
          { at: 0.1, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: BOX, type: 'rectangle', x: 0.17, y: 0.3, w: 0.16, h: 0.22, color: '#3366ff' }]) },
          { at: 0.22, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: HEX, type: 'polygon', x: 0.17, y: 0.72, w: 0.13, h: 0.2, color: '#ff7a45', sides: 6 }]) },
          { at: 0.36, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Arrow'), type: 'line', x: 0.4, y: 0.3, w: 0.14, h: 0.04, color: '#1a1f2c', outline: { color: '#1a1f2c', width: 0.006 } }]) },
          {
            at: 0.75,
            sound: 'change',
            run: (h) => h.change(t('Corners'), (doc) => ({ ...doc, layers: doc.layers.map((l) => (l.name === BOX && l.kind === 'shape' ? { ...l, geometry: { ...l.geometry, corners: 0.35 }, outline: { color: '#1a1f2c', width: Math.round(0.005 * doc.width) } } : l)) })),
          },
        ],
      }),
      line('photo', { target: '[data-tour="add-photo"]', run: (h) => h.pickTool('move') }),
      tool('pen', {
        parts: [{ at: 0.3, sound: 'pop', run: (h) => addShapes(h, t('Add shape'), [{ name: t('Leaf'), type: 'path', x: 0.85, y: 0.5, w: 0.08, h: 0.28, color: '#22c38e', turn: 30, path: LEAF }]) }],
      }),
      tool('text', {
        parts: [
          { at: 0.15, sound: 'type', run: (h) => addText(h, t('Add text'), { name: WORDS, text: 'Hello! שלום!', x: 0.5, y: 0.13, w: 0.7, size: 0.07, weight: 800, color: '#1a1f2c' }) },
          { at: 0.85, sound: 'grow', run: (h) => bend(h, t('Bend'), WORDS, 0.12) },
        ],
      }),
      tool('brush', {
        parts: [
          { at: 0.1, sound: 'tick', run: (h) => addPaintLayer(h, t('New layer'), PAINT) },
          { at: 0.2, sound: 'brush', run: (h) => stroke(h, t('Brush'), PAINT, [[0.08, 0.92], [0.2, 0.86], [0.32, 0.92], [0.44, 0.86], [0.56, 0.92], [0.68, 0.86], [0.8, 0.92], [0.92, 0.86]], '#7c5cff', 0.02, 2200) },
        ],
      }),
      tool('eraser', { parts: [{ at: 0.2, sound: 'rub', run: (h) => stroke(h, t('Eraser'), PAINT, [[0.5, 0.8], [0.5, 0.98]], '#000', 0.05, 900, true) }] }),
      tool('fade'),
      tool('fill', {
        parts: [
          { at: 0.55, sound: 'tick', run: (h) => pickNamed(h, BOX) },
          { at: 0.75, sound: 'change', run: (h) => setFill(h, t('Color'), BOX, '#ff6fa1') },
        ],
      }),
      line('color', { target: '[data-tour="color"]', run: (h) => h.pickTool('move') }),
      tool('adjust', {
        parts: [
          { at: 0.1, sound: 'tick', run: (h) => pickNamed(h, HEX) },
          { at: 0.35, sound: 'change', run: (h) => setLook(h, t('Black & white'), HEX, 'mono') },
        ],
      }),
      tool('heal'),
      tool('clone'),
      tool('push'),
      line('effects', {
        target: '[data-tour="effects"]',
        run: (h) => {
          h.pickTool('move')
          pickNamed(h, STAR)
        },
        parts: [{ at: 0.75, sound: 'shine', run: (h) => addGlow(h, t('Glow'), STAR, '#ffd400') }],
      }),
      line('layers', { target: '[data-tour="layers"]' }),
      line('end', { sound: 'sparkle' }),
    ],
  }
}

const GARDEN = 'Night Garden'

// The night garden: the tour's pointer makes a whole picture with the real tools, picking each
// tool and its settings where they really are, so every step can be copied exactly.
export function showcaseTour(): Tour {
  const line = (id: keyof typeof SHOWCASE, extra: Partial<TourStep> = {}): TourStep => ({ id, line: SHOWCASE[id], audio: `tour/showcase-${id}.mp3`, ...extra })
  const radio = (label: string) => `[role="radio"][aria-label="${label}"]`
  const named = (label: string) => `[aria-label="${label}"]`
  const PAGE = '[data-tour="canvas"]'
  const size = (host: TourHost) => host.getDoc() ?? { width: 1600, height: 1000 }
  // Opens the Effects panel (if it is folded) and adds one effect, the way a person would.
  const addEffect = async (h: HandStep, label: string) => {
    await h.click('[data-tour="effects"] button[aria-expanded="false"]')
    await h.click(named(label))
  }
  // The middle of what is picked, as shares of the page, so a drag starts right on it.
  const middle = (host: TourHost): [number, number] => {
    const doc = host.getDoc()
    const layer = doc?.layers.find((l) => l.id === doc.activeLayerId)
    if (!doc || !layer || !('box' in layer) || !layer.box) return [0.5, 0.5]
    return [layer.box.cx / doc.width, layer.box.cy / doc.height]
  }
  return {
    id: 'showcase',
    title: t('Night garden showcase'),
    design: { name: t('Night garden'), width: 1600, height: 1000 },
    pointer: true,
    steps: [
      line('intro', { sound: 'sparkle' }),
      line('sky', {
        act: async (h, host) => {
          await h.click(TOOL('shape'))
          await h.click(radio(t('Rectangle')))
          h.spot(PAGE)
          await h.drag(size(host), [[0, 0], [0.5, 0.5], [1, 1]], { ms: 1200 })
        },
      }),
      line('gradient', {
        act: async (h, host) => {
          await h.click(`[role="radiogroup"][aria-label="${t('Fill kind')}"] ${radio(t('Gradient'))}`)
          await h.wait(400)
          await h.point(`section[aria-label="${t('Shape')}"]`)
          await h.do(() =>
            host.change(t('Gradient'), (doc) => ({
              ...doc,
              layers: doc.layers.map((l) =>
                l.id === doc.activeLayerId && l.kind === 'shape'
                  ? { ...l, fill: { kind: 'gradient', gradient: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#0b1640', opacity: 1 }, { at: 0.6, color: '#2d2470', opacity: 1 }, { at: 1, color: '#6b3fa0', opacity: 1 }] } } }
                  : l,
              ),
            })),
          )
          h.sound('change')
        },
      }),
      line('moon', {
        act: async (h, host) => {
          await h.click(TOOL('shape'))
          await h.click(radio(t('Oval')))
          h.spot(PAGE)
          await h.drag(size(host), [[0.74, 0.1], [0.84, 0.26]], { ms: 900, shift: true })
          await h.point(`section[aria-label="${t('Color')}"]`)
          await h.do(() => host.pickColor('#fff4c2'))
          h.sound('change')
        },
      }),
      line('glow', {
        act: async (h) => {
          await addEffect(h, t('Add glow'))
          h.sound('shine')
        },
      }),
      line('stars', {
        act: async (h, host) => {
          const doc = size(host)
          await h.click(TOOL('shape'))
          await h.click(radio(t('Star')))
          h.spot(PAGE)
          await h.drag(doc, [[0.2, 0.12], [0.24, 0.18]], { ms: 500 })
          await h.do(() => host.pickColor('#ffffff'))
          await h.click(TOOL('move'))
          h.spot(PAGE)
          for (const to of [[0.36, 0.1], [0.5, 0.22], [0.62, 0.08], [0.1, 0.32]] as [number, number][]) {
            await h.drag(doc, [middle(host), to], { ms: 500, alt: true })
            h.sound('pop')
          }
        },
      }),
      line('hills', {
        act: async (h, host) => {
          const doc = size(host)
          await h.click(TOOL('pen'))
          h.spot(PAGE)
          await h.drag(doc, [[0, 0.74]], { ms: 100 })
          await h.drag(doc, [[0.28, 0.6], [0.4, 0.6]], { ms: 500 })
          await h.drag(doc, [[0.68, 0.72], [0.8, 0.72]], { ms: 500 })
          for (const p of [[1, 0.64], [1, 1], [0, 1], [0, 0.74]] as [number, number][]) await h.drag(doc, [p], { ms: 100 })
          await h.wait(300)
          await h.point(`section[aria-label="${t('Color')}"]`)
          await h.do(() => host.pickColor('#1f5a3a'))
          h.sound('change')
        },
      }),
      line('brush', {
        act: async (h, host) => {
          await h.click(TOOL('brush'))
          await h.click(`[aria-label^="${t('Brushes: {brush}', { brush: '' })}"]`)
          await h.click(radio(t('Ink pen')))
          await h.slide(t('Size'), 0.24)
          await h.point(`section[aria-label="${t('Color')}"]`)
          await h.do(() => host.pickColor('#3fa34d'))
        },
      }),
      line('grass', {
        act: async (h, host) => {
          const doc = size(host)
          h.spot(PAGE)
          for (let i = 0; i < 16; i++) {
            const x = 0.04 + i * 0.062 + (i % 3) * 0.008
            const lean = i % 2 ? 0.018 : -0.014
            await h.drag(doc, [[x, 0.99], [x + lean * 0.4, 0.93], [x + lean, 0.86 - (i % 3) * 0.025]], { ms: 260 })
            if (i % 2 === 0) h.sound('brush')
          }
        },
      }),
      line('flowers', {
        act: async (h, host) => {
          const doc = size(host)
          await h.click(TOOL('shape'))
          h.spot(PAGE)
          await h.drag(doc, [[0.2, 0.84], [0.235, 0.9]], { ms: 500 })
          await h.do(() => host.pickColor('#ff6fa1'))
          await h.click(TOOL('move'))
          h.spot(PAGE)
          for (const to of [[0.45, 0.9], [0.72, 0.86]] as [number, number][]) {
            await h.drag(doc, [middle(host), to], { ms: 500, alt: true })
            h.sound('pop')
          }
          await h.do(() => host.pickColor('#ffd23f'))
          h.sound('change')
        },
      }),
      line('title', {
        act: async (h, host) => {
          await h.click(TOOL('text'))
          h.spot(PAGE)
          await h.drag(size(host), [[0.2, 0.36], [0.7, 0.46]], { ms: 700 })
          await h.wait(300)
          await h.type(GARDEN, 90)
          await h.key('Escape')
        },
      }),
      line('style', {
        act: async (h, host) => {
          await h.slide(t('Size'), 0.62)
          await h.point(`section[aria-label="${t('Color')}"]`)
          await h.do(() => host.pickColor('#ffffff'))
          h.sound('change')
          await h.slide(t('Bend'), 0.56)
          h.sound('grow')
        },
      }),
      line('shadow', {
        act: async (h) => {
          await addEffect(h, t('Add shadow'))
          h.sound('shine')
        },
      }),
      line('end', { sound: 'sparkle' }),
    ],
  }
}

// The tours people can start, in the order they're offered.
export const TOURS = [
  { id: 'tools', start: toolsTour, title: () => t('Meet the tools'), description: () => t('A quick, spoken walk past every tool: what it does, in one sentence each. About two minutes.') },
  { id: 'detail', start: detailTour, title: () => t('Every tool, up close'), description: () => t('The deep dive: each tool shown working, how to use it and what it can do. About four minutes.') },
  { id: 'showcase', start: showcaseTour, title: () => t('Night garden showcase'), description: () => t('A whole night scene made with many tools together: gradients, glow, curves, paint and bent words.') },
  { id: 'poster', start: posterTour, title: () => t('Make a poster'), description: () => t('Watch a whole poster being made, from an empty page to a download, with a tip at every step.') },
]
