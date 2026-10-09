import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { buildActions, type AppCommands } from './appActions.ts'
import { AdjustPanel } from './components/AdjustPanel.tsx'
import { CanvasView, type BoxEditing } from './components/CanvasView.tsx'
import { ColorPanel } from './components/ColorPanel.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Dialog } from './components/Dialog.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { RenameDialog } from './components/RenameDialog.tsx'
import { ResizeDialog } from './components/ResizeDialog.tsx'
import { Toast, type Notice } from './components/Toast.tsx'
import { ToolDock } from './components/ToolDock.tsx'
import { ToolOptions, type CropShape } from './components/ToolOptions.tsx'
import { TopBar } from './components/TopBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { DesignInfo, ToolHint, ZoomControls } from './components/WorkspaceOverlays.tsx'
import { adjustmentLabel, isNeutral, LOOKS, NO_ADJUSTMENTS, type Adjustments } from './editor/adjust.ts'
import { adjustArea, lookThumbnails, paintAdjusted, previewParts } from './editor/adjustSession.ts'
import { BRUSH_PRESETS, ERASER_PRESETS, stepBrushSize, type BrushSettings } from './editor/brushes.ts'
import { getClipboard, ownCopyCheck, setClipboard } from './editor/clipboard.ts'
import {
  createBlankDocument,
  createCanvas,
  createDocumentFromImage,
  createLayer,
  duplicateLayer,
  getContext2d,
  layerFromCanvas,
  MAX_DOCUMENT_SIDE,
} from './editor/document.ts'
import { cropDocument, documentBytes, flipDocument, resizeDocument, rotateDocument } from './editor/documentOps.ts'
import { intersectRect, type Rect } from './editor/geometry.ts'
import { EXPORT_FORMATS, nextNumberedName, uniqueName, type ExportFormat } from './editor/fileNames.ts'
import { downloadBlob, exportDocument, imageFileToCanvas, openDesignFile } from './editor/io.ts'
import { activeLayer, insertLayerAboveActive, moveLayer, nextLayerName, removeLayer, updateLayer } from './editor/layers.ts'
import { listDesigns, loadDesign, type SavedDesign } from './editor/library.ts'
import { startMove, type MoveSession } from './editor/move.ts'
import { clearSelected, contentBounds, copySelected, editArea, fillArea, fillSelected, isBlank, type Piece } from './editor/pixels.ts'
import { decodeProject } from './editor/project.ts'
import type { LayerOverride } from './editor/render.ts'
import { invertSelection, selectAll, selectionInfo, type Selection, type SelectionMode, type SelectionShape } from './editor/selection.ts'
import type { StrokeResult } from './editor/stroke.ts'
import { boxFromRect, describeChange, flipBox, isIdentity, normalizeAngle, rotateBox90, type TransformBox } from './editor/transform.ts'
import { commitTransform, startTransform, transformParts, type TransformSession } from './editor/transformSession.ts'
import type { EditorDocument, Layer, Point, ToolId, Viewport } from './editor/types.ts'
import { centeredViewport, fitViewport, nextZoomLevel, panBy, zoomAtPoint } from './editor/viewport.ts'
import { useAutosave } from './hooks/useAutosave.ts'
import { useEditor } from './hooks/useEditor.ts'
import { useElementSize } from './hooks/useElementSize.ts'
import { isTypingTarget, shortcut } from './keys.ts'
import type { SizePreset } from './presets.ts'
import { TOOLS } from './tools.ts'

type DialogId = 'new' | 'export' | 'search' | 'discard' | 'resize' | 'rename'

// Room left around a fitted design for the floating hint and zoom controls.
const FIT_PADDING = 64
const MAX_RECENT_COLORS = 9
const NOTICE_MS = 3500

// The same faint dots the canvas draws, so the empty workspace matches it.
const DOT_BACKGROUND = {
  backgroundImage: 'radial-gradient(rgba(27, 33, 48, 0.13) 0.85px, transparent 1.1px)',
  backgroundSize: '24px 24px',
}

const DEFAULT_BRUSH = BRUSH_PRESETS.find((p) => p.id === 'pen')!
const DEFAULT_ERASER = ERASER_PRESETS.find((p) => p.id === 'block')!

// Look pictures in the Adjust panel are drawn this big (in screen pixels, before the screen's sharpness).
const LOOK_PICTURE_SIZE = 66

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function canvasBytes(canvas: HTMLCanvasElement): number {
  return canvas.width * canvas.height * 4
}

function fullFrame(doc: EditorDocument): TransformBox {
  return boxFromRect({ x: 0, y: 0, width: doc.width, height: doc.height })
}

function cropRatio(shape: CropShape, doc: EditorDocument): number | null {
  if (shape === 'original') return doc.width / doc.height
  if (shape === 'square') return 1
  if (shape === 'portrait') return 4 / 5
  if (shape === 'wide') return 16 / 9
  return null
}

// The crop frame always stays upright, with a real size, and never larger than a design can be.
function tidyCropBox(box: TransformBox): TransformBox {
  const width = Math.min(MAX_DOCUMENT_SIDE, Math.max(1, Math.abs(box.width)))
  const height = Math.min(MAX_DOCUMENT_SIDE, Math.max(1, Math.abs(box.height)))
  return { cx: box.cx, cy: box.cy, width, height, rotation: 0 }
}

// Why a layer can't be adjusted right now, in plain words, or null if it can.
function adjustProblem(doc: EditorDocument, layer: Layer): string | null {
  if (!layer.visible) return `“${layer.name}” is hidden. Click its eye in the Layers panel to show it, then adjust it.`
  if (isBlank(layer.canvas)) return `There is nothing on “${layer.name}” to adjust yet. Pick another layer in the Layers panel, or paint something first.`
  if (!adjustArea(doc, layer, NO_ADJUSTMENTS)) return `The selected area doesn't cover anything on “${layer.name}”. Select another part, or press ${shortcut('mod', 'D')} to adjust the whole layer.`
  return null
}

function cropRect(box: TransformBox): Rect {
  const x = Math.round(box.cx - box.width / 2)
  const y = Math.round(box.cy - box.height / 2)
  return { x, y, width: Math.round(box.width), height: Math.round(box.height) }
}

interface TransformState {
  session: TransformSession
  box: TransformBox
}

// The crop frame belongs to one version of the design: once the layers or size change (after
// cropping, or by undo), it starts again around the whole design.
interface CropState {
  layers: EditorDocument['layers']
  width: number
  height: number
  box: TransformBox
  shape: CropShape
}

export default function App() {
  const editor = useEditor()
  const { doc } = editor
  const autosave = useAutosave(editor)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [tool, setToolState] = useState<ToolId>('brush')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [designCount, setDesignCount] = useState(0)
  const [newDesignName, setNewDesignName] = useState('My design 1')
  const [color, setColor] = useState('#1b1d23')
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [brush, setBrush] = useState<{ settings: BrushSettings; presetId: string | null }>({
    settings: DEFAULT_BRUSH.settings,
    presetId: DEFAULT_BRUSH.id,
  })
  const [eraser, setEraser] = useState<{ settings: BrushSettings; presetId: string | null }>({
    settings: DEFAULT_ERASER.settings,
    presetId: DEFAULT_ERASER.id,
  })
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('rectangle')
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('replace')
  const [transformEdit, setTransformEdit] = useState<TransformState | null>(null)
  const [keepProportions, setKeepProportions] = useState(true)
  const [cropEdit, setCropEdit] = useState<CropState | null>(null)
  const [fillTolerance, setFillTolerance] = useState(0.15)
  const [adjustments, setAdjustments] = useState<Adjustments>(NO_ADJUSTMENTS)
  // True while pressing and holding to see how the design looked before adjusting.
  const [comparing, setComparing] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const strokeActiveRef = useRef(false)
  const pendingDiscardRef = useRef<(() => void) | null>(null)
  // After picking a color, go back to the drawing tool you came from.
  const lastDrawToolRef = useRef<'brush' | 'eraser'>('brush')
  const workspace = useElementSize(workspaceRef)

  const problem = (message: string) => setNotice({ message, tone: 'problem' })
  const inform = (message: string) => setNotice({ message, tone: 'info' })
  // Commands read the design through this, so they see changes made earlier in the same click.
  const current = () => editor.getDoc()

  // Confirmations like "Copied" go away by themselves; problems stay until dismissed.
  useEffect(() => {
    if (notice?.tone !== 'info') return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // When the window changes size, keep whatever was in the middle of the view in the middle.
  const lastWorkspaceRef = useRef(workspace)
  useLayoutEffect(() => {
    const last = lastWorkspaceRef.current
    lastWorkspaceRef.current = workspace
    if (!last.width || !last.height) return
    const dx = (workspace.width - last.width) / 2
    const dy = (workspace.height - last.height) / 2
    if (dx || dy) setViewport((v) => panBy(v, dx, dy))
  }, [workspace])

  // Closing the tab asks first while changes are still being saved, or if they couldn't be saved
  // in the browser and haven't been downloaded either.
  const unsafeToLeave =
    autosave.status === 'unsaved' || autosave.status === 'saving' || (autosave.status === 'failed' && editor.isDirty)
  useEffect(() => {
    if (!unsafeToLeave) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers and Safari only ask when this is set too.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsafeToLeave])

  // While the Resize tool is on, handles are ready around the selected layer (or the selected part).
  // A new layer or selection, including one brought back by undo, starts fresh handles.
  const activeNow = doc ? activeLayer(doc) : undefined
  const transformOn = tool === 'transform'
  const session = useMemo(
    () => (transformOn && doc ? startTransform(doc) : null),
    // Only the layer and the selection matter; other changes to the design keep the same handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transformOn, activeNow, doc?.selection],
  )
  const transform: TransformState | null = session && {
    session,
    box: transformEdit?.session === session ? transformEdit.box : session.original,
  }
  const setTransformBox = (box: TransformBox) => session && setTransformEdit({ session, box })

  // While the Crop tool is on, a frame is ready, starting around the whole design.
  const crop: CropState | null =
    tool === 'crop' && doc
      ? cropEdit && cropEdit.layers === doc.layers && cropEdit.width === doc.width && cropEdit.height === doc.height
        ? cropEdit
        : { layers: doc.layers, width: doc.width, height: doc.height, box: fullFrame(doc), shape: 'free' }
      : null
  const setCrop = (box: TransformBox, shape: CropShape) =>
    doc && setCropEdit({ layers: doc.layers, width: doc.width, height: doc.height, box, shape })

  const transformChanged = !!transform && !isIdentity(transform.box, transform.session.original)
  const cropChanged = !!crop && !!doc && !isIdentity(crop.box, fullFrame(doc))

  // While the Adjust tool is on, the selected layer (or its selected part) shows the adjustments
  // live. Why it can't be adjusted, if that's the case.
  const adjustOn = tool === 'adjust'
  const adjustBlocked = useMemo(
    () => (adjustOn && doc && activeNow ? adjustProblem(doc, activeNow) : null),
    // Only the layer, its pixels and the selection matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustOn, activeNow, doc?.selection, editor.revision],
  )
  const adjustLayer = adjustOn && !adjustBlocked ? activeNow : undefined
  const adjustChanged = !!adjustLayer && !isNeutral(adjustments)
  const screenScale = viewport.zoom * (window.devicePixelRatio || 1)
  // The preview may lag a moment behind a slider being dragged, so the slider itself never stutters.
  const previewSettings = useDeferredValue(adjustments)
  const adjustParts = useMemo(
    // Right after Apply or Cancel the preview stops at once, never showing old settings on new pixels.
    () => (adjustChanged && adjustLayer && doc && !isNeutral(previewSettings) ? previewParts(doc, adjustLayer, previewSettings, screenScale) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustChanged, adjustLayer, doc?.selection, doc?.width, doc?.height, previewSettings, screenScale, editor.revision],
  )
  const lookPictures = useMemo(
    () =>
      doc && adjustLayer
        ? lookThumbnails(doc, adjustLayer, LOOKS.map((look) => look.settings), LOOK_PICTURE_SIZE * (window.devicePixelRatio || 1))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustLayer, doc?.selection, editor.revision],
  )

  // Keeps the adjustments for good, at full detail.
  function applyAdjust() {
    const d = current()
    const layer = d && activeLayer(d)
    const settings = adjustments
    setAdjustments(NO_ADJUSTMENTS)
    setComparing(false)
    if (!adjustChanged || !d || !layer) return
    const area = adjustArea(d, layer, settings)
    if (area) editor.paint(adjustmentLabel(settings), layer.id, area, (ctx, l) => paintAdjusted(ctx, l, d, settings, area))
  }

  function cancelAdjust() {
    setAdjustments(NO_ADJUSTMENTS)
    setComparing(false)
  }

  // Keeps the new size and angle. Returns false if it couldn't (the result would be too big).
  function applyTransform(): boolean {
    if (!transform || !transformChanged) return true
    const { session, box } = transform
    let tooBig = false
    editor.change(
      describeChange(box, session.original),
      (d) => {
        const next = commitTransform(d, session, box)
        if (!next) tooBig = true
        return next ?? d
      },
      { bytes: canvasBytes(session.layer.canvas) + canvasBytes(session.source) },
    )
    if (tooBig) {
      problem('That would be too big to draw. Try making it a little smaller.')
      return false
    }
    setTransformEdit(null)
    return true
  }

  function cancelTransform() {
    setTransformEdit(null)
  }

  function applyCrop() {
    const d = current()
    if (!crop || !d || isIdentity(crop.box, fullFrame(d))) return
    const rect = cropRect(crop.box)
    editor.change('Crop', (doc) => cropDocument(doc, rect))
    // Keep the part you kept exactly where it was on screen.
    setViewport((v) => ({ ...v, panX: v.panX + rect.x * v.zoom, panY: v.panY + rect.y * v.zoom }))
    setCropEdit(null)
  }

  // Unfinished resizing or cropping is applied before doing anything else, so nothing gets mixed up.
  // Returns false if a resize couldn't be applied (it would be too big), which has been explained.
  function settle(): boolean {
    if (transformChanged && !applyTransform()) return false
    if (cropChanged) applyCrop()
    if (adjustChanged) applyAdjust()
    return true
  }

  function setTool(next: ToolId) {
    if (next !== tool) {
      if (tool === 'transform') {
        if (!applyTransform()) return
        setTransformEdit(null)
      }
      if (tool === 'crop') {
        applyCrop()
        setCropEdit(null)
      }
      if (tool === 'adjust') applyAdjust()
      // Adjusting an empty layer does nothing, so start on the top layer that has something on it.
      if (next === 'adjust') {
        const d = current()
        const layer = d && activeLayer(d)
        if (d && layer && isBlank(layer.canvas)) {
          const filled = [...d.layers].reverse().find((l) => l.visible && !isBlank(l.canvas))
          if (filled) editor.select(filled.id)
        }
      }
    }
    if (next === 'brush' || next === 'eraser') lastDrawToolRef.current = next
    setToolState(next)
  }

  function fitted(next: { width: number; height: number }, allowUpscale = true): Viewport {
    return fitViewport(next.width, next.height, workspace.width, workspace.height, { allowUpscale, padding: FIT_PADDING })
  }

  // `stored` means the design is already kept in this browser (it was opened from Your designs).
  function showDocument(next: EditorDocument, stored = false) {
    editor.load(next)
    autosave.start(next, stored)
    setTransformEdit(null)
    setCropEdit(null)
    setCursor(null)
    setNotice(null)
    setViewport(fitted(next, false))
  }

  // Before leaving the open design, its latest changes are saved in the browser. If that doesn't
  // work and they haven't been downloaded either, it asks first.
  async function leaveDesign(action: () => void) {
    // Stay put rather than lose a resize that couldn't be applied.
    if (!settle()) return
    if ((await autosave.flush()) || !editor.isDirty) {
      action()
    } else {
      pendingDiscardRef.current = action
      setDialog('discard')
    }
  }

  // A picture becomes a new design; a project file comes back with all its layers.
  async function openFile(file: File) {
    try {
      const next = await openDesignFile(file)
      await leaveDesign(() => showDocument(next))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  async function openSaved(design: SavedDesign) {
    try {
      const file = await loadDesign(design.id)
      if (!file) throw new Error(`“${design.name}” isn't in this browser anymore. It may have been deleted in another tab.`)
      const next = await decodeProject(file, design.id)
      await leaveDesign(() => showDocument(next, true))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function createDocument({ name, width, height, background }: NewDocumentOptions) {
    try {
      const next = createBlankDocument(name, width, height, background)
      setDialog(null)
      void leaveDesign(() => showDocument(next))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  // Names already used by designs kept in this browser, so a new one never looks like an old one.
  function savedNames(): Promise<string[]> {
    return listDesigns().then(
      (list) => list.map((d) => d.name),
      () => [],
    )
  }

  // `taken` are the names of the designs on the start screen.
  function createFromPreset(preset: SizePreset, taken: string[]) {
    createDocument({ name: uniqueName(preset.name, taken), width: preset.width, height: preset.height, background: 'white' })
  }

  async function download({ format, quality, fileName }: ExportOptions) {
    const d = current()
    if (!d) return
    try {
      downloadBlob(await exportDocument(d, format, quality / 100), fileName)
      editor.markSaved()
      setDialog(null)
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function rememberColor(used: string) {
    setRecentColors((recent) => [used, ...recent.filter((c) => c !== used)].slice(0, MAX_RECENT_COLORS))
  }

  function handleStroke(layerId: string, result: StrokeResult, label: string, grown?: Layer) {
    editor.commitStroke(label, layerId, result, grown)
    if (tool === 'brush') rememberColor(color)
  }

  function handlePickColor(hex: string) {
    setColor(hex)
    if (tool === 'picker') setToolState(lastDrawToolRef.current)
  }

  function handleMove(session: MoveSession, dx: number, dy: number) {
    const layer = current()?.layers.find((l) => l.id === session.layerId)
    editor.change(session.label, (d) => session.commit(d, dx, dy), { bytes: session.movesSelection && layer ? canvasBytes(layer.canvas) : 0 })
  }

  function handleSelect(selection: Selection | null, label: string) {
    editor.change(label, (d) => ({ ...d, selection }))
  }

  function handleFill(point: Point) {
    const d = current()
    const layer = d && activeLayer(d)
    if (!d || !layer) return
    const pieces = fillArea(d, point, color, Math.round(fillTolerance * 255))
    if (!pieces) return
    const { core, rim } = pieces
    const area = { x: core.x, y: core.y, width: core.canvas.width, height: core.canvas.height }
    editor.paint('Fill area', layer.id, area, (ctx, l) => {
      ctx.drawImage(core.canvas, core.x - l.x, core.y - l.y)
      // The rim slips underneath what's already there, so outlines keep their soft edges.
      ctx.globalCompositeOperation = 'destination-over'
      ctx.drawImage(rim.canvas, rim.x - l.x, rim.y - l.y)
    })
    rememberColor(color)
  }

  function changeBrushSize(direction: 1 | -1) {
    const update = (state: { settings: BrushSettings; presetId: string | null }) => ({
      ...state,
      settings: { ...state.settings, size: stepBrushSize(state.settings.size, direction) },
    })
    if (tool === 'eraser') setEraser(update)
    else setBrush(update)
  }

  function zoomBy(direction: 1 | -1) {
    setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), workspace.width / 2, workspace.height / 2))
  }

  // The selected layer, if it can be changed; otherwise says why not.
  function usableLayer(doing: string): Layer | null {
    const d = current()
    const layer = d && activeLayer(d)
    if (!layer) return null
    if (!layer.visible) {
      problem(`"${layer.name}" is hidden. Click its eye in the Layers panel to show it, then ${doing} again.`)
      return null
    }
    return layer
  }

  // Selections that end up empty (say, everything was taken away) count as no selection.
  function setSelection(label: string, next: (d: EditorDocument) => Selection | null) {
    editor.change(label, (d) => {
      const selection = next(d)
      return { ...d, selection: selection && selectionInfo(selection, d.width, d.height).bounds ? selection : null }
    })
  }

  // The selected part of the selected layer, or a message saying there's nothing there.
  function selectedPiece(): Piece | null {
    const d = current()
    const layer = d && activeLayer(d)
    if (!d || !layer) return null
    const piece = copySelected(layer, d)
    if (!piece || isBlank(piece.canvas)) {
      problem(d.selection ? `There is nothing in the selected area on "${layer.name}".` : `"${layer.name}" is empty, so there is nothing to copy.`)
      return null
    }
    return piece
  }

  // Puts a picture on a new layer: where it was copied from, or in the middle if that's off the design.
  function pastePiece(piece: Piece | { canvas: HTMLCanvasElement; x?: number; y?: number }) {
    const { canvas } = piece
    const d = current()
    if (!d) {
      // With no design open, the pasted picture becomes a new design.
      showDocument(createDocumentFromImage('Pasted picture', canvas, canvas.width, canvas.height))
      return
    }
    const onDesign =
      piece.x !== undefined &&
      piece.y !== undefined &&
      intersectRect({ x: piece.x, y: piece.y, width: canvas.width, height: canvas.height }, { x: 0, y: 0, width: d.width, height: d.height })
    const x = onDesign ? piece.x! : Math.round((d.width - canvas.width) / 2)
    const y = onDesign ? piece.y! : Math.round((d.height - canvas.height) / 2)
    // A copy, so changing the pasted layer never changes what's on the clipboard.
    const copy = createCanvas(canvas.width, canvas.height)
    getContext2d(copy).drawImage(canvas, 0, 0)
    editor.change('Paste', (doc) => ({ ...insertLayerAboveActive(doc, layerFromCanvas('Pasted', copy, x, y)), selection: null }), {
      bytes: canvasBytes(copy),
    })
    setTool('move')
    inform('Pasted on a new layer. Drag it to put it where you want.')
  }

  async function pasteFile(file: File) {
    const ownCopy = ownCopyCheck()
    try {
      const canvas = await imageFileToCanvas(file)
      settle()
      // Pixel Studio's own copy remembers where it came from, so it goes back in place.
      pastePiece(ownCopy(canvas.width, canvas.height) ?? { canvas })
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function moveBy(dx: number, dy: number, mergeKey?: string) {
    const layer = usableLayer('move it')
    const d = current()
    if (!layer || !d) return
    editor.change(d.selection ? 'Move selected area' : 'Move layer', (doc) => startMove(doc)?.commit(doc, dx, dy) ?? doc, {
      mergeKey,
      bytes: d.selection ? canvasBytes(layer.canvas) : 0,
    })
  }

  // Whole-design changes: the view refits so the whole result is in sight.
  function changeWholeDesign(label: string, update: (d: EditorDocument) => EditorDocument) {
    settle()
    const d = current()
    if (!d) return
    editor.change(label, update, { bytes: documentBytes(d) })
    const next = current()
    if (next) setViewport(fitted(next, false))
  }

  const layers = {
    select: (layerId: string) => {
      settle()
      editor.select(layerId)
    },
    add: () => {
      settle()
      editor.change('New layer', (d) => insertLayerAboveActive(d, createLayer(nextLayerName(d.layers), d.width, d.height)))
    },
    duplicate: () => {
      settle()
      editor.change(
        'Duplicate layer',
        (d) => {
          const layer = activeLayer(d)
          return layer ? insertLayerAboveActive(d, duplicateLayer(layer)) : d
        },
        { bytes: activeNow ? canvasBytes(activeNow.canvas) : 0 },
      )
    },
    remove: () => {
      settle()
      editor.change('Delete layer', (d) => removeLayer(d, d.activeLayerId), { bytes: activeNow ? canvasBytes(activeNow.canvas) : 0 })
    },
    move: (direction: 1 | -1) => {
      settle()
      editor.change(direction > 0 ? 'Move layer up' : 'Move layer down', (d) => moveLayer(d, d.activeLayerId, direction))
    },
    rename: (layerId: string, name: string) => editor.change('Rename layer', (d) => updateLayer(d, layerId, { name })),
    opacity: (layerId: string, opacity: number) =>
      editor.change('Change layer opacity', (d) => updateLayer(d, layerId, { opacity }), { mergeKey: `opacity:${layerId}` }),
    toggleVisibility: (layerId: string) => {
      settle()
      const layer = current()?.layers.find((l) => l.id === layerId)
      if (layer) editor.change(layer.visible ? 'Hide layer' : 'Show layer', (d) => updateLayer(d, layerId, { visible: !layer.visible }))
    },
  }

  const pasteHint = `Press ${shortcut('mod', 'V')} to paste it as a new layer.`

  type ExtraCommands = {
    nudge: (dx: number, dy: number) => void
    pasteFile: (file: File) => void
    hasSelection: () => boolean
    // Enter and Esc while resizing or cropping.
    applyPending: () => boolean
    cancelPending: () => boolean
  }

  const commands: AppCommands & ExtraCommands = {
    newDesign: () => {
      settle()
      // The dialog opens right away; its suggested name is corrected once the kept designs are read.
      setNewDesignName(nextNumberedName('My design', [], designCount))
      setDialog('new')
      void savedNames().then((names) => setNewDesignName(nextNumberedName('My design', names, designCount)))
    },
    open: () => fileInputRef.current?.click(),
    download: () => {
      settle()
      if (!current()) return
      setExportFormat('png')
      setDialog('export')
    },
    downloadProject: () => {
      settle()
      if (!current()) return
      setExportFormat('project')
      setDialog('export')
    },
    renameDesign: () => {
      if (current()) setDialog('rename')
    },
    close: () =>
      void leaveDesign(() => {
        editor.close()
        autosave.stop()
      }),
    // Undo waits until a stroke is finished, so it never pulls pixels out from under the brush.
    // While resizing or cropping, it first takes back the unapplied change.
    undo: () => {
      if (strokeActiveRef.current) return
      if (transformChanged) return cancelTransform()
      if (cropChanged) return setCropEdit(null)
      if (adjustChanged) return cancelAdjust()
      editor.undo()
    },
    redo: () => {
      if (strokeActiveRef.current || transformChanged || cropChanged || adjustChanged) return
      editor.redo()
    },
    copy: () => {
      settle()
      const piece = selectedPiece()
      if (!piece) return
      setClipboard(piece)
      inform(`Copied. ${pasteHint}`)
    },
    cut: () => {
      settle()
      const d = current()
      if (!d?.selection) {
        problem('Select an area first, with the Select tool.')
        return
      }
      const layer = usableLayer('cut')
      const area = editArea(d)
      const piece = layer && selectedPiece()
      if (!layer || !piece || !area) return
      setClipboard(piece)
      editor.paint('Cut', layer.id, area, (ctx, l) => clearSelected(ctx, l, d))
      inform(`Cut. ${pasteHint}`)
    },
    paste: () => {
      settle()
      const piece = getClipboard()
      if (piece) pastePiece(piece)
      else problem(`Nothing to paste yet. Copy part of your design first, or copy a picture in another program and press ${shortcut('mod', 'V')}.`)
    },
    pasteFile: (file) => void pasteFile(file),
    selectAll: () => {
      settle()
      if (current()) setSelection('Select all', (d) => selectAll(d.width, d.height))
    },
    deselect: () => {
      settle()
      if (current()?.selection) setSelection('Deselect', () => null)
    },
    invert: () => {
      settle()
      if (current()) setSelection('Invert selection', (d) => invertSelection(d.selection, d.width, d.height))
    },
    fill: () => {
      settle()
      const layer = usableLayer('fill')
      const d = current()
      const area = d && editArea(d)
      if (!d || !layer || !area) return
      editor.paint('Fill with color', layer.id, area, (ctx, l) => fillSelected(ctx, l, d, color))
      rememberColor(color)
    },
    deleteArea: () => {
      settle()
      const d = current()
      if (!d?.selection) {
        problem('Select an area first, with the Select tool. To remove a whole layer, use Delete layer.')
        return
      }
      const layer = usableLayer('delete')
      const area = editArea(d)
      if (layer && area) editor.paint('Delete selected area', layer.id, area, (ctx, l) => clearSelected(ctx, l, d))
    },
    toNewLayer: () => {
      settle()
      const d = current()
      const layer = d && activeLayer(d)
      const piece = selectedPiece()
      if (!layer || !piece) return
      editor.change(
        'Copy to new layer',
        (doc) => ({ ...insertLayerAboveActive(doc, layerFromCanvas(`${layer.name} copy`, piece.canvas, piece.x, piece.y)), selection: null }),
        { bytes: canvasBytes(piece.canvas) },
      )
    },
    center: () => {
      settle()
      const layer = usableLayer('center it')
      const d = current()
      if (!d || !layer) return
      const bounds = d.selection ? selectionInfo(d.selection, d.width, d.height).bounds : contentBounds(layer)
      if (!bounds) {
        problem(`"${layer.name}" is empty, so there is nothing to center.`)
        return
      }
      const dx = Math.round((d.width - bounds.width) / 2 - bounds.x)
      const dy = Math.round((d.height - bounds.height) / 2 - bounds.y)
      if (dx === 0 && dy === 0) inform('It is already in the middle.')
      else moveBy(dx, dy)
    },
    nudge: (dx, dy) => moveBy(dx, dy, 'nudge'),
    hasSelection: () => !!current()?.selection,
    applyPending: () => {
      if (tool === 'transform' && transformChanged) return applyTransform(), true
      if (tool === 'crop' && cropChanged) return applyCrop(), true
      if (adjustChanged) return applyAdjust(), true
      return false
    },
    cancelPending: () => {
      if (tool === 'transform' && transformChanged) return cancelTransform(), true
      if (tool === 'crop' && cropChanged) return setCropEdit(null), true
      if (adjustChanged) return cancelAdjust(), true
      return false
    },
    resizeDesign: () => {
      settle()
      if (current()) setDialog('resize')
    },
    cropToSelection: () => {
      const d = current()
      const bounds = d?.selection && selectionInfo(d.selection, d.width, d.height).bounds
      if (!bounds) {
        problem('Select an area first, with the Select tool.')
        return
      }
      settle()
      editor.change('Crop to selection', (doc) => cropDocument({ ...doc, selection: null }, bounds))
      setViewport((v) => ({ ...v, panX: v.panX + bounds.x * v.zoom, panY: v.panY + bounds.y * v.zoom }))
    },
    rotateDesign: (direction) => changeWholeDesign(direction > 0 ? 'Turn design right' : 'Turn design left', (d) => rotateDocument(d, direction)),
    flipDesign: (axis) =>
      changeWholeDesign(axis === 'horizontal' ? 'Flip design left to right' : 'Flip design upside down', (d) => flipDocument(d, axis)),
    layerAdd: layers.add,
    layerDuplicate: layers.duplicate,
    layerUp: () => layers.move(1),
    layerDown: () => layers.move(-1),
    layerToggle: () => activeNow && layers.toggleVisibility(activeNow.id),
    layerDelete: layers.remove,
    zoomIn: () => doc && zoomBy(1),
    zoomOut: () => doc && zoomBy(-1),
    fit: () => doc && setViewport(fitted(doc)),
    actualSize: () => doc && setViewport(centeredViewport(doc.width, doc.height, workspace.width, workspace.height, 1)),
    search: () => setDialog('search'),
    biggerBrush: () => changeBrushSize(1),
    smallerBrush: () => changeBrushSize(-1),
    setTool,
    showLook: (lookId) => {
      const look = LOOKS.find((l) => l.id === lookId)
      if (!current() || !look) return
      setTool('adjust')
      setAdjustments(look.settings)
    },
  }

  const actions = buildActions({ doc, undoLabel: editor.undoLabel, redoLabel: editor.redoLabel }, commands)

  // Keyboard and paste handlers live in effects, so they read the latest commands through refs.
  // A layout effect updates them together with the screen, so a key pressed right after a drag
  // acts on what is shown, not on the step before.
  const commandsRef = useRef(commands)
  const stateRef = useRef({ hasDoc: !!doc, dialogOpen: dialog !== null, tool })
  useLayoutEffect(() => {
    commandsRef.current = commands
    stateRef.current = { hasDoc: !!doc, dialogOpen: dialog !== null, tool }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { hasDoc, dialogOpen, tool: currentTool } = stateRef.current
      if (event.key === 'Alt') {
        setAltHeld(true)
        // Stops some browsers from jumping to their own menu bar when Alt is let go.
        if (hasDoc && !dialogOpen) event.preventDefault()
      }
      if (dialogOpen || isTypingTarget(event.target)) return
      const c = commandsRef.current
      const mod = event.ctrlKey || event.metaKey
      // event.code names the physical key, so shortcuts work with any keyboard language.
      const code = event.code
      const plain = !mod && !event.altKey

      // While a design is open, Space is the temporary Hand. Without one, Space presses buttons as usual.
      if (code === 'Space' && !mod && hasDoc) {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }
      // Enter and Esc finish or undo an unapplied resize or crop.
      if (plain && event.key === 'Enter' && c.applyPending()) return event.preventDefault()
      if (event.key === 'Escape' && c.cancelPending()) return event.preventDefault()

      let action: (() => unknown) | undefined
      if (mod && code === 'KeyK') action = c.search
      else if (plain && event.key === '/') action = c.search
      else if (mod && event.altKey && code === 'KeyN') action = c.newDesign
      else if (mod && !event.shiftKey && code === 'KeyO') action = c.open
      // Always stop the browser's own "save page" window; it would save this program, not the design.
      else if (mod && code === 'KeyS') action = c.download
      else if (mod && code === 'KeyZ' && event.shiftKey) action = c.redo
      else if (mod && code === 'KeyZ') action = c.undo
      else if (mod && code === 'KeyY') action = c.redo
      else if (mod && code === 'KeyA' && hasDoc) action = c.selectAll
      else if (mod && code === 'KeyD' && hasDoc) action = c.deselect
      else if (mod && !event.shiftKey && code === 'KeyC' && hasDoc) action = c.copy
      else if (mod && code === 'KeyX' && hasDoc) action = c.cut
      else if (mod && code === 'KeyJ' && hasDoc) action = c.toNewLayer
      else if (event.altKey && !mod && code === 'Backspace' && hasDoc) action = c.fill
      else if (plain && (code === 'Delete' || code === 'Backspace') && c.hasSelection()) action = c.deleteArea
      else if (code === 'Escape' && c.hasSelection()) action = c.deselect
      else if (!mod && !event.altKey && ARROWS[event.key] && hasDoc && currentTool === 'move') {
        const step = event.shiftKey ? 10 : 1
        const [dx, dy] = ARROWS[event.key]
        action = () => c.nudge(dx * step, dy * step)
      } else if (mod && (code === 'Equal' || code === 'NumpadAdd') && hasDoc) action = c.zoomIn
      else if (mod && (code === 'Minus' || code === 'NumpadSubtract') && hasDoc) action = c.zoomOut
      else if (mod && event.altKey && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.actualSize
      else if (mod && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.fit
      else if (plain && code === 'BracketRight') action = c.biggerBrush
      else if (plain && code === 'BracketLeft') action = c.smallerBrush
      else if (plain && !event.shiftKey) {
        const found = TOOLS.find((t) => `Key${t.key}` === code)
        if (found) action = () => c.setTool(found.id)
      }

      if (action) {
        event.preventDefault()
        action()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const { hasDoc, dialogOpen } = stateRef.current
      if (event.key === 'Alt') {
        setAltHeld(false)
        if (hasDoc && !dialogOpen) event.preventDefault()
      }
      if (event.code === 'Space') {
        setSpaceHeld(false)
        // Stop Space from also pressing whichever button has focus.
        if (hasDoc && !dialogOpen && !isTypingTarget(event.target)) event.preventDefault()
      }
    }
    // Ctrl+V arrives as a paste event, which also carries pictures copied in other programs.
    const onPaste = (event: ClipboardEvent) => {
      if (stateRef.current.dialogOpen || isTypingTarget(event.target)) return
      event.preventDefault()
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) commandsRef.current.pasteFile(file)
      else commandsRef.current.paste()
    }
    const reset = () => {
      setSpaceHeld(false)
      setAltHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('paste', onPaste)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('blur', reset)
    }
  }, [])

  function handleDragOver(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }

  function handleDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
  }

  function handleDrop(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDropActive(false)
    const file = event.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  function changeCropShape(shape: CropShape) {
    if (!doc || !crop) return
    const ratio = cropRatio(shape, doc)
    let box = crop.box
    if (ratio) {
      // The biggest frame of the new shape that fits inside the current one.
      const width = Math.min(Math.abs(box.width), Math.abs(box.height) * ratio)
      box = { ...box, width, height: width / ratio }
    }
    setCrop(box, shape)
  }

  const paintSettings = tool === 'eraser' ? eraser.settings : brush.settings
  const hintTool: ToolId = spaceHeld ? 'hand' : altHeld && tool === 'brush' ? 'picker' : tool
  const hintExtra = doc?.selection && (hintTool === 'brush' || hintTool === 'eraser' || hintTool === 'adjust') ? 'Only the selected area changes.' : undefined

  const box: BoxEditing | null =
    tool === 'transform' && transform
      ? {
          kind: 'transform',
          value: transform.box,
          keepProportions,
          edges: true,
          onChange: setTransformBox,
          onApply: applyTransform,
        }
      : tool === 'crop' && crop
        ? {
            kind: 'crop',
            value: crop.box,
            keepProportions: crop.shape !== 'free',
            edges: crop.shape === 'free',
            onChange: (next) => setCrop(tidyCropBox(next), crop.shape),
            onApply: applyCrop,
          }
        : null

  const override: LayerOverride | null =
    tool === 'transform' && transform && transformChanged
      ? { layerId: transform.session.layerId, parts: transformParts(transform.session, transform.box) }
      : adjustParts && adjustLayer && !comparing
        ? { layerId: adjustLayer.id, parts: adjustParts }
        : null

  return (
    <div className="flex h-full select-none flex-col" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <TopBar
        actions={actions}
        documentName={doc?.name ?? null}
        saveStatus={autosave.status}
        saveProblem={autosave.problem}
        onRename={commands.renameDesign}
        undoLabel={transformChanged ? 'Resize changes' : cropChanged ? 'Crop frame' : adjustChanged ? 'Adjustments' : editor.undoLabel}
        redoLabel={transformChanged || cropChanged || adjustChanged ? null : editor.redoLabel}
        onUndo={commands.undo}
        onRedo={commands.redo}
        onSearch={commands.search}
        onDownload={commands.download}
      />

      <ToolOptions
        tool={tool}
        brush={brush.settings}
        brushPresetId={brush.presetId}
        eraser={eraser.settings}
        eraserPresetId={eraser.presetId}
        color={color}
        onBrushChange={(settings, presetId) => setBrush({ settings, presetId })}
        onEraserChange={(settings, presetId) => setEraser({ settings, presetId })}
        selectionShape={selectionShape}
        selectionMode={selectionMode}
        onSelectionShapeChange={setSelectionShape}
        onSelectionModeChange={setSelectionMode}
        selection={{
          hasSelection: !!doc?.selection,
          selectAll: commands.selectAll,
          deselect: commands.deselect,
          invert: commands.invert,
          fill: commands.fill,
          remove: commands.deleteArea,
          toNewLayer: commands.toNewLayer,
          center: commands.center,
        }}
        transform={{
          active: !!transform,
          changed: transformChanged,
          width: transform?.box.width ?? 0,
          height: transform?.box.height ?? 0,
          angle: Math.round((normalizeAngle(transform?.box.rotation ?? 0) * 180) / Math.PI),
          keepProportions,
          onKeepProportions: setKeepProportions,
          flip: (axis) => transform && setTransformBox(flipBox(transform.box, axis)),
          rotate90: (direction) => transform && setTransformBox(rotateBox90(transform.box, direction)),
          apply: applyTransform,
          cancel: cancelTransform,
        }}
        crop={{
          width: crop ? cropRect(crop.box).width : 0,
          height: crop ? cropRect(crop.box).height : 0,
          shape: crop?.shape ?? 'free',
          onShape: changeCropShape,
          changed: cropChanged,
          apply: applyCrop,
          reset: () => setCropEdit(null),
        }}
        adjust={{
          target: doc && activeNow ? (doc.selection ? `the selected part of “${activeNow.name}”` : `“${activeNow.name}”`) : null,
          blocked: adjustBlocked,
          changed: adjustChanged,
          comparing,
          onCompare: setComparing,
          apply: applyAdjust,
          cancel: cancelAdjust,
        }}
        fillTolerance={fillTolerance}
        onFillToleranceChange={setFillTolerance}
      />

      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <ToolDock tool={tool} onToolChange={setTool} />

        <main
          ref={workspaceRef}
          className="relative min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-workspace shadow-card"
          style={DOT_BACKGROUND}
        >
          {doc ? (
            <>
              <CanvasView
                doc={doc}
                revision={editor.revision}
                viewport={viewport}
                onViewportChange={setViewport}
                onCursorChange={setCursor}
                width={workspace.width}
                height={workspace.height}
                tool={tool}
                spaceHeld={spaceHeld}
                altHeld={altHeld}
                brush={paintSettings}
                color={color}
                selectionShape={selectionShape}
                selectionMode={selectionMode}
                onStroke={handleStroke}
                onStrokeActiveChange={(activeStroke) => (strokeActiveRef.current = activeStroke)}
                onPickColor={handlePickColor}
                onMove={handleMove}
                onSelect={handleSelect}
                onBlocked={problem}
                override={override}
                box={box}
                onFill={handleFill}
                onCompareChange={(on) => setComparing(on && adjustChanged)}
              />
              <ToolHint tool={hintTool} extra={hintExtra} />
              <ZoomControls
                zoom={viewport.zoom}
                onZoomIn={commands.zoomIn}
                onZoomOut={commands.zoomOut}
                onActualSize={commands.actualSize}
                onFit={commands.fit}
              />
              <DesignInfo doc={doc} cursor={cursor} />
            </>
          ) : (
            <WelcomeScreen onPreset={createFromPreset} onCustom={commands.newDesign} onOpen={commands.open} onOpenDesign={openSaved} />
          )}
          {dropActive && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80">
              <p className="text-[15px] font-medium text-accent">Drop your picture or project to open it</p>
            </div>
          )}
        </main>

        <div className="hidden w-[272px] shrink-0 flex-col gap-2 overflow-y-auto md:flex">
          {adjustOn && doc ? (
            <AdjustPanel settings={adjustments} thumbnails={lookPictures} blocked={adjustBlocked} onChange={setAdjustments} />
          ) : (
            <ColorPanel color={color} recent={recentColors} onChange={setColor} onPickFromDesign={() => setTool('picker')} />
          )}
          <LayersPanel
            doc={doc}
            revision={editor.revision}
            onSelect={layers.select}
            onToggleVisibility={layers.toggleVisibility}
            onRename={layers.rename}
            onOpacity={layers.opacity}
            onAdd={layers.add}
            onDuplicate={layers.duplicate}
            onMove={layers.move}
            onDelete={layers.remove}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={`image/*,.${EXPORT_FORMATS.project.extension}`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void openFile(file)
        }}
      />

      {dialog === 'new' && (
        <NewDocumentDialog
          defaultName={newDesignName}
          onCreate={(options) => {
            setDesignCount((count) => count + 1)
            createDocument(options)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && doc && (
        <ExportDialog doc={doc} initialFormat={exportFormat} onExport={download} onClose={() => setDialog(null)} />
      )}
      {dialog === 'rename' && doc && (
        <RenameDialog
          name={doc.name}
          onClose={() => setDialog(null)}
          onRename={(name) => {
            setDialog(null)
            editor.rename(name)
          }}
        />
      )}
      {dialog === 'search' && <CommandPalette actions={actions} hasDocument={!!doc} onClose={() => setDialog(null)} />}
      {dialog === 'resize' && doc && (
        <ResizeDialog
          width={doc.width}
          height={doc.height}
          onClose={() => setDialog(null)}
          onResize={(width, height) => {
            setDialog(null)
            changeWholeDesign('Resize design', (d) => resizeDocument(d, width, height))
          }}
        />
      )}
      {dialog === 'discard' && (
        <Dialog
          title="Throw away your changes?"
          subtitle={`${autosave.problem ?? "Your latest changes couldn't be kept in this browser."} If you continue, they will be lost. To keep them, choose Keep editing and then Download.`}
          submitLabel="Throw away changes"
          cancelLabel="Keep editing"
          danger
          onSubmit={() => {
            const action = pendingDiscardRef.current
            pendingDiscardRef.current = null
            setDialog(null)
            action?.()
          }}
          onClose={() => {
            pendingDiscardRef.current = null
            setDialog(null)
          }}
        />
      )}

      {notice && <Toast notice={notice} onDismiss={() => setNotice(null)} />}
    </div>
  )
}
