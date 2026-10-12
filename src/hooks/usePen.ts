import { useLayoutEffect, useRef, useState } from 'react'
import { activeLayer } from '../editor/layers.ts'
import { drawShape } from '../editor/objects.ts'
import {
  bendSegment,
  cornerNode,
  fitPathToBox,
  insertNode,
  nearestOnPath,
  pathInDesign,
  removeNode,
  setSmooth,
  tracePath,
  type ShapePath,
} from '../editor/path.ts'
import type { LayerOverride } from '../editor/render.ts'
import type { EditorDocument, Point, ShapeLayer, Viewport } from '../editor/types.ts'

// The Pen: click to place points joined by straight lines, or press and drag to pull out a smooth
// curve. Click the first point to close the shape, or press Enter to finish a line. Afterwards
// (or for any pen shape that's picked) its points show: drag a point to move it, drag a line to
// bend it, drag a round handle to change the curve, click a line to add a point, and double-click a
// point to switch between a sharp corner and a smooth curve.

// How close (in screen pixels) the pointer has to be to grab a point, a handle or a line.
const GRAB = 8
const BLUE = '#3366ff'

type Target =
  | { kind: 'node'; index: number }
  | { kind: 'in' | 'out'; index: number }
  | { kind: 'segment'; segment: number; t: number }
  | null

interface Drag {
  start: Point
  moved: boolean
  // Drawing a new path: the point just placed (handles are pulled out of it), or closing it.
  draw?: 'add' | 'close'
  // Changing a picked pen shape.
  edit?: { layer: ShapeLayer; path: ShapePath; target: Exclude<Target, null> }
}

export interface PenInput {
  shiftKey: boolean
  altKey: boolean
  // Screen pixels the pointer must move before a press counts as a drag.
  slop: number
}

export interface PenControls {
  // Called by the canvas with design points.
  down: (point: Point, input: PenInput, zoom: number) => void
  move: (point: Point, input: PenInput, zoom: number) => void
  up: (cancelled: boolean) => void
  hover: (point: Point | null, zoom: number) => string
  doubleClick: (point: Point, zoom: number) => void
  draw: (ctx: CanvasRenderingContext2D, viewport: Viewport) => void
  // The picked shape as it looks while its points are being dragged.
  override: () => LayerOverride | null
  // For the tool bar and the keyboard.
  drawing: boolean
  pointCount: number
  selectedPoint: { smooth: boolean } | null
  canClose: boolean
  finish: () => boolean
  close: () => void
  removeLast: () => boolean
  deletePoint: () => boolean
  toggleSmooth: () => void
  // Bumps whenever what the Pen shows changes.
  version: number
}

interface PenOptions {
  doc: EditorDocument | null
  getDoc: () => EditorDocument | null
  // A new shape for a finished path (in design coordinates), dressed in the current colors.
  onCreate: (path: ShapePath) => void
  // Keeps a change to a pen shape as one undo step.
  onChange: (layerId: string, patch: Pick<ShapeLayer, 'box' | 'geometry'>, label: string) => void
  // Draws a path (in design coordinates) the way it will look when finished.
  preview: (path: ShapePath) => ShapeLayer
}

// The picked shape, if it's a pen shape that can be changed.
export function penShape(doc: EditorDocument | null): ShapeLayer | null {
  const layer = doc ? activeLayer(doc) : undefined
  if (layer?.kind !== 'shape' || layer.geometry.type !== 'path' || !layer.geometry.path) return null
  if (!layer.visible || layer.locked) return null
  return layer
}

// A pen shape with a changed path (in design coordinates), keeping its turn and flips.
export function reshape(layer: ShapeLayer, designPath: ShapePath): Pick<ShapeLayer, 'box' | 'geometry'> {
  const { box, path } = fitPathToBox(designPath, layer.box.rotation, layer.box.width < 0, layer.box.height < 0)
  return { box, geometry: { ...layer.geometry, type: 'path', path } }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Holding Shift keeps lines at 45° steps.
function constrain(from: Point, to: Point): Point {
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) * (Math.PI / 4)
  const length = distance(from, to)
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}

function mirror(anchor: Point, handle: Point): Point {
  return { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y }
}

function hasHandle(anchor: Point, handle: Point): boolean {
  return distance(anchor, handle) > 1e-6
}

// The handles shown around the picked point: its own, and those of the curves on either side.
function visibleHandles(path: ShapePath, selected: number | null): { kind: 'in' | 'out'; index: number }[] {
  if (selected === null || selected >= path.nodes.length) return []
  const n = path.nodes.length
  const found: { kind: 'in' | 'out'; index: number }[] = [
    { kind: 'in', index: selected },
    { kind: 'out', index: selected },
  ]
  if (selected > 0 || path.closed) found.push({ kind: 'out', index: (selected - 1 + n) % n })
  if (selected < n - 1 || path.closed) found.push({ kind: 'in', index: (selected + 1) % n })
  return found.filter((h) => hasHandle(path.nodes[h.index], path.nodes[h.index][h.kind]))
}

export function usePen(options: PenOptions): PenControls {
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  })
  // What the tool bar shows, copied from the refs below whenever it changes.
  const [shown, setShown] = useState<{ version: number; points: number; selected: { layerId: string; index: number } | null }>({ version: 0, points: 0, selected: null })
  const bump = () =>
    setShown((v) => ({ version: v.version + 1, points: draftRef.current?.nodes.length ?? 0, selected: draftRef.current ? null : selectedRef.current }))
  // A path being drawn, in design coordinates.
  const draftRef = useRef<ShapePath | null>(null)
  // The picked point of the picked pen shape.
  const selectedRef = useRef<{ layerId: string; index: number } | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const hoverRef = useRef<Point | null>(null)
  // The picked shape while it's being changed, before the change is kept.
  const previewRef = useRef<ShapeLayer | null>(null)

  const editing = () => (draftRef.current ? null : penShape(optionsRef.current.getDoc()))
  const selectedIn = (layer: ShapeLayer | null) => (layer && selectedRef.current?.layerId === layer.id ? selectedRef.current.index : null)

  function targetAt(layer: ShapeLayer, path: ShapePath, point: Point, zoom: number): Target {
    const reach = GRAB / zoom
    let best: Target = null
    let bestDistance = reach
    path.nodes.forEach((n, index) => {
      const d = distance(n, point)
      if (d <= bestDistance) {
        best = { kind: 'node', index }
        bestDistance = d
      }
    })
    if (best) return best
    for (const h of visibleHandles(path, selectedIn(layer))) {
      const d = distance(path.nodes[h.index][h.kind], point)
      if (d <= bestDistance) {
        best = h
        bestDistance = d
      }
    }
    if (best) return best
    const near = nearestOnPath(path, point)
    if (near && near.distance <= reach) return { kind: 'segment', segment: near.segment, t: near.t }
    return null
  }

  function commitDraft(closed: boolean) {
    const draft = draftRef.current
    draftRef.current = null
    dragRef.current = null
    if (!draft || draft.nodes.length < 2) {
      bump()
      return
    }
    optionsRef.current.onCreate({ ...draft, closed: closed && draft.nodes.length > 2 })
    selectedRef.current = null
    bump()
  }

  function finish(): boolean {
    if (!draftRef.current) return false
    commitDraft(false)
    return true
  }

  function keepEdit(layer: ShapeLayer, path: ShapePath, label: string) {
    previewRef.current = null
    optionsRef.current.onChange(layer.id, reshape(layer, path), label)
  }

  function startDraft(point: Point) {
    draftRef.current = { nodes: [cornerNode(point)], closed: false }
    selectedRef.current = null
    dragRef.current = { start: point, moved: false, draw: 'add' }
  }

  const controls: PenControls = {
    down(point, input, zoom) {
      const draft = draftRef.current
      if (draft) {
        const first = draft.nodes[0]
        const last = draft.nodes[draft.nodes.length - 1]
        if (draft.nodes.length > 2 && distance(first, point) <= GRAB / zoom) {
          dragRef.current = { start: first, moved: false, draw: 'close' }
        } else if (draft.nodes.length > 1 && distance(last, point) <= GRAB / zoom) {
          // Clicking the last point again finishes the line.
          commitDraft(false)
          return
        } else {
          const at = input.shiftKey ? constrain(last, point) : point
          draft.nodes.push(cornerNode(at))
          dragRef.current = { start: at, moved: false, draw: 'add' }
        }
        bump()
        return
      }
      const layer = editing()
      if (layer) {
        const path = pathInDesign(layer.geometry.path!, layer.box)
        const target = targetAt(layer, path, point, zoom)
        if (target) {
          if (target.kind === 'node') selectedRef.current = { layerId: layer.id, index: target.index }
          dragRef.current = { start: point, moved: false, edit: { layer, path, target } }
          bump()
          return
        }
      }
      startDraft(point)
      bump()
    },

    move(point, input, zoom) {
      hoverRef.current = point
      const drag = dragRef.current
      if (!drag) return
      if (!drag.moved && distance(point, drag.start) * zoom >= input.slop) drag.moved = true
      if (!drag.moved) return
      const draft = draftRef.current
      if (drag.draw && draft) {
        // Pulling out handles: the curve leaves the point toward the pointer, and arrives from the
        // other side, so it flows smoothly through.
        const node = drag.draw === 'close' ? draft.nodes[0] : draft.nodes[draft.nodes.length - 1]
        const out = input.shiftKey ? constrain(node, point) : point
        node.out = out
        node.in = mirror(node, out)
        node.smooth = true
        return
      }
      const edit = drag.edit
      if (!edit) return
      const { path, target } = edit
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      let next: ShapePath = path
      if (target.kind === 'node') {
        const node = path.nodes[target.index]
        const to = input.shiftKey ? constrain(node, { x: node.x + dx, y: node.y + dy }) : { x: node.x + dx, y: node.y + dy }
        const mx = to.x - node.x
        const my = to.y - node.y
        next = {
          ...path,
          nodes: path.nodes.map((n, i) =>
            i === target.index ? { ...n, x: n.x + mx, y: n.y + my, in: { x: n.in.x + mx, y: n.in.y + my }, out: { x: n.out.x + mx, y: n.out.y + my } } : n,
          ),
        }
      } else if (target.kind === 'in' || target.kind === 'out') {
        const node = path.nodes[target.index]
        const handle = input.shiftKey ? constrain(node, point) : point
        const other = target.kind === 'in' ? 'out' : 'in'
        // A smooth point turns its other handle to match, keeping that handle's length; Alt makes a corner.
        const smooth = node.smooth && !input.altKey
        let otherHandle = node[other]
        if (smooth) {
          const length = distance(node, node[other])
          const dirX = node.x - handle.x
          const dirY = node.y - handle.y
          const dirLength = Math.hypot(dirX, dirY) || 1
          otherHandle = length > 1e-6 ? { x: node.x + (dirX / dirLength) * length, y: node.y + (dirY / dirLength) * length } : node[other]
        }
        next = { ...path, nodes: path.nodes.map((n, i) => (i === target.index ? { ...n, [target.kind]: handle, [other]: otherHandle, smooth } : n)) }
      } else if (target.kind === 'segment') {
        next = bendSegment(path, target.segment, target.t, dx, dy)
      }
      previewRef.current = { ...edit.layer, ...reshape(edit.layer, next) }
    },

    up(cancelled) {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      if (cancelled) {
        previewRef.current = null
        bump()
        return
      }
      if (drag.draw === 'close') {
        commitDraft(true)
        return
      }
      const edit = drag.edit
      if (edit) {
        const { layer, path, target } = edit
        if (!drag.moved) {
          previewRef.current = null
          // A click on a line adds a point there, without changing the shape.
          if (target.kind === 'segment') {
            optionsRef.current.onChange(layer.id, reshape(layer, insertNode(path, target.segment, target.t)), 'Add point')
            selectedRef.current = { layerId: layer.id, index: target.segment + 1 }
          }
          bump()
          return
        }
        const preview = previewRef.current
        if (preview?.geometry.path) {
          const label = target.kind === 'node' ? 'Move point' : target.kind === 'segment' ? 'Bend curve' : 'Change curve'
          keepEdit(layer, pathInDesign(preview.geometry.path, preview.box), label)
        }
        previewRef.current = null
      }
      bump()
    },

    hover(point, zoom) {
      hoverRef.current = point
      if (dragRef.current || !point) return 'crosshair'
      const draft = draftRef.current
      if (draft) {
        if (draft.nodes.length > 2 && distance(draft.nodes[0], point) <= GRAB / zoom) return 'pointer'
        return 'crosshair'
      }
      const layer = editing()
      if (!layer) return 'crosshair'
      const target = targetAt(layer, pathInDesign(layer.geometry.path!, layer.box), point, zoom)
      if (!target) return 'crosshair'
      return target.kind === 'segment' ? 'copy' : 'move'
    },

    doubleClick(point, zoom) {
      const layer = editing()
      if (!layer) return
      const path = pathInDesign(layer.geometry.path!, layer.box)
      const target = targetAt(layer, path, point, zoom)
      if (target?.kind !== 'node') return
      const node = path.nodes[target.index]
      selectedRef.current = { layerId: layer.id, index: target.index }
      keepEdit(layer, setSmooth(path, target.index, !node.smooth), node.smooth ? 'Sharp corner' : 'Smooth curve')
      bump()
    },

    draw(ctx, viewport) {
      const { zoom, panX, panY } = viewport
      const screen = (p: Point) => ({ x: p.x * zoom + panX, y: p.y * zoom + panY })
      const draft = draftRef.current
      const preview = previewRef.current
      const layer = draft ? null : (preview ?? editing())
      const path = draft ?? (layer ? pathInDesign(layer.geometry.path!, layer.box) : null)
      if (!path || path.nodes.length === 0) return
      const selected = draft ? (dragRef.current ? draft.nodes.length - 1 : null) : selectedIn(layer)

      // A new path shows how it will look when finished.
      if (draft && draft.nodes.length > 1) {
        ctx.save()
        ctx.translate(panX, panY)
        ctx.scale(zoom, zoom)
        drawShape(ctx, optionsRef.current.preview(draft))
        ctx.restore()
      }

      const onScreen = { closed: path.closed, nodes: path.nodes.map((n) => ({ ...screen(n), in: screen(n.in), out: screen(n.out), smooth: n.smooth })) }
      ctx.save()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = BLUE
      ctx.beginPath()
      tracePath(ctx, onScreen)
      ctx.stroke()

      // While drawing, a line from the last point to the pointer shows where the next part goes.
      const hover = hoverRef.current
      if (draft && hover && !dragRef.current) {
        const last = onScreen.nodes[onScreen.nodes.length - 1]
        const to = screen(hover)
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        if (hasHandle(last, last.out)) ctx.quadraticCurveTo(last.out.x, last.out.y, to.x, to.y)
        else ctx.lineTo(to.x, to.y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Handles: thin lines to round knobs.
      const handles = draft
        ? (() => {
            const i = draft.nodes.length - 1
            return (['in', 'out'] as const).filter((kind) => hasHandle(draft.nodes[i], draft.nodes[i][kind])).map((kind) => ({ kind, index: i }))
          })()
        : visibleHandles(path, selected)
      for (const h of handles) {
        const node = onScreen.nodes[h.index]
        const knob = node[h.kind]
        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        ctx.lineTo(knob.x, knob.y)
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(knob.x, knob.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = BLUE
        ctx.fill()
      }

      // Points: squares for sharp corners, circles for smooth curves; the picked one is filled.
      onScreen.nodes.forEach((n, i) => {
        const picked = i === selected
        const first = draft && i === 0 && draft.nodes.length > 2
        const size = first ? 5.5 : 4.5
        ctx.beginPath()
        if (n.smooth) ctx.arc(n.x, n.y, size, 0, Math.PI * 2)
        else ctx.rect(n.x - size, n.y - size, size * 2, size * 2)
        ctx.fillStyle = picked ? BLUE : '#ffffff'
        ctx.fill()
        ctx.lineWidth = first ? 2 : 1.5
        ctx.strokeStyle = BLUE
        ctx.stroke()
      })
      ctx.restore()
    },

    override() {
      const preview = previewRef.current
      return preview ? { layerId: preview.id, layer: preview } : null
    },

    drawing: shown.points > 0,
    pointCount: shown.points,
    selectedPoint: (() => {
      const layer = penShape(options.doc)
      const index = layer && shown.selected?.layerId === layer.id ? shown.selected.index : null
      const node = layer && index !== null ? layer.geometry.path!.nodes[index] : null
      return node ? { smooth: node.smooth } : null
    })(),
    canClose: shown.points > 2,
    finish,
    close: () => {
      if (draftRef.current && draftRef.current.nodes.length > 2) commitDraft(true)
    },
    removeLast: () => {
      const draft = draftRef.current
      if (!draft) return false
      draft.nodes.pop()
      if (draft.nodes.length === 0) draftRef.current = null
      bump()
      return true
    },
    deletePoint: () => {
      const layer = editing()
      const index = selectedIn(layer)
      if (!layer || index === null) return false
      const path = pathInDesign(layer.geometry.path!, layer.box)
      if (path.nodes.length <= 2) return false
      keepEdit(layer, removeNode(path, index), 'Delete point')
      selectedRef.current = { layerId: layer.id, index: Math.min(index, path.nodes.length - 2) }
      bump()
      return true
    },
    toggleSmooth: () => {
      const layer = editing()
      const index = selectedIn(layer)
      if (!layer || index === null) return
      const path = pathInDesign(layer.geometry.path!, layer.box)
      const node = path.nodes[index]
      keepEdit(layer, setSmooth(path, index, !node.smooth), node.smooth ? 'Sharp corner' : 'Smooth curve')
      bump()
    },
    version: shown.version,
  }
  return controls
}
