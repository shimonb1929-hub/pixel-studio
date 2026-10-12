import { boxRadii } from './adjust.ts'
import { createCanvas, getContext2d } from './document.ts'
import { containsRect, intersectRect, snapRect, type Rect } from './geometry.ts'

// Effects around what's on a layer (a shadow, a glow, an outline) and how a layer mixes with what's
// below it. Like adjustments, they're settings on the layer: what's on it never changes, so they
// can be changed again or taken off at any time.

// The ways a layer can mix with what's below it. These are the browser's own names, so they look
// the same everywhere.
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface BlendInfo {
  mode: BlendMode
  name: string
  // What it does, in plain words.
  description: string
  // The name other programs use, so people who know them find it.
  proName: string
  // The most useful ones come first; the rest are under "More".
  common: boolean
}

export const BLEND_MODES: BlendInfo[] = [
  { mode: 'normal', name: 'Normal', proName: 'Normal', common: true, description: 'The layer simply covers what is below it.' },
  {
    mode: 'multiply',
    name: 'Darken only',
    proName: 'Multiply',
    common: true,
    description: 'Only makes things darker: white parts disappear. Great for line drawings, paper textures and shadows on photos.',
  },
  {
    mode: 'screen',
    name: 'Lighten only',
    proName: 'Screen',
    common: true,
    description: 'Only makes things lighter: black parts disappear. Great for light, fire, sparkles and glows.',
  },
  {
    mode: 'overlay',
    name: 'Contrast',
    proName: 'Overlay',
    common: true,
    description: 'Light parts brighten and dark parts darken what is below. Great for textures and color tints.',
  },
  { mode: 'soft-light', name: 'Soft contrast', proName: 'Soft light', common: true, description: 'Like Contrast, but gentler. Good for a soft tint or a light texture.' },
  {
    mode: 'color',
    name: 'Color only',
    proName: 'Color',
    common: true,
    description: "Gives what's below this layer's colors, keeping its own light and shadow. Great for coloring black-and-white photos.",
  },
  { mode: 'luminosity', name: 'Light only', proName: 'Luminosity', common: true, description: "Gives what's below this layer's light and shadow, keeping its own colors." },
  { mode: 'darken', name: 'Darker of the two', proName: 'Darken', common: true, description: 'Each spot shows whichever is darker: this layer or what is below.' },
  { mode: 'lighten', name: 'Lighter of the two', proName: 'Lighten', common: true, description: 'Each spot shows whichever is lighter: this layer or what is below.' },
  { mode: 'difference', name: 'Difference', proName: 'Difference', common: true, description: 'Matching colors turn black. Handy for lining up two photos, and for bold, strange colors.' },
  { mode: 'hard-light', name: 'Strong contrast', proName: 'Hard light', common: false, description: 'Like Contrast, but much stronger.' },
  { mode: 'color-dodge', name: 'Brighten strongly', proName: 'Color dodge', common: false, description: 'Brightens what is below a lot. Good for shining light and glows.' },
  { mode: 'color-burn', name: 'Darken strongly', proName: 'Color burn', common: false, description: 'Darkens what is below a lot, with rich colors.' },
  { mode: 'exclusion', name: 'Soft difference', proName: 'Exclusion', common: false, description: 'Like Difference, but softer and grayer.' },
  { mode: 'hue', name: 'Hue only', proName: 'Hue', common: false, description: "Gives what's below this layer's hue (red, green, blue…) and keeps the rest." },
  { mode: 'saturation', name: 'Color strength only', proName: 'Saturation', common: false, description: "Gives what's below this layer's color strength and keeps the rest." },
]

export function blendInfo(mode: BlendMode | undefined): BlendInfo {
  return BLEND_MODES.find((b) => b.mode === (mode ?? 'normal')) ?? BLEND_MODES[0]
}

export interface ShadowEffect {
  color: string
  // 0 to 1.
  opacity: number
  // How soft the edge is, in design pixels.
  blur: number
  // How far the shadow falls from the object, in design pixels.
  distance: number
  // Which way it falls, in degrees: 0 is right, 90 is down.
  angle: number
}

export interface GlowEffect {
  color: string
  opacity: number
  // How far the glow reaches, in design pixels.
  size: number
}

export interface OutlineEffect {
  color: string
  // In design pixels, all the way around the outside.
  width: number
}

export interface LayerEffects {
  shadow: ShadowEffect | null
  glow: GlowEffect | null
  outline: OutlineEffect | null
}

export const NO_EFFECTS: LayerEffects = { shadow: null, glow: null, outline: null }

export type EffectKind = keyof LayerEffects

export function hasEffects(effects: LayerEffects | null | undefined): effects is LayerEffects {
  return !!effects && !!(effects.shadow || effects.glow || effects.outline)
}

// Sizes for effects grow with the design, so a shadow looks the same on a phone story and a poster.
export function effectUnit(designWidth: number, designHeight: number): number {
  return Math.max(designWidth, designHeight) / 1000
}

export function defaultShadow(unit: number): ShadowEffect {
  return { color: '#000000', opacity: 0.35, blur: Math.round(24 * unit), distance: Math.round(12 * unit), angle: 90 }
}

export function defaultGlow(unit: number): GlowEffect {
  return { color: '#ffd84d', opacity: 0.9, size: Math.round(30 * unit) }
}

export function defaultOutline(unit: number): OutlineEffect {
  return { color: '#ffffff', width: Math.max(1, Math.round(8 * unit)) }
}

export interface EffectLook {
  id: string
  name: string
  description: string
  effects: (unit: number) => LayerEffects
}

// Ready-made effects, each shown on the picked object itself.
export const EFFECT_LOOKS: EffectLook[] = [
  { id: 'none', name: 'None', description: 'No shadow, glow or outline.', effects: () => NO_EFFECTS },
  { id: 'soft-shadow', name: 'Soft shadow', description: 'A soft shadow underneath, as if it sits just above the page.', effects: (u) => ({ ...NO_EFFECTS, shadow: defaultShadow(u) }) },
  {
    id: 'floating',
    name: 'Floating',
    description: 'A wide, faint shadow far below, as if it floats high above the page.',
    effects: (u) => ({ ...NO_EFFECTS, shadow: { color: '#000000', opacity: 0.3, blur: Math.round(60 * u), distance: Math.round(36 * u), angle: 90 } }),
  },
  {
    id: 'bold-shadow',
    name: 'Bold shadow',
    description: 'A solid shadow with a hard edge, off to the side. A strong, poster-like look.',
    effects: (u) => ({ ...NO_EFFECTS, shadow: { color: '#000000', opacity: 0.9, blur: 0, distance: Math.round(12 * u), angle: 45 } }),
  },
  { id: 'glow', name: 'Glow', description: 'A warm light shining around it.', effects: (u) => ({ ...NO_EFFECTS, glow: defaultGlow(u) }) },
  {
    id: 'neon',
    name: 'Neon',
    description: 'A bright pink light around it, like a neon sign. Looks best on a dark page.',
    effects: (u) => ({ ...NO_EFFECTS, glow: { color: '#ff2bd6', opacity: 1, size: Math.round(28 * u) } }),
  },
  {
    id: 'sticker',
    name: 'Sticker',
    description: 'A thick white edge and a small shadow, like a sticker.',
    effects: (u) => ({
      shadow: { color: '#000000', opacity: 0.3, blur: Math.round(16 * u), distance: Math.round(6 * u), angle: 90 },
      glow: null,
      outline: { color: '#ffffff', width: Math.max(1, Math.round(14 * u)) },
    }),
  },
  { id: 'outline', name: 'Outline', description: 'A dark line all the way around it.', effects: (u) => ({ ...NO_EFFECTS, outline: { color: '#1b1d23', width: Math.max(1, Math.round(6 * u)) } }) },
]

function sameEffect<T extends object>(a: T | null, b: T | null): boolean {
  if (!a || !b) return a === b
  return (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key])
}

export function sameEffects(a: LayerEffects | null | undefined, b: LayerEffects | null | undefined): boolean {
  const x = a ?? NO_EFFECTS
  const y = b ?? NO_EFFECTS
  return sameEffect(x.shadow, y.shadow) && sameEffect(x.glow, y.glow) && sameEffect(x.outline, y.outline)
}

export function matchingEffectLook(effects: LayerEffects | null | undefined, unit: number): EffectLook | undefined {
  return EFFECT_LOOKS.find((look) => sameEffects(look.effects(unit), effects))
}

// For Undo: "Undo add shadow".
export function effectsLabel(effects: LayerEffects | null | undefined, unit: number): string {
  if (!hasEffects(effects)) return 'Remove effects'
  const look = matchingEffectLook(effects, unit)
  return look ? `${look.name} effect` : 'Change effects'
}

// How a glow is made: the shape is first grown a little, then blurred.
const GLOW_SPREAD = 0.3
const GLOW_SIGMA = 0.35

// How far past the object its effects reach, in design pixels.
export function effectsReach(effects: LayerEffects | null | undefined): number {
  if (!hasEffects(effects)) return 0
  const outline = effects.outline?.width ?? 0
  const shadow = effects.shadow ? 1.5 * effects.shadow.blur + effects.shadow.distance : 0
  const glow = effects.glow ? (GLOW_SPREAD + 3 * GLOW_SIGMA) * effects.glow.size : 0
  return Math.ceil(outline + Math.max(shadow, glow)) + 2
}

const FAR = 1e20

// Distance along one row or column to the nearest point that's in the shape (squared). `f` holds 0
// for points in the shape and FAR for the rest. Felzenszwalb and Huttenlocher's method, which takes
// the same time however far things are.
function distances1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

// For every pixel, how far it is from the nearest pixel that's in the shape (0 inside it).
export function distanceToShape(inside: Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(width, height)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const grid = new Float64Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = inside[i] ? 0 : FAR
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    distances1d(f, height, d, v, z)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    distances1d(f, width, d, v, z)
    for (let x = 0; x < width; x++) out[row + x] = Math.sqrt(d[x])
  }
  return out
}

// Grows a shape (how solid each pixel is, 0 to 1) outward by `amount` pixels, with smooth edges. A
// pixel's middle is half a pixel past the shape's edge, so one `distance` away is covered by an amount of 1.
export function growShape(alpha: Float32Array, width: number, height: number, amount: number): Float32Array {
  if (amount < 0.5) return alpha
  const inside = new Uint8Array(alpha.length)
  for (let i = 0; i < alpha.length; i++) inside[i] = alpha[i] >= 0.5 ? 1 : 0
  const distance = distanceToShape(inside, width, height)
  const out = new Float32Array(alpha.length)
  for (let i = 0; i < alpha.length; i++) out[i] = Math.max(alpha[i], Math.min(1, Math.max(0, amount + 1 - distance[i])))
  return out
}

// Blurs one value per pixel. Past the edges is empty, so blurs fade out instead of smearing.
export function blurValues(values: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radii = boxRadii(sigma)
  if (sigma < 0.3 || radii.every((r) => r < 1)) return values
  let src = Float32Array.from(values)
  let dst = new Float32Array(values.length)
  for (const r of radii) {
    if (r < 1) continue
    const scale = 1 / (2 * r + 1)
    for (let y = 0; y < height; y++) {
      const row = y * width
      let sum = 0
      for (let k = 0; k <= Math.min(r, width - 1); k++) sum += src[row + k]
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum * scale
        if (x + r + 1 < width) sum += src[row + x + r + 1]
        if (x - r >= 0) sum -= src[row + x - r]
      }
    }
    ;[src, dst] = [dst, src]
    const sums = new Float32Array(width)
    for (let k = 0; k <= Math.min(r, height - 1); k++) for (let x = 0; x < width; x++) sums[x] += src[k * width + x]
    for (let y = 0; y < height; y++) {
      const row = y * width
      const add = (y + r + 1) * width
      const sub = (y - r) * width
      for (let x = 0; x < width; x++) {
        dst[row + x] = sums[x] * scale
        if (y + r + 1 < height) sums[x] += src[add + x]
        if (y - r >= 0) sums[x] -= src[sub + x]
      }
    }
    ;[src, dst] = [dst, src]
  }
  return src
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1, 7), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

// Effects at a given size: pixel sizes already multiplied by how many screen or file pixels one
// design pixel is.
export interface ScaledEffects {
  shadow: ShadowEffect | null
  glow: GlowEffect | null
  outline: OutlineEffect | null
}

export function scaleEffects(effects: LayerEffects, scale: number): ScaledEffects {
  return {
    shadow: effects.shadow && { ...effects.shadow, blur: effects.shadow.blur * scale, distance: effects.shadow.distance * scale },
    glow: effects.glow && { ...effects.glow, size: effects.glow.size * scale },
    outline: effects.outline && { ...effects.outline, width: effects.outline.width * scale },
  }
}

// Works out the shadow, glow and outline around a picture whose see-through parts are given by
// `contentAlpha` (0 to 255). Returns RGBA pixels to put behind the picture.
export function effectPixels(contentAlpha: Uint8ClampedArray | Uint8Array, width: number, height: number, effects: ScaledEffects): Uint8ClampedArray<ArrayBuffer> {
  const count = width * height
  const content = new Float32Array(count)
  for (let i = 0; i < count; i++) content[i] = contentAlpha[i] / 255

  // The outline is the shape grown outward; together they make the silhouette that casts the
  // shadow and the glow.
  const outline = effects.outline && effects.outline.width >= 0.25 ? growShape(content, width, height, effects.outline.width) : null
  const silhouette = outline ?? content

  // Premultiplied colors, painted back to front: shadow, then glow, then outline.
  const r = new Float32Array(count)
  const g = new Float32Array(count)
  const b = new Float32Array(count)
  const a = new Float32Array(count)
  const paint = (coverage: (i: number) => number, color: string, opacity: number) => {
    const [cr, cg, cb] = hexToRgb(color)
    for (let i = 0; i < count; i++) {
      // Nothing shows through the object itself, so a see-through object never looks dirty.
      const alpha = Math.min(1, coverage(i)) * opacity * (1 - silhouette[i])
      if (alpha <= 0) continue
      const keep = 1 - alpha
      r[i] = cr * alpha + r[i] * keep
      g[i] = cg * alpha + g[i] * keep
      b[i] = cb * alpha + b[i] * keep
      a[i] = alpha + a[i] * keep
    }
  }

  if (effects.shadow) {
    const { blur, distance, angle } = effects.shadow
    const soft = blurValues(silhouette, width, height, blur / 2)
    const dx = Math.round(Math.cos((angle * Math.PI) / 180) * distance)
    const dy = Math.round(Math.sin((angle * Math.PI) / 180) * distance)
    paint(
      (i) => {
        const x = (i % width) - dx
        const y = Math.floor(i / width) - dy
        return x >= 0 && y >= 0 && x < width && y < height ? soft[y * width + x] : 0
      },
      effects.shadow.color,
      effects.shadow.opacity,
    )
  }
  if (effects.glow && effects.glow.size >= 0.5) {
    const { size } = effects.glow
    const grown = growShape(silhouette, width, height, size * GLOW_SPREAD)
    const soft = blurValues(grown, width, height, size * GLOW_SIGMA)
    paint((i) => soft[i] * 1.4, effects.glow.color, effects.glow.opacity)
  }

  const out = new Uint8ClampedArray(count * 4)
  const [or, og, ob] = outline ? hexToRgb(effects.outline!.color) : [0, 0, 0]
  for (let i = 0; i < count; i++) {
    // The outline sits right under the object, so its soft edge blends into the outline color.
    let pr = r[i]
    let pg = g[i]
    let pb = b[i]
    let pa = a[i]
    if (outline && outline[i] > 0) {
      const alpha = outline[i]
      const keep = 1 - alpha
      pr = or * alpha + pr * keep
      pg = og * alpha + pg * keep
      pb = ob * alpha + pb * keep
      pa = alpha + pa * keep
    }
    if (pa <= 0) continue
    const o = i * 4
    out[o] = pr / pa
    out[o + 1] = pg / pa
    out[o + 2] = pb / pa
    out[o + 3] = pa * 255
  }
  return out
}

// Drawing a layer with its effects and blend mode.

export interface DrawOptions {
  // False draws the layer as if it were alone (for small previews of one layer).
  blend?: boolean
}

interface GroupCache {
  key: string
  // Where the canvas sits, in target pixels counted from the whole-pixel part of the offset.
  rect: Rect
  canvas: HTMLCanvasElement
}

// Kept per layer (or per set of preview pictures), a few sizes each: the screen and the small
// previews in the Layers panel draw the same layer at different sizes.
const groups = new WeakMap<object, GroupCache[]>()
const KEEP_SIZES = 3
// Never work on more than this many pixels for one layer's effects; past it, effects are worked out
// at less detail (they are soft, so this barely shows).
const MAX_EFFECT_PIXELS = 4096 * 4096

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by }
}

// Draws a layer through `draw` (in design coordinates, onto a context set up like `ctx`), with its
// effects behind it, and mixed with what's below by its blend mode. The caller sets the opacity.
// `bounds` is the area `draw` covers, in design pixels. `cacheKey` stands for what `draw` draws,
// and `version` changes when that changes without a new object.
export function drawWithEffects(
  ctx: CanvasRenderingContext2D,
  effects: LayerEffects | null | undefined,
  blend: BlendMode | undefined,
  bounds: Rect,
  draw: (ctx: CanvasRenderingContext2D) => void,
  cacheKey: object,
  version: number,
  options: DrawOptions = {},
): void {
  const mode = options.blend === false ? 'normal' : (blend ?? 'normal')
  if (!hasEffects(effects)) {
    if (mode === 'normal') {
      draw(ctx)
      return
    }
    ctx.save()
    ctx.globalCompositeOperation = mode
    draw(ctx)
    ctx.restore()
    return
  }

  // Effects are worked out in the target's own pixels, lined up with them, so the object stays
  // exactly as sharp as it is without effects.
  const m = ctx.getTransform()
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
  if (!(scale > 0)) return
  const anchorX = Math.floor(m.e)
  const anchorY = Math.floor(m.f)
  const fracX = m.e - anchorX
  const fracY = m.f - anchorY
  const reach = effectsReach(effects) * scale
  const whole = snapRect(grow({ x: bounds.x * m.a + fracX, y: bounds.y * m.d + fracY, width: bounds.width * m.a, height: bounds.height * m.d }, reach))
  // Only what can be seen on the target matters, and what's near enough to cast effects onto it.
  const visible = intersectRect(whole, { x: -anchorX, y: -anchorY, width: ctx.canvas.width, height: ctx.canvas.height })
  if (!visible) return

  const key = `${m.a},${m.b},${m.c},${m.d},${fracX.toFixed(3)},${fracY.toFixed(3)},${version},${options.blend !== false}`
  const kept = groups.get(cacheKey) ?? []
  let group = kept.find((g) => g.key === key && containsRect(g.rect, visible))
  if (!group) {
    // Work out a bit more than is visible, so moving around the design doesn't need it again.
    const margin = Math.max(visible.width, visible.height) / 2 + reach
    let rect = intersectRect(whole, snapRect(grow(visible, margin)))!
    if (rect.width * rect.height > MAX_EFFECT_PIXELS) rect = intersectRect(whole, snapRect(grow(visible, reach)))!
    const area = rect.width * rect.height
    const shrink = area > MAX_EFFECT_PIXELS ? Math.sqrt(MAX_EFFECT_PIXELS / area) : 1
    group = { key, rect, canvas: renderGroup(ctx, effects, rect, m, anchorX, anchorY, draw, shrink) }
    const next = [group, ...kept.filter((g) => g.key !== key)].slice(0, KEEP_SIZES)
    groups.set(cacheKey, next)
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = mode === 'normal' ? 'source-over' : mode
  ctx.drawImage(group.canvas, group.rect.x + anchorX, group.rect.y + anchorY, group.rect.width, group.rect.height)
  ctx.restore()
}

function renderGroup(
  target: CanvasRenderingContext2D,
  effects: LayerEffects,
  rect: Rect,
  m: DOMMatrix,
  anchorX: number,
  anchorY: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  shrink: number,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(rect.width * shrink))
  const height = Math.max(1, Math.round(rect.height * shrink))
  const content = createCanvas(width, height)
  const cctx = content.getContext('2d', { willReadFrequently: true }) ?? getContext2d(content)
  cctx.imageSmoothingEnabled = target.imageSmoothingEnabled
  cctx.imageSmoothingQuality = target.imageSmoothingQuality
  cctx.setTransform(m.a * shrink, m.b * shrink, m.c * shrink, m.d * shrink, (m.e - anchorX - rect.x) * shrink, (m.f - anchorY - rect.y) * shrink)
  draw(cctx)
  cctx.setTransform(1, 0, 0, 1, 0, 0)

  const image = cctx.getImageData(0, 0, width, height)
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3]
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * shrink
  const behind = effectPixels(alpha, width, height, scaleEffects(effects, scale))

  const out = createCanvas(width, height)
  const octx = getContext2d(out)
  octx.putImageData(new ImageData(behind, width, height), 0, 0)
  octx.drawImage(content, 0, 0)
  return out
}
