import { createDesignId, createId } from '../editor/document.ts'
import { nextNumberedName } from '../editor/fileNames.ts'
import { newStyleId } from '../editor/designStyles.ts'
import type { EditorDocument, Layer, SavedTextStyle, ShapeGeometry, ShapeLayer, ShapeType, TextLayer, TextStyle } from '../editor/types.ts'
import { fitText, textName } from '../text/textLayer.ts'
import { loadFont } from '../text/fonts.ts'
import { isRtl, live, msg, t } from '../i18n/i18n.ts'

// Ready-made layouts for invitations, flyers and posters. They are made only of shapes, words and
// colors (never pictures), so every part stays sharp and can be changed: click to pick, drag to
// move, retype the words. Each one comes with its colors kept as the design's colors and its text
// styles kept as the design's styles, so changing one color or one style changes the whole layout.

export type LayoutKind = 'invitation' | 'flyer' | 'poster'

export const LAYOUT_KINDS: { value: LayoutKind; label: string; description: string }[] = live([
  { value: 'invitation', label: msg('Invitations'), description: msg('Cards for a celebration, an event or a party, 5 × 7 inches.') },
  { value: 'flyer', label: msg('Flyers'), description: msg('A4 pages to hand out or hang up.') },
  { value: 'poster', label: msg('Posters'), description: msg('Big A3 posters to hang on a wall.') },
])

// The colors of a layout, each with a job: the page, white cards on it, the main color, a second
// color for small touches, the words, a pale color for soft shapes, and words on the main color.
export interface LayoutColors {
  id: string
  name: string
  page: string
  paper: string
  main: string
  accent: string
  ink: string
  soft: string
  onMain: string
}

export const LAYOUT_COLORS: LayoutColors[] = live([
  { id: 'sky', name: msg('Blue sky'), page: '#f4f8ff', paper: '#ffffff', main: '#2f6fde', accent: '#f2b134', ink: '#1d2a44', soft: '#dbe7fb', onMain: '#ffffff' },
  { id: 'rose', name: msg('Rose'), page: '#fdf4f2', paper: '#ffffff', main: '#b8566b', accent: '#d9a441', ink: '#43262d', soft: '#f5dadd', onMain: '#ffffff' },
  { id: 'forest', name: msg('Forest'), page: '#f3f6ef', paper: '#ffffff', main: '#2f6b4f', accent: '#c9a227', ink: '#1f3329', soft: '#dbe8d9', onMain: '#ffffff' },
  { id: 'night', name: msg('Night and gold'), page: '#16213e', paper: '#1f2c4f', main: '#e9b44c', accent: '#9fb7ff', ink: '#f7f4ea', soft: '#26365e', onMain: '#16213e' },
  { id: 'sunny', name: msg('Sunny'), page: '#fff8e8', paper: '#ffffff', main: '#f06a3a', accent: '#1aa39a', ink: '#2d2a26', soft: '#ffe2bf', onMain: '#ffffff' },
  { id: 'lavender', name: msg('Lavender'), page: '#f7f4ff', paper: '#ffffff', main: '#6a4fd1', accent: '#ff8fa3', ink: '#2a2240', soft: '#e6defc', onMain: '#ffffff' },
])

type ColorRole = Exclude<keyof LayoutColors, 'id' | 'name'>

// How a kind of text in a layout looks. Sizes are a share of the page's width.
interface StyleSpec {
  name: string
  font: string
  size: number
  weight: number
  color: ColorRole
  lineHeight?: number
  letterSpacing?: number
  italic?: boolean
}

interface ShapeOptions {
  fill?: ColorRole | null
  outline?: { color: ColorRole; width: number } | null
  corners?: number
  sides?: number
  // In degrees.
  rotation?: number
  opacity?: number
}

interface TextOptions {
  // Where the middle of the text goes, as shares of the page's width and height.
  x?: number
  y: number
  // How wide its box is, as a share of the page's width. Lines wrap inside it.
  width?: number
  // 'start' lines up on the side the language starts from (the right for Hebrew and Yiddish).
  align?: 'center' | 'start'
}

// What a layout's drawing step can use. Positions and sizes are shares of the page's width (x, and
// every size) and height (y), so a layout fits its page exactly.
export interface LayoutKit {
  colors: LayoutColors
  // Hebrew and Yiddish read from the right, so things lined up "at the start" move to the right.
  rtl: boolean
  rect: (x: number, y: number, width: number, height: number, options?: ShapeOptions) => void
  oval: (x: number, y: number, width: number, height: number, options?: ShapeOptions) => void
  polygon: (x: number, y: number, size: number, options?: ShapeOptions) => void
  star: (x: number, y: number, size: number, options?: ShapeOptions) => void
  line: (x: number, y: number, length: number, color: ColorRole, width: number, rotation?: number) => void
  text: (style: string, words: string, options: TextOptions) => void
  // A position from the side the language starts from.
  start: (x: number) => number
}

export interface LayoutInfo {
  id: string
  kind: LayoutKind
  name: string
  use: string
  width: number
  height: number
  // The colors it starts with.
  colors: string
  styles: Record<string, StyleSpec>
  draw: (kit: LayoutKit) => void
}

const CARD = { width: 1500, height: 2100 }
const A4 = { width: 2480, height: 3508 }
const A3 = { width: 3508, height: 4961 }

const SERIF = 'frank-ruhl-libre'
const SANS = 'heebo'
const ROUND = 'playpen-sans-hebrew'

export const LAYOUTS: LayoutInfo[] = live<LayoutInfo[]>([
  {
    id: 'invitation-frame',
    kind: 'invitation',
    name: msg('Classic frame'),
    use: msg('An elegant card with a fine double frame.'),
    ...CARD,
    colors: 'rose',
    styles: {
      title: { name: msg('Title'), font: SERIF, size: 0.12, weight: 700, color: 'main', lineHeight: 1.05 },
      small: { name: msg('Small words'), font: SANS, size: 0.036, weight: 500, color: 'ink', letterSpacing: 0.12 },
      details: { name: msg('Details'), font: SERIF, size: 0.05, weight: 500, color: 'ink', lineHeight: 1.35 },
    },
    draw: (k) => {
      k.rect(0.5, 0.5, 0.88, 1.28, { fill: null, outline: { color: 'accent', width: 0.006 } })
      k.rect(0.5, 0.5, 0.83, 1.23, { fill: null, outline: { color: 'accent', width: 0.002 } })
      k.polygon(0.5, 0.17, 0.05, { fill: 'accent', sides: 4 })
      k.text('small', t('With joy, we invite you'), { y: 0.28, width: 0.7 })
      k.text('title', t('You are invited'), { y: 0.39, width: 0.74 })
      k.text('details', t('to our celebration'), { y: 0.515, width: 0.7 })
      k.line(0.5, 0.575, 0.24, 'accent', 0.003)
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { y: 0.65, width: 0.72 })
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.72, width: 0.72 })
      k.polygon(0.5, 0.84, 0.03, { fill: 'accent', sides: 4 })
    },
  },
  {
    id: 'invitation-circles',
    kind: 'invitation',
    name: msg('Soft circles'),
    use: msg('A white card on cheerful circles of color.'),
    ...CARD,
    colors: 'lavender',
    styles: {
      title: { name: msg('Title'), font: ROUND, size: 0.11, weight: 700, color: 'main', lineHeight: 1.1 },
      subtitle: { name: msg('Subtitle'), font: ROUND, size: 0.05, weight: 500, color: 'ink', lineHeight: 1.3 },
      details: { name: msg('Details'), font: SANS, size: 0.042, weight: 400, color: 'ink', lineHeight: 1.4 },
    },
    draw: (k) => {
      k.oval(0.08, 0.06, 0.75, 0.75, { fill: 'main' })
      k.oval(0.96, 0.95, 0.85, 0.85, { fill: 'accent' })
      k.oval(0.9, 0.12, 0.22, 0.22, { fill: 'soft' })
      k.oval(0.1, 0.9, 0.16, 0.16, { fill: 'soft' })
      k.rect(0.5, 0.5, 0.78, 0.6 * (2100 / 1500), { fill: 'paper', corners: 0.12 })
      k.text('subtitle', t('Come and celebrate with us!'), { y: 0.33, width: 0.64 })
      k.text('title', t('Party time'), { y: 0.44, width: 0.66 })
      k.line(0.5, 0.52, 0.18, 'accent', 0.006)
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { y: 0.6, width: 0.64 })
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.66, width: 0.64 })
    },
  },
  {
    id: 'invitation-window',
    kind: 'invitation',
    name: msg('Round window'),
    use: msg('Words inside a tall rounded window, with little stars.'),
    ...CARD,
    colors: 'night',
    styles: {
      title: { name: msg('Title'), font: SERIF, size: 0.115, weight: 800, color: 'main', lineHeight: 1.05 },
      small: { name: msg('Small words'), font: SANS, size: 0.034, weight: 500, color: 'ink', letterSpacing: 0.14 },
      details: { name: msg('Details'), font: SANS, size: 0.044, weight: 400, color: 'ink', lineHeight: 1.4 },
    },
    draw: (k) => {
      k.rect(0.5, 0.53, 0.74, 0.74 * (2100 / 1500) * 0.92, { fill: 'paper', corners: 1, outline: { color: 'main', width: 0.004 } })
      k.star(0.5, 0.12, 0.07, { fill: 'main' })
      k.star(0.36, 0.15, 0.035, { fill: 'accent' })
      k.star(0.64, 0.15, 0.035, { fill: 'accent' })
      k.text('small', t('With joy, we invite you'), { y: 0.3, width: 0.56 })
      k.text('title', t('You are invited'), { y: 0.43, width: 0.6 })
      k.line(0.5, 0.53, 0.16, 'main', 0.003)
      k.text('details', t('to our celebration'), { y: 0.6, width: 0.56 })
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { y: 0.68, width: 0.56 })
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.74, width: 0.56 })
    },
  },
  {
    id: 'flyer-news',
    kind: 'flyer',
    name: msg('Big news'),
    use: msg('A bold color block on top and a short list underneath.'),
    ...A4,
    colors: 'sky',
    styles: {
      title: { name: msg('Title'), font: SANS, size: 0.13, weight: 900, color: 'onMain', lineHeight: 1.05 },
      subtitle: { name: msg('Subtitle'), font: SANS, size: 0.045, weight: 500, color: 'onMain', lineHeight: 1.3 },
      list: { name: msg('List'), font: SANS, size: 0.045, weight: 600, color: 'ink', lineHeight: 1.3 },
      details: { name: msg('Details'), font: SANS, size: 0.036, weight: 500, color: 'ink', lineHeight: 1.3 },
    },
    draw: (k) => {
      k.rect(0.5, 0.2, 1, 0.4 * (3508 / 2480), { fill: 'main' })
      k.oval(k.start(0.88), 0.06, 0.34, 0.34, { fill: 'accent', opacity: 0.9 })
      k.text('title', t('Big news!'), { y: 0.15, width: 0.84 })
      k.text('subtitle', t('Something special is coming. Tell everyone!'), { y: 0.29, width: 0.76 })
      const items = [t('Fun for the whole family'), t('Food and drinks for everyone'), t('Free to join')]
      items.forEach((words, i) => {
        const y = 0.5 + i * 0.1
        k.oval(k.start(0.14), y, 0.05, 0.05, { fill: 'accent' })
        k.text('list', words, { x: k.start(0.52), y, width: 0.66, align: 'start' })
      })
      k.rect(0.5, 0.92, 1, 0.16 * (3508 / 2480), { fill: 'soft' })
      k.text('details', t('Sunday, June 14 · Main Square'), { y: 0.92, width: 0.84 })
    },
  },
  {
    id: 'flyer-band',
    kind: 'flyer',
    name: msg('Slanted band'),
    use: msg('A tilted ribbon of color across the page and a round badge.'),
    ...A4,
    colors: 'sunny',
    styles: {
      title: { name: msg('Title'), font: ROUND, size: 0.13, weight: 800, color: 'onMain', lineHeight: 1.05 },
      subtitle: { name: msg('Subtitle'), font: ROUND, size: 0.05, weight: 600, color: 'ink', lineHeight: 1.3 },
      badge: { name: msg('Badge'), font: ROUND, size: 0.034, weight: 800, color: 'onMain', lineHeight: 1.1 },
      details: { name: msg('Details'), font: SANS, size: 0.04, weight: 500, color: 'ink', lineHeight: 1.35 },
    },
    draw: (k) => {
      k.rect(0.5, 0.08, 1.4, 0.05, { fill: 'soft', rotation: -6 })
      k.rect(0.5, 0.3, 1.4, 0.24, { fill: 'main', rotation: -6 })
      k.text('title', t('Bake sale'), { y: 0.3, width: 0.86 })
      k.text('subtitle', t('Homemade cakes, cookies and more'), { y: 0.46, width: 0.8 })
      k.star(k.start(0.76), 0.6, 0.34, { fill: 'accent', sides: 12 })
      k.text('badge', t('Everyone welcome'), { x: k.start(0.76), y: 0.6, width: 0.22 })
      k.text('details', t('Sunday, June 14'), { x: k.start(0.36), y: 0.58, width: 0.56, align: 'start' })
      k.text('details', t('10:00 AM to 2:00 PM'), { x: k.start(0.36), y: 0.63, width: 0.56, align: 'start' })
      k.line(0.5, 0.82, 0.8, 'main', 0.004)
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.88, width: 0.84 })
    },
  },
  {
    id: 'flyer-lines',
    kind: 'flyer',
    name: msg('Clean lines'),
    use: msg('Calm and simple: a strong title, thin lines and plenty of space.'),
    ...A4,
    colors: 'forest',
    styles: {
      small: { name: msg('Small words'), font: SANS, size: 0.032, weight: 700, color: 'main', letterSpacing: 0.16 },
      title: { name: msg('Title'), font: SERIF, size: 0.12, weight: 800, color: 'ink', lineHeight: 1.05 },
      body: { name: msg('Body text'), font: SANS, size: 0.036, weight: 400, color: 'ink', lineHeight: 1.5 },
      details: { name: msg('Details'), font: SANS, size: 0.038, weight: 600, color: 'main', lineHeight: 1.35 },
    },
    draw: (k) => {
      k.rect(k.start(0.04), 0.5, 0.025, 1 * (3508 / 2480), { fill: 'main' })
      k.text('small', t('Everyone is welcome'), { x: k.start(0.5), y: 0.12, width: 0.8, align: 'start' })
      k.text('title', t('Join us'), { x: k.start(0.5), y: 0.22, width: 0.8, align: 'start' })
      k.line(k.start(0.3), 0.32, 0.4, 'accent', 0.006)
      k.text('body', t('An evening of learning, good talk and good company. Bring a friend and come as you are.'), { x: k.start(0.5), y: 0.43, width: 0.8, align: 'start' })
      k.oval(k.start(0.72), 0.7, 0.5, 0.5, { fill: 'soft' })
      k.oval(k.start(0.83), 0.79, 0.2, 0.2, { fill: 'accent' })
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { x: k.start(0.5), y: 0.88, width: 0.8, align: 'start' })
      k.text('details', t('Garden Hall, 12 Oak Street'), { x: k.start(0.5), y: 0.93, width: 0.8, align: 'start' })
    },
  },
  {
    id: 'poster-circle',
    kind: 'poster',
    name: msg('Big circle'),
    use: msg('One huge circle that catches the eye from far away.'),
    ...A3,
    colors: 'sky',
    styles: {
      title: { name: msg('Title'), font: SANS, size: 0.12, weight: 900, color: 'onMain', lineHeight: 1 },
      subtitle: { name: msg('Subtitle'), font: SANS, size: 0.045, weight: 500, color: 'onMain', lineHeight: 1.3 },
      details: { name: msg('Details'), font: SANS, size: 0.045, weight: 700, color: 'ink', lineHeight: 1.3 },
    },
    draw: (k) => {
      k.oval(0.5, 0.4, 0.86, 0.86, { fill: 'main' })
      k.oval(0.14, 0.1, 0.12, 0.12, { fill: 'accent' })
      k.oval(0.88, 0.66, 0.08, 0.08, { fill: 'accent' })
      k.text('title', t('The big day'), { y: 0.34, width: 0.7 })
      k.text('subtitle', t('Something special is coming. Tell everyone!'), { y: 0.5, width: 0.56 })
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { y: 0.82, width: 0.84 })
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.87, width: 0.84 })
    },
  },
  {
    id: 'poster-stripes',
    kind: 'poster',
    name: msg('Stripes'),
    use: msg('A giant title over bright stripes of color.'),
    ...A3,
    colors: 'sunny',
    styles: {
      title: { name: msg('Title'), font: SERIF, size: 0.16, weight: 900, color: 'ink', lineHeight: 0.95 },
      subtitle: { name: msg('Subtitle'), font: SANS, size: 0.05, weight: 500, color: 'ink', lineHeight: 1.3 },
      details: { name: msg('Details'), font: SANS, size: 0.042, weight: 700, color: 'main', lineHeight: 1.3 },
    },
    draw: (k) => {
      k.text('title', t('The big day'), { x: k.start(0.5), y: 0.2, width: 0.84, align: 'start' })
      k.text('subtitle', t('Something special is coming. Tell everyone!'), { x: k.start(0.5), y: 0.36, width: 0.84, align: 'start' })
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { x: k.start(0.5), y: 0.47, width: 0.84, align: 'start' })
      k.text('details', t('Garden Hall, 12 Oak Street'), { x: k.start(0.5), y: 0.52, width: 0.84, align: 'start' })
      const bands: ColorRole[] = ['soft', 'accent', 'main']
      bands.forEach((color, i) => k.rect(0.5, 0.75 + i * 0.1, 1, 0.1 * (4961 / 3508), { fill: color }))
    },
  },
  {
    id: 'poster-stars',
    kind: 'poster',
    name: msg('Starry night'),
    use: msg('Stars of every size around a shining title.'),
    ...A3,
    colors: 'night',
    styles: {
      small: { name: msg('Small words'), font: SANS, size: 0.035, weight: 600, color: 'accent', letterSpacing: 0.2 },
      title: { name: msg('Title'), font: SERIF, size: 0.15, weight: 900, color: 'main', lineHeight: 1 },
      details: { name: msg('Details'), font: SANS, size: 0.042, weight: 500, color: 'ink', lineHeight: 1.35 },
    },
    draw: (k) => {
      const stars: [number, number, number][] = [
        [0.15, 0.1, 0.08], [0.82, 0.08, 0.05], [0.88, 0.2, 0.09], [0.1, 0.56, 0.05], [0.25, 0.62, 0.04],
        [0.8, 0.6, 0.06], [0.5, 0.06, 0.035], [0.12, 0.82, 0.07], [0.88, 0.86, 0.045],
      ]
      stars.forEach(([x, y, size], i) => k.star(x, y, size, { fill: i % 3 === 0 ? 'main' : 'accent', rotation: (i * 17) % 36 }))
      k.text('small', t('Everyone is welcome'), { y: 0.3, width: 0.7 })
      k.text('title', t('A night to remember'), { y: 0.42, width: 0.74 })
      k.line(0.5, 0.54, 0.2, 'main', 0.004)
      k.text('details', t('Sunday, June 14 · 7:00 PM'), { y: 0.68, width: 0.7 })
      k.text('details', t('Garden Hall, 12 Oak Street'), { y: 0.73, width: 0.7 })
    },
  },
])

export function layoutColors(id: string): LayoutColors {
  return LAYOUT_COLORS.find((c) => c.id === id) ?? LAYOUT_COLORS[0]
}

function styleOf(spec: StyleSpec, colors: LayoutColors, width: number): TextStyle {
  return {
    font: spec.font,
    size: Math.round(spec.size * width),
    weight: spec.weight,
    italic: spec.italic ?? false,
    color: colors[spec.color],
    align: 'center',
    direction: 'auto',
    letterSpacing: spec.letterSpacing ?? 0,
    lineHeight: spec.lineHeight ?? 1.2,
  }
}

// Draws a layout as a design: every part a shape or a text, on a page of its colors. `id` is
// the new design's id.
export function buildLayout(layout: LayoutInfo, colorsId = layout.colors, name = layout.name, id = createDesignId()): EditorDocument {
  const colors = layoutColors(colorsId)
  const { width: W, height: H } = layout
  const rtl = isRtl()
  const layers: Layer[] = []
  const base = { visible: true, locked: false, adjust: null }
  // Each kind of text is one of the design's text styles.
  const empty: EditorDocument = { id, name, width: W, height: H, background: colors.page, layers: [], activeLayerId: '', selection: null }
  const styles: SavedTextStyle[] = []
  const styleIds = new Map<string, string>()
  const styleFor = (key: string) => {
    const spec = layout.styles[key]
    if (!styleIds.has(key)) {
      const styleId = newStyleId({ ...empty, textStyles: styles })
      styleIds.set(key, styleId)
      // Several layouts share kinds of text with the same name; each style keeps its own.
      styles.push({ id: styleId, name: t(spec.name), style: styleOf(spec, colors, W) })
    }
    return styleIds.get(key)!
  }

  function shape(type: ShapeType, x: number, y: number, w: number, h: number, options: ShapeOptions = {}) {
    const geometry: ShapeGeometry = { type, corners: options.corners ?? 0, sides: options.sides ?? (type === 'star' ? 5 : 6), arrow: false }
    const names = layers.map((l) => l.name)
    const layer: ShapeLayer = {
      id: createId('layer'),
      kind: 'shape',
      name: nextNumberedName(t(SHAPE_WORDS[type]), names),
      ...base,
      opacity: options.opacity ?? 1,
      box: { cx: x * W, cy: y * H, width: w * W, height: h * W, rotation: ((options.rotation ?? 0) * Math.PI) / 180 },
      geometry,
      fill: options.fill === null ? { kind: 'none' } : { kind: 'color', color: colors[options.fill ?? 'main'] },
      outline: options.outline ? { color: colors[options.outline.color], width: Math.max(1, Math.round(options.outline.width * W)) } : null,
    }
    layers.push(layer)
  }

  const kit: LayoutKit = {
    colors,
    rtl,
    rect: (x, y, w, h, options) => shape('rectangle', x, y, w, h, options),
    oval: (x, y, w, h, options) => shape('ellipse', x, y, w, h, options),
    polygon: (x, y, size, options) => shape('polygon', x, y, size, size, options),
    star: (x, y, size, options) => shape('star', x, y, size, size, options),
    line: (x, y, length, color, width, rotation = 0) => {
      layers.push({
        id: createId('layer'),
        kind: 'shape',
        name: nextNumberedName(t(SHAPE_WORDS.line), layers.map((l) => l.name)),
        ...base,
        opacity: 1,
        box: { cx: x * W, cy: y * H, width: length * W, height: Math.max(1, Math.round(width * W)), rotation: (rotation * Math.PI) / 180 },
        geometry: { type: 'line', corners: 0, sides: 6, arrow: false },
        fill: { kind: 'none' },
        outline: { color: colors[color], width: Math.max(1, Math.round(width * W)) },
      })
    },
    text: (key, words, options) => {
      const styleId = styleFor(key)
      const saved = styles.find((s) => s.id === styleId)!
      const style: TextStyle = { ...saved.style, align: options.align === 'start' ? 'auto' : 'center' }
      const cx = (options.x ?? 0.5) * W
      const cy = options.y * H
      const boxWidth = (options.width ?? 0.8) * W
      const layer: TextLayer = {
        id: createId('layer'),
        kind: 'text',
        name: textName(words),
        ...base,
        opacity: 1,
        box: { cx, cy, width: boxWidth, height: style.size * style.lineHeight, rotation: 0 },
        text: words,
        style,
        wrap: true,
        styleId,
      }
      const fitted = fitText(layer)
      layers.push({ ...fitted, box: { ...fitted.box, cx, cy } })
      // The style keeps how its texts line up.
      saved.style = { ...saved.style, align: style.align }
    },
    start: (x) => (rtl ? 1 - x : x),
  }
  layout.draw(kit)
  const kept = [...new Set([colors.main, colors.accent, colors.ink, colors.soft, colors.page, colors.paper, colors.onMain])]
  return { ...empty, layers, colors: kept, textStyles: styles, ppi: 300 }
}

const SHAPE_WORDS: Record<ShapeType, string> = { rectangle: msg('Rectangle'), ellipse: msg('Oval'), polygon: msg('Polygon'), star: msg('Star'), line: msg('Line'), path: msg('Drawn shape') }

// Loads the fonts a layout's words use, so its texts are measured with their real letters.
export async function loadLayoutFonts(layout: LayoutInfo): Promise<void> {
  const doc = buildLayout(layout)
  await Promise.all(doc.layers.map((layer) => (layer.kind === 'text' ? loadFont(layer.style, layer.text) : null)))
}
