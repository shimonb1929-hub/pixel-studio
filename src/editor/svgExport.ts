import { isNeutral } from './adjust.ts'
import { drawLayer } from './compose.ts'
import { createCanvas, getContext2d } from './document.ts'
import { effectsReach } from './effects.ts'
import { gradientLine, type Gradient } from './gradient.ts'
import { arrowLength, canFill, fillRule, hasArrow, isLineShape, layerBounds, outlineDash, photoPlacement, scaledPath, shapePath, type PathSink } from './objects.ts'
import { endDirection } from './path.ts'
import { tableParts, tableTexts } from './table.ts'
import type { EditorDocument, Layer, PixelLayer, ShapeLayer, TextLayer } from './types.ts'
import { cssFont, familyName, fontFormat, fontInfo, fontStack, fontStackIds } from '../text/fonts.ts'
import { styledPieces } from '../text/spans.ts'
import { lineShift, textCurve, textLayout } from '../text/textLayer.ts'
import type { CurvedText } from '../text/textCurve.ts'

// The design as an SVG file: shapes and text stay sharp at any size and can be changed in other
// design programs. Photos and drawings come along as pictures inside it, at full detail. A layer
// with effects, adjustments or hidden parts (or text with a photo inside) comes along as a picture
// of how it looks, so it looks the same.

// Pictures of layers with effects are made at this many pixels for each design pixel.
const PICTURE_DETAIL = 2

const n = (value: number) => String(Math.round(value * 1000) / 1000)

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The words of an SVG path, written the way a canvas path is drawn.
class SvgPath implements PathSink {
  d = ''
  moveTo(x: number, y: number) {
    this.d += `M${n(x)} ${n(y)}`
  }
  lineTo(x: number, y: number) {
    this.d += `L${n(x)} ${n(y)}`
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`
  }
  closePath() {
    this.d += 'Z'
  }
  roundRect(x: number, y: number, w: number, h: number, radii?: number | DOMPointInit | (number | DOMPointInit)[]) {
    const r = Math.min(typeof radii === 'number' ? radii : 0, Math.abs(w) / 2, Math.abs(h) / 2)
    if (r <= 0) {
      this.d += `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`
      return
    }
    const arc = (tx: number, ty: number) => `A${n(r)} ${n(r)} 0 0 1 ${n(tx)} ${n(ty)}`
    this.d +=
      `M${n(x + r)} ${n(y)}H${n(x + w - r)}${arc(x + w, y + r)}V${n(y + h - r)}${arc(x + w - r, y + h)}` +
      `H${n(x + r)}${arc(x, y + h - r)}V${n(y + r)}${arc(x + r, y)}Z`
  }
  // Only whole ellipses are used for shapes.
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    const arc = (ty: number) => `A${n(rx)} ${n(ry)} 0 1 1 ${n(cx)} ${n(ty)}`
    this.d += `M${n(cx)} ${n(cy - ry)}${arc(cy + ry)}${arc(cy - ry)}Z`
  }
}

// Names inside one file, so gradients and clip shapes can be pointed at.
class Ids {
  private count = 0
  next(kind: string): string {
    return `${kind}${++this.count}`
  }
}

// A gradient filling a w × h area centered on cx, cy, like canvasGradient does.
function gradientDef(id: string, gradient: Gradient, w: number, h: number, cx = 0, cy = 0): string {
  const stops = [...gradient.stops]
    .sort((a, b) => a.at - b.at)
    .map((s) => `<stop offset="${n(Math.max(0, Math.min(1, s.at)))}" stop-color="${s.color}"${s.opacity < 1 ? ` stop-opacity="${n(s.opacity)}"` : ''}/>`)
    .join('')
  if (gradient.type === 'radial') {
    const r = Math.max(Math.hypot(w, h) / 2, 0.5)
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stops}</radialGradient>`
  }
  const { x0, y0, x1, y1 } = gradientLine(gradient.angle, w, h)
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(cx + x0)}" y1="${n(cy + y0)}" x2="${n(cx + x1)}" y2="${n(cy + y1)}">${stops}</linearGradient>`
}

function pictureHref(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

// Where 0, 0 is a box's middle, turned and flipped like it.
function boxTransform(box: { cx: number; cy: number; width: number; height: number; rotation: number }): string {
  const flip = box.width < 0 || box.height < 0 ? ` scale(${box.width < 0 ? -1 : 1} ${box.height < 0 ? -1 : 1})` : ''
  return `translate(${n(box.cx)} ${n(box.cy)}) rotate(${n((box.rotation * 180) / Math.PI)})${flip}`
}

function pixelLayerSvg(layer: PixelLayer): string {
  const href = pictureHref(layer.canvas)
  if (!layer.box) return `<image x="${n(layer.x)}" y="${n(layer.y)}" width="${layer.canvas.width}" height="${layer.canvas.height}" href="${href}"/>`
  const w = Math.abs(layer.box.width)
  const h = Math.abs(layer.box.height)
  return `<g transform="${boxTransform(layer.box)}"><image x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" href="${href}"/></g>`
}

function shapeSvg(layer: ShapeLayer, ids: Ids, defs: string[]): string {
  const { geometry, fill, outline } = layer
  const w = Math.abs(layer.box.width)
  const h = Math.abs(layer.box.height)
  const path = shapePath(geometry, w, h, outline?.width ?? 0, new SvgPath()).d
  const rule = fillRule(geometry) === 'evenodd' ? ' fill-rule="evenodd"' : ''
  const parts: string[] = []
  if (canFill(geometry)) {
    if (fill.kind === 'color') {
      parts.push(`<path d="${path}" fill="${fill.color}"${rule}/>`)
    } else if (fill.kind === 'gradient') {
      const id = ids.next('fill')
      defs.push(gradientDef(id, fill.gradient, w, h))
      const whole = hasArrow(geometry) ? shapePath({ ...geometry, arrow: false }, w, h, 0, new SvgPath()).d : path
      parts.push(`<path d="${whole}" fill="url(#${id})"${rule}/>`)
    } else if (fill.kind === 'photo') {
      const id = ids.next('inside')
      defs.push(`<clipPath id="${id}"><path d="${path}"${rule ? ` clip-rule="evenodd"` : ''}/></clipPath>`)
      const place = photoPlacement(fill, w, h)
      parts.push(
        `<image clip-path="url(#${id})" x="${n(place.x)}" y="${n(place.y)}" width="${n(place.width)}" height="${n(place.height)}" preserveAspectRatio="none" href="${pictureHref(fill.canvas)}"/>`,
      )
    }
  }
  if (outline && outline.width > 0) {
    const dash = outlineDash(outline)
    const cap = dash ? dash.cap : isLineShape(geometry) ? 'round' : 'butt'
    const dashes = dash ? ` stroke-dasharray="${dash.pattern.map(n).join(' ')}"` : ''
    parts.push(`<path d="${path}" fill="none" stroke="${outline.color}" stroke-width="${n(outline.width)}" stroke-linejoin="round" stroke-linecap="${cap}"${dashes}/>`)
    if (hasArrow(geometry)) {
      const length = arrowLength(outline.width)
      let tip = { x: w / 2, y: 0 }
      let dir = { x: 1, y: 0 }
      if (geometry.type === 'path') {
        const pen = scaledPath(geometry, w, h)
        tip = pen.nodes[pen.nodes.length - 1]
        dir = endDirection(pen)
      }
      const back = { x: tip.x - dir.x * length, y: tip.y - dir.y * length }
      const side = { x: -dir.y * length * 0.6, y: dir.x * length * 0.6 }
      const points = [tip, { x: back.x + side.x, y: back.y + side.y }, { x: back.x - side.x, y: back.y - side.y }]
      parts.push(`<polygon points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${outline.color}"/>`)
    }
  }
  return `<g transform="${boxTransform(layer.box)}">${parts.join('')}</g>`
}

// Text placed exactly as it's drawn on the design: line by line, each piece that reads one way and
// has one look on its own, so right-to-left words and numbers inside them come out just as shown.
// Curved text: each letter on its own, turned to follow the curve. A gradient fills a rectangle
// cut to the letters' shape, so its colors run across the whole text like on the design.
function curvedSvg(layer: TextLayer, curved: CurvedText, ids: Ids, defs: string[]): string {
  const { box, style } = layer
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const letters: string[] = []
  for (const glyph of curved.glyphs) {
    if (!glyph.text.trim()) continue
    const look = glyph.style
    const attributes = [
      `transform="translate(${n(glyph.x)} ${n(glyph.y)}) rotate(${n((glyph.angle * 180) / Math.PI)})"`,
      `x="${n(glyph.rtl ? glyph.width : 0)}"`,
      'y="0"',
      style.gradient && look.color === style.color ? '' : `fill="${look.color}"`,
      `font-family="${escape(fontStack(look.font))}"`,
      `font-size="${n(look.size)}"`,
      `font-weight="${look.weight}"`,
      look.italic ? 'font-style="italic"' : '',
      glyph.rtl ? 'direction="rtl" unicode-bidi="embed"' : '',
    ]
    letters.push(`<text ${attributes.filter(Boolean).join(' ')}>${escape(glyph.text)}</text>`)
  }
  let body = letters.join('')
  if (style.gradient) {
    const own = letters.filter((l) => l.includes(' fill="'))
    const shared = letters.filter((l) => !l.includes(' fill="'))
    const gradient = ids.next('letters')
    const clip = ids.next('clip')
    const left = curved.center.x - w / 2
    const top = curved.center.y - h / 2
    defs.push(gradientDef(gradient, style.gradient, w, h, curved.center.x, curved.center.y))
    defs.push(`<clipPath id="${clip}">${shared.join('')}</clipPath>`)
    body = `<rect x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" fill="url(#${gradient})" clip-path="url(#${clip})"/>${own.join('')}`
  }
  const flip = box.width < 0 || box.height < 0 ? ` scale(${box.width < 0 ? -1 : 1} ${box.height < 0 ? -1 : 1})` : ''
  return `<g transform="translate(${n(box.cx)} ${n(box.cy)}) rotate(${n((box.rotation * 180) / Math.PI)})${flip} translate(${n(-curved.center.x)} ${n(-curved.center.y)})">${body}</g>`
}

function textSvg(layer: TextLayer, ids: Ids, defs: string[]): string {
  const { box, style } = layer
  const curved = textCurve(layer)
  if (curved) return curvedSvg(layer, curved, ids, defs)
  const layout = textLayout(layer)
  const w = Math.abs(box.width)
  const h = Math.abs(box.height)
  const measure = getContext2d(createCanvas(1, 1))
  measure.letterSpacing = `${style.letterSpacing * style.size}px`
  const shift = lineShift(layer, layout)
  let fill = style.color
  if (style.gradient) {
    const id = ids.next('letters')
    defs.push(gradientDef(id, style.gradient, w, h, w / 2 - shift, h / 2))
    fill = `url(#${id})`
  }
  const pieces: string[] = []
  for (const marker of layout.markers ?? []) {
    const rtl = marker.direction === 'rtl'
    const attributes = [
      `x="${n(rtl ? marker.x + marker.width : marker.x)}"`,
      `y="${n(marker.baseline)}"`,
      `fill="${fill}"`,
      `font-family="${escape(fontStack(style.font))}"`,
      `font-size="${n(style.size)}"`,
      `font-weight="${style.weight}"`,
      style.italic ? 'font-style="italic"' : '',
      rtl ? 'direction="rtl" unicode-bidi="embed"' : '',
      style.letterSpacing ? `letter-spacing="${n(style.letterSpacing * style.size)}"` : '',
    ]
    pieces.push(`<text ${attributes.filter(Boolean).join(' ')}>${escape(marker.text)}</text>`)
  }
  for (const line of layout.lines) {
    measure.wordSpacing = `${line.wordSpacing}px`
    let x = line.x
    for (const run of line.runs) {
      measure.direction = run.rtl ? 'rtl' : 'ltr'
      const looks = styledPieces(layer.spans, style, run.start, run.end)
      for (const look of run.rtl ? looks.reverse() : looks) {
        const piece = layer.text.slice(look.start, look.end)
        measure.font = cssFont(look.style)
        const width = measure.measureText(piece).width
        if (piece.trim()) {
          const color = look.style.color !== style.color ? look.style.color : fill
          // Right to left, the start of the piece is its right edge.
          const at = run.rtl ? x + width : x
          const attributes = [
            `x="${n(at)}"`,
            `y="${n(line.baseline)}"`,
            `fill="${color}"`,
            `font-family="${escape(fontStack(look.style.font))}"`,
            `font-size="${n(look.style.size)}"`,
            `font-weight="${look.style.weight}"`,
            look.style.italic ? 'font-style="italic"' : '',
            run.rtl ? 'direction="rtl" unicode-bidi="embed"' : '',
            style.letterSpacing ? `letter-spacing="${n(style.letterSpacing * style.size)}"` : '',
            line.wordSpacing ? `word-spacing="${n(line.wordSpacing)}"` : '',
          ]
          pieces.push(`<text ${attributes.filter(Boolean).join(' ')} xml:space="preserve">${escape(piece)}</text>`)
        }
        x += width
      }
    }
  }
  const flip = box.width < 0 || box.height < 0 ? ` scale(${box.width < 0 ? -1 : 1} ${box.height < 0 ? -1 : 1})` : ''
  return `<g transform="translate(${n(box.cx)} ${n(box.cy)}) rotate(${n((box.rotation * 180) / Math.PI)})${flip} translate(${n(-w / 2 + shift)} ${n(-h / 2)})">${pieces.join('')}</g>`
}

// A picture of a layer as it looks with its effects and adjustments.
function pictureOfLayer(doc: EditorDocument, layer: Layer): string {
  const reach = layer.effects ? effectsReach(layer.effects) : 0
  const bounds = layerBounds(layer)
  const area = { x: Math.max(0, bounds.x - reach), y: Math.max(0, bounds.y - reach), right: Math.min(doc.width, bounds.x + bounds.width + reach), bottom: Math.min(doc.height, bounds.y + bounds.height + reach) }
  const width = area.right - area.x
  const height = area.bottom - area.y
  if (width <= 0 || height <= 0) return ''
  const detail = Math.max(1, Math.min(PICTURE_DETAIL, 8000 / Math.max(width, height)))
  const canvas = createCanvas(Math.ceil(width * detail), Math.ceil(height * detail))
  const ctx = getContext2d(canvas)
  ctx.scale(detail, detail)
  ctx.translate(-area.x, -area.y)
  drawLayer(ctx, doc, layer, { blend: false })
  return `<image x="${n(area.x)}" y="${n(area.y)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="none" href="${pictureHref(canvas)}"/>`
}

function layerSvg(doc: EditorDocument, layer: Layer, ids: Ids, defs: string[]): string {
  // Softly hidden parts, and photos inside letters, come along as a picture too.
  const picture = layer.hide || (layer.kind === 'text' && layer.photo)
  if (picture || (layer.effects && Object.values(layer.effects).some(Boolean)) || (layer.adjust && !isNeutral(layer.adjust))) return pictureOfLayer(doc, layer)
  if (layer.kind === 'raster') return pixelLayerSvg(layer)
  if (layer.kind === 'shape') return shapeSvg(layer, ids, defs)
  if (layer.kind === 'table') return tableParts(layer).map((part) => layerSvg(doc, part, ids, defs)).join('')
  return textSvg(layer, ids, defs)
}

// Which of the given unicode ranges ("U+0020-007E,U+05D0") hold a letter.
function rangeHas(ranges: string | undefined, code: number): boolean {
  if (!ranges) return true
  return ranges.split(',').some((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-')
    const a = parseInt(from.replace(/\?/g, '0'), 16)
    const b = to ? parseInt(to, 16) : from.includes('?') ? parseInt(from.replace(/\?/g, 'F'), 16) : a
    return code >= a && code <= b
  })
}

function weightFits(weight: string, wanted: number): boolean {
  const [low, high] = weight.split(/\s+/).map(Number)
  return high ? wanted >= low && wanted <= high : low === wanted
}

function base64(bytes: ArrayBuffer): string {
  const all = new Uint8Array(bytes)
  let text = ''
  for (let i = 0; i < all.length; i += 0x8000) text += String.fromCharCode(...all.subarray(i, i + 0x8000))
  return btoa(text)
}

const FONT_MIME: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' }

// The font files the text needs, put inside the file, so it looks the same on any computer.
async function fontFaces(layers: TextLayer[]): Promise<string> {
  // For each font: the looks used with it and the letters written in it.
  const wanted = new Map<string, { looks: Set<string>; letters: Set<number> }>()
  for (const layer of layers) {
    // A list's numbers and letters are written in the text's main look.
    const markers = (textLayout(layer).markers ?? []).map((m) => m.text).join('')
    const looks = [...styledPieces(layer.spans, layer.style, 0, layer.text.length).map((look) => ({ style: look.style, text: layer.text.slice(look.start, look.end) })), { style: layer.style, text: markers }]
    for (const look of looks) {
      const letters = [...look.text].map((c) => c.codePointAt(0)!)
      for (const id of fontStackIds(look.style.font)) {
        const entry = wanted.get(id) ?? { looks: new Set(), letters: new Set() }
        entry.looks.add(`${look.style.weight}:${look.style.italic ? 'italic' : 'normal'}`)
        letters.forEach((c) => entry.letters.add(c))
        wanted.set(id, entry)
      }
    }
  }
  const faces: Promise<string>[] = []
  for (const [id, { looks, letters }] of wanted) {
    for (const file of fontInfo(id)?.files ?? []) {
      const used = [...looks].some((look) => {
        const [weight, style] = look.split(':')
        return style === file.style && weightFits(file.weight, Number(weight))
      })
      if (!used || ![...letters].some((c) => rangeHas(file.unicodeRange, c))) continue
      faces.push(
        fetch(new URL(file.url, document.baseURI))
          .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
          .then(
            (bytes) =>
              `@font-face{font-family:"${familyName(id)}";src:url(data:${FONT_MIME[fontFormat(file.url)] ?? 'font/woff2'};base64,${base64(bytes)}) format("${fontFormat(file.url)}");font-weight:${file.weight};font-style:${file.style};${file.unicodeRange ? `unicode-range:${file.unicodeRange};` : ''}}`,
          )
          // A font that can't be fetched is left out; the text still shows in a stand-in.
          .catch(() => ''),
      )
    }
  }
  return (await Promise.all(faces)).join('')
}

export async function exportSvg(doc: EditorDocument): Promise<Blob> {
  const ids = new Ids()
  const defs: string[] = []
  const body: string[] = []
  if (doc.background) {
    if (doc.pageGradient) {
      const id = ids.next('page')
      defs.push(gradientDef(id, doc.pageGradient, doc.width, doc.height, doc.width / 2, doc.height / 2))
      body.push(`<rect width="${doc.width}" height="${doc.height}" fill="url(#${id})"/>`)
    } else {
      body.push(`<rect width="${doc.width}" height="${doc.height}" fill="${doc.background}"/>`)
    }
  }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    const content = layerSvg(doc, layer, ids, defs)
    if (!content) continue
    const opacity = layer.opacity < 1 ? ` opacity="${n(layer.opacity)}"` : ''
    const blend = layer.blend && layer.blend !== 'normal' ? ` style="mix-blend-mode:${layer.blend}"` : ''
    body.push(`<g data-name="${escape(layer.name)}"${opacity}${blend}>${content}</g>`)
  }
  const fonts = await fontFaces(doc.layers.flatMap((l) => (!l.visible ? [] : l.kind === 'text' ? [l] : l.kind === 'table' ? tableTexts(l) : [])))
  const style = fonts ? `<style>${fonts}</style>` : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">` +
    `<title>${escape(doc.name)}</title>${style || defs.length ? `<defs>${style}${defs.join('')}</defs>` : ''}${body.join('')}</svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}
