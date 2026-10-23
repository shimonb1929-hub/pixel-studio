import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { buildActions, type AppCommands } from './appActions.ts'
import { AdjustPanel } from './components/AdjustPanel.tsx'
import { CanvasView, type ArrangeControls, type BoxEditing, type ShapeDrawing, type TextTool } from './components/CanvasView.tsx'
import { ColorPanel, type DesignColors } from './components/ColorPanel.tsx'
import { applyTextStyle, colorUses, designColors, findTextStyle, forgetColor, keepColor, lookPatch, matchesStyle, newStyleId, nextStyleName, recolorEverywhere, removeTextStyle, renameTextStyle, saveTextStyle, textStyles, updateTextStyle } from './editor/designStyles.ts'
import type { TextStylesProps } from './components/TextStyles.tsx'
import { LayoutsDialog } from './components/LayoutsDialog.tsx'
import { buildLayout, loadLayoutFonts, type LayoutInfo, type LayoutKind } from './layouts/layouts.ts'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Dialog } from './components/Dialog.tsx'
import { PagesBar } from './components/PagesBar.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { RenameDialog } from './components/RenameDialog.tsx'
import { ResizeDialog } from './components/ResizeDialog.tsx'
import { PageLayoutDialog } from './components/PageLayoutDialog.tsx'
import { defaultGap, hasLayout } from './editor/pageLayout.ts'
import { ShapePanel, type ColorTarget } from './components/ShapePanel.tsx'
import type { TextEditing } from './components/TextEditBox.tsx'
import { TextPanel } from './components/TextPanel.tsx'
import { Toast, type Notice } from './components/Toast.tsx'
import { ToolDock } from './components/ToolDock.tsx'
import { ToolOptions, type ArrangeBarControls, type CropShape } from './components/ToolOptions.tsx'
import { ScrollRegion } from './components/ui.tsx'
import { TopBar } from './components/TopBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { DesignInfo, StartHere, ToolHint, ZoomControls } from './components/WorkspaceOverlays.tsx'
import { PagePanel } from './components/PagePanel.tsx'
import { GradientHandles } from './components/GradientHandles.tsx'
import { EffectsPanel } from './components/EffectsPanel.tsx'
import { effectThumbnails, flattenDocument } from './editor/compose.ts'
import { blendInfo, EFFECT_LOOKS, effectUnit, effectsLabel, hasEffects, type BlendMode, type EffectKind, type LayerEffects } from './editor/effects.ts'
import { adjustmentLabel, isNeutral, LOOKS, NO_ADJUSTMENTS, sameAdjustments, type Adjustments } from './editor/adjust.ts'
import { adjustArea, lookThumbnails, paintAdjusted, previewParts } from './editor/adjustSession.ts'
import { DEFAULT_PPI, documentPpi } from './editor/units.ts'
import { arrangeBox, changeBox, frameOf, layerInFrame, placeInBox, type BoxChange } from './editor/arrange.ts'
import { BRUSH_PRESETS, ERASER_PRESETS, stepBrushSize, type BrushSettings } from './editor/brushes.ts'
import { getClipboard, ownCopyCheck, setClipboard } from './editor/clipboard.ts'
import {
  createBlankDocument,
  createCanvas,
  createDocumentFromImage,
  createId,
  createLayer,
  duplicateLayer,
  getContext2d,
  layerFromCanvas,
  MAX_DOCUMENT_SIDE,
} from './editor/document.ts'
import { cropDocument, documentBytes, flipDocument, resizeDocument, rotateDocument } from './editor/documentOps.ts'
import { addPage, changeEveryPage, goToPage, movePage, pageDocuments, pageIndex, removePage } from './editor/pages.ts'
import { intersectRect, polygonBounds, type Rect } from './editor/geometry.ts'
import { EXPORT_FORMATS, nextNumberedName, uniqueName, type ExportFormat } from './editor/fileNames.ts'
import { downloadBlob, exportDocument, imageFileToCanvas, openDesignFile } from './editor/io.ts'
import {
  activeLayer,
  duplicateLayers,
  insertLayerAboveActive,
  keepTogether,
  moveLayersBy,
  moveLayersTo,
  nextLayerName,
  pickedWith,
  removeLayer,
  removeLayers,
  replaceLayer,
  takeApart,
  updateLayer,
  updateShape,
} from './editor/layers.ts'
import { listDesigns, loadDesign, type SavedDesign } from './editor/library.ts'
import { startMove, type MoveSession } from './editor/move.ts'
import { canFill, isLineShape, layerAt, layerBounds, layerPixels, polygonPoints } from './editor/objects.ts'
import { fitPathToBox, geometryToPath, type ShapePath } from './editor/path.ts'
import { combinable, combineAreas, combinedShape, type CombineMode } from './editor/combine.ts'
import { gradientFrom, type Gradient } from './editor/gradient.ts'
import { onGapFilled, type GapFill } from './editor/gapFill.ts'
import { healRegion } from './editor/healRegion.ts'
import { layerVersion, pixelVersion } from './editor/pixelVersion.ts'
import { combineFound, maskToOps } from './ai/maskSelection.ts'
import { AI_PICTURE_SIDE, findThing, onAiProgress, prepareThing } from './ai/segment.ts'
import { centerTogether, lineUp, moveTogether, spreadOut, thingCount, tidyUp, type LineUpEdge } from './editor/organize.ts'
import { sampleColor } from './editor/sample.ts'
import { clearSelected, copySelected, editArea, fillArea, fillSelected, isBlank, type Piece } from './editor/pixels.ts'
import { decodeProject } from './editor/project.ts'
import type { LayerOverride } from './editor/render.ts'
import { invertSelection, selectAll, selectionInfo, type Selection, type SelectionMode, type SelectionShape } from './editor/selection.ts'
import type { StrokeResult } from './editor/stroke.ts'
import { boxCorners, boxFromRect, describeChange, flipBox, isIdentity, normalizeAngle, rotateBox90, type TransformBox } from './editor/transform.ts'
import { commitTransform, startTransform, transformParts, type TransformSession } from './editor/transformSession.ts'
import type { EditorDocument, Layer, PageLayout, PixelLayer, Point, ShapeFill, ShapeGeometry, ShapeLayer, OutlineDash, ShapeOutline, ShapeType, TextLayer, TextStyle, ToolId, Viewport } from './editor/types.ts'
import { screenToDocument } from './editor/viewport.ts'
import { centeredViewport, fitViewport, nextZoomLevel, panBy, zoomAtPoint } from './editor/viewport.ts'
import { useAutosave } from './hooks/useAutosave.ts'
import { useEditor } from './hooks/useEditor.ts'
import { usePen } from './hooks/usePen.ts'
import { useInstallApp } from './hooks/useInstallApp.ts'
import { useElementSize } from './hooks/useElementSize.ts'
import { isTypingTarget, shortcut } from './keys.ts'
import type { SizePreset } from './presets.ts'
import { DEFAULT_FONT, loadFont, nearestWeight, onFontsLoaded } from './text/fonts.ts'
import { hasRtlLetters, resolveAlign } from './text/layout.ts'
import { DEFAULT_TEXT_STYLE, TEXT_KINDS, textSizeFor, type TextKind } from './text/presets.ts'
import { useFontsVersion } from './hooks/useFontsVersion.ts'
import { canBeOnEveryPage, hasPageNumbers, setOnEveryPage } from './editor/everyPage.ts'
import { continueText, editFlowPart, storyBoxes } from './text/textFlow.ts'
import { changeText, fitText, newTextBox, textLayout, textName } from './text/textLayer.ts'
import { sharedStyle, styleRange } from './text/spans.ts'
import { TOOLS } from './tools.ts'
import { live, msg, t, useLanguage } from './i18n/i18n.ts'

type DialogId = 'new' | 'export' | 'search' | 'discard' | 'resize' | 'rename' | 'layout' | 'layouts'

// Room left around a fitted design for the floating hint and zoom controls.
const FIT_PADDING = 64
const MAX_RECENT_COLORS = 9
const NOTICE_MS = 3500

// The same faint dots the canvas draws, so the empty workspace matches it.
// A faint dot grid says "this is the table your page sits on" without drawing the eye.
const DOT_BACKGROUND = {
  backgroundImage: 'radial-gradient(rgba(27, 33, 48, 0.09) 0.85px, transparent 1.1px)',
  backgroundSize: '28px 28px',
}

const DEFAULT_BRUSH = BRUSH_PRESETS.find((p) => p.id === 'pen')!
const DEFAULT_ERASER = ERASER_PRESETS.find((p) => p.id === 'block')!

// Look pictures in the Adjust panel are drawn this big (in screen pixels, before the screen's sharpness).
const LOOK_PICTURE_SIZE = 66

// Everything that shows on a design, small enough for the AI, and a key that stands for it.
function aiPicture(d: EditorDocument) {
  const scale = Math.min(1, AI_PICTURE_SIDE / Math.max(d.width, d.height))
  const width = Math.max(1, Math.round(d.width * scale))
  const height = Math.max(1, Math.round(d.height * scale))
  const picture = () => {
    const small = createCanvas(width, height)
    const ctx = small.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(flattenDocument(d), 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  }
  return { key: pictureKey(d, width, height), width, height, picture }
}

// Stands for everything that shows on a design, so the AI can tell when it's still the same picture.
const layerListIds = new WeakMap<Layer[], number>()
let nextLayerListId = 1
function pictureKey(d: EditorDocument, width: number, height: number): string {
  let list = layerListIds.get(d.layers)
  if (!list) layerListIds.set(d.layers, (list = nextLayerListId++))
  return `${d.id}:${list}:${d.background}:${JSON.stringify(d.pageGradient ?? null)}:${width}x${height}:${d.layers.map(layerVersion).join(',')}`
}
// A number that stands for one picture's pixels, so the AI knows when it's the same photo.
const canvasIds = new WeakMap<HTMLCanvasElement, number>()
function canvasKey(canvas: HTMLCanvasElement): number {
  let id = canvasIds.get(canvas)
  if (!id) canvasIds.set(canvas, (id = nextLayerListId++))
  return id
}

// How much of the picture around a fix it may copy from, in design pixels.
const HEAL_MIN_MARGIN = 48
// How long the design must stay the same before the magic selection gets it ready.
const MAGIC_PREPARE_DELAY_MS = 600
const HEAL_MAX_MARGIN = 400

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

const LINE_UP_LABELS: Record<LineUpEdge, string> = live({
  left: msg('Line up left edges'),
  center: msg('Line up centers'),
  right: msg('Line up right edges'),
  top: msg('Line up tops'),
  middle: msg('Line up middles'),
  bottom: msg('Line up bottoms'),
})

// The color a shape or text shows in the Color panel.
function colorOfThing(layer: Layer, target: ColorTarget, fallback: string): string {
  if (layer.kind === 'text') return layer.style.color
  if (layer.kind !== 'shape') return fallback
  if (isLineShape(layer.geometry) || target === 'outline') return layer.outline?.color ?? '#1b1d23'
  return layer.fill.kind === 'color' ? layer.fill.color : fallback
}

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
  if (!layer.visible) return t('“{name}” is hidden. Click its eye in the Layers panel to show it, then adjust it.', { name: layer.name })
  if (layer.kind === 'raster' && isBlank(layerPixels(layer).canvas)) {
    return t('There is nothing on “{name}” to adjust yet. Pick another layer in the Layers panel, or paint something first.', { name: layer.name })
  }
  if (doc.selection && layer.kind !== 'raster') {
    return t('Shapes are adjusted as a whole. Press {keys} to clear the selection, then adjust “{name}”.', { keys: shortcut('mod', 'D'), name: layer.name })
  }
  if (!adjustArea(doc, layerPixels(layer), NO_ADJUSTMENTS)) {
    return t("The selected area doesn't cover anything on “{name}”. Select another part, or press {keys} to adjust the whole layer.", { name: layer.name, keys: shortcut('mod', 'D') })
  }
  return null
}

const SHAPE_NAMES: Record<ShapeType, string> = live({ rectangle: msg('Rectangle'), ellipse: msg('Oval'), polygon: msg('Polygon'), star: msg('Star'), line: msg('Line'), path: msg('Drawn shape') })
const COMBINE_LABELS: Record<CombineMode, string> = live({
  join: msg('Join shapes'),
  cut: msg('Cut out shapes'),
  overlap: msg('Keep the overlap'),
  apart: msg('Cut away the overlap'),
})

const DRAW_LABELS: Record<ShapeType, string> = live({
  rectangle: msg('Draw rectangle'),
  ellipse: msg('Draw oval'),
  polygon: msg('Draw polygon'),
  star: msg('Draw star'),
  line: msg('Draw line'),
  path: msg('Draw shape'),
})

// How the next shape will look. Lines use `line` for their color and thickness.
interface ShapeDefaults {
  geometry: ShapeGeometry
  fill: string | null
  // When set, new shapes are filled with this gradient instead of `fill`.
  gradient: Gradient | null
  outline: ShapeOutline | null
  line: ShapeOutline
}

const DEFAULT_SHAPES: ShapeDefaults = {
  geometry: { type: 'rectangle', corners: 0, sides: 6, arrow: false },
  fill: '#3b5bfd',
  gradient: null,
  outline: null,
  line: { color: '#1b1d23', width: 8 },
}

// What the Shape panel shows for new pen shapes while the Pen is picked and no shape is.
const SAMPLE_PEN_PATH: ShapePath = {
  closed: true,
  nodes: [
    { x: 0, y: -0.5, in: { x: 0, y: -0.5 }, out: { x: 0, y: -0.5 }, smooth: false },
    { x: 0.5, y: 0.5, in: { x: 0.5, y: 0.5 }, out: { x: 0.5, y: 0.5 }, smooth: false },
    { x: -0.5, y: 0.5, in: { x: -0.5, y: 0.5 }, out: { x: -0.5, y: 0.5 }, smooth: false },
  ],
}

const NEW_OUTLINE_WIDTH = 4

// Pictures added to a design fit inside this much of it.
const PLACE_FIT = 0.8

// The picture's box when added to a design: its real size, or shrunk to fit, centered on `at`.
function placementBox(canvas: HTMLCanvasElement, doc: EditorDocument, at: Point): TransformBox {
  const scale = Math.min(1, (doc.width * PLACE_FIT) / canvas.width, (doc.height * PLACE_FIT) / canvas.height)
  return { cx: Math.round(at.x), cy: Math.round(at.y), width: canvas.width * scale, height: canvas.height * scale, rotation: 0 }
}

function nameFromFile(file: File): string {
  const dot = file.name.lastIndexOf('.')
  return (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || t('Photo')
}

function cropRect(box: TransformBox): Rect {
  const x = Math.round(box.cx - box.width / 2)
  const y = Math.round(box.cy - box.height / 2)
  return { x, y, width: Math.round(box.width), height: Math.round(box.height) }
}

// What browsers hand an installed app when files are opened with it.
interface LaunchQueue {
  setConsumer: (consumer: (params: { files?: (FileSystemHandle | FileSystemFileHandle)[] }) => void) => void
}

interface TextEditState {
  layer: TextLayer
  isNew: boolean
  caret: number | 'all'
  // The text as it was before typing started.
  original: TextLayer | null
}

type TextDefaults = Omit<TextStyle, 'size'> & { size: number | null }

// True if typing changed nothing worth an undo step.
function sameText(a: TextLayer, b: TextLayer): boolean {
  const round = (box: TransformBox) => [box.cx, box.cy, box.width, box.height, box.rotation].map((n) => n.toFixed(3)).join()
  return a.text === b.text && a.wrap === b.wrap && JSON.stringify(a.style) === JSON.stringify(b.style) && JSON.stringify(a.spans) === JSON.stringify(b.spans) && round(a.box) === round(b.box)
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

// The first line of a text, short enough to fit a row of the font list.
function fontSample(text: string): string {
  const line = text.trim().split('\n')[0].trim()
  return line.length > 30 ? `${line.slice(0, 30).trimEnd()}…` : line
}

export default function App() {
  // Everything is drawn again in the new words when the language changes.
  const language = useLanguage()
  const editor = useEditor()
  const { doc } = editor
  const autosave = useAutosave(editor)
  const app = useInstallApp()
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  // A new design starts on Arrange: clicking never paints by surprise.
  const [tool, setToolState] = useState<ToolId>('move')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dialog, setDialog] = useState<DialogId | null>(null)
  // Which kind of ready layout the layouts dialog shows first.
  const [layoutsKind, setLayoutsKind] = useState<'all' | LayoutKind>('all')
  const [layoutsStart, setLayoutsStart] = useState<string | undefined>(undefined)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  // Margins and columns being chosen, shown on the design before they're kept.
  const [layoutPreview, setLayoutPreview] = useState<PageLayout | null>(null)
  const shownDoc = useMemo(() => (doc && layoutPreview ? { ...doc, layout: layoutPreview } : null), [doc, layoutPreview])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [designCount, setDesignCount] = useState(0)
  const [newDesignName, setNewDesignName] = useState(t('My design 1'))
  const [color, setColor] = useState('#1b1d23')
  const [recentColors, setRecentColors] = useState<string[]>([])
  // A color of the design being changed everywhere: what it was, what it is now, and the design
  // from before, so each pick starts again from there. It ends when something else is picked.
  const [recolor, setRecolor] = useState<{ from: string; now: string; before: EditorDocument; key: string; activeLayerId: string; tool: ToolId; changed: boolean } | null>(null)
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
  // Moving the selected part of a picture fills the gap it leaves (see gapFill.ts).
  const [fillGap, setFillGap] = useState(true)
  // Bumped when a gap has been filled, so the preview shows it.
  const [, setGapsFilled] = useState(0)
  useEffect(() => onGapFilled(() => setGapsFilled((n) => n + 1)), [])
  const [cropEdit, setCropEdit] = useState<CropState | null>(null)
  const [fillTolerance, setFillTolerance] = useState(0.15)
  const [healSize, setHealSize] = useState(40)
  // Adjustments being tried on one layer (and selection); they start over when either changes.
  const [adjustEdit, setAdjustEdit] = useState<{ layer: Layer; selection: Selection | null; settings: Adjustments } | null>(null)
  const [shapeDefaults, setShapeDefaults] = useState<ShapeDefaults>(DEFAULT_SHAPES)
  // Which part of a shape the Color panel colors.
  const [colorTarget, setColorTarget] = useState<ColorTarget>('fill')
  // Which color of a gradient fill the Color panel colors.
  const [gradientStop, setGradientStop] = useState(0)
  // Which effect's color the Color panel colors, while one is picked in the Effects panel.
  const [effectColor, setEffectColor] = useState<{ layerId: string; kind: EffectKind } | null>(null)
  // The Effects panel starts folded, so the Layers panel stays in view until effects are wanted.
  const [effectsOpen, setEffectsOpen] = useState(false)
  // While on, dragging on the selected shape slides the photo inside it.
  const [photoMoving, setPhotoMoving] = useState(false)
  // Several things picked together with Arrange. Picking isn't an undo step, so it's kept here
  // rather than in the design.
  const [pickedState, setPicked] = useState<string[] | null>(null)
  // True while pressing and holding to see how the design looked before adjusting.
  const [comparing, setComparing] = useState(false)
  // Text being typed: new text (not in the design until it has words) or text already there.
  const [textEdit, setTextEditState] = useState<TextEditState | null>(null)
  const textEditRef = useRef<TextEditState | null>(null)
  // The letters picked while typing: the Text and Color panels change just those words.
  const [textPick, setTextPickState] = useState<{ start: number; end: number } | null>(null)
  const textPickRef = useRef<{ start: number; end: number } | null>(null)
  // The part last nudged with the arrow keys, to keep moving it from where it was picked up.
  const nudgeRef = useRef<{ session: MoveSession; dx: number; dy: number; layer: Layer; selection: Selection; fillGap: boolean } | null>(null)
  // How the next new text looks. Its size fits the design unless one was chosen.
  const [textDefaults, setTextDefaults] = useState<TextDefaults>({ ...DEFAULT_TEXT_STYLE, size: null })
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // What the next picked file is for: opening a design, adding a photo, or filling a shape (its id).
  const fileModeRef = useRef<'open' | 'place' | { shape: string }>('open')
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

  // With Arrange and a selection, handles are ready around the selected part of the layer.
  // A new layer or selection, including one brought back by undo, starts fresh handles.
  const activeNow = doc ? activeLayer(doc) : undefined
  const transformOn = tool === 'move' && !!doc?.selection
  const session = useMemo(
    () => (transformOn && doc ? startTransform(doc, fillGap) : null),
    // Only the layer and the selection matter; other changes to the design keep the same handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transformOn, activeNow, doc?.selection, fillGap],
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
    () => (adjustOn && doc ? (activeNow ? adjustProblem(doc, activeNow) : t('Pick something on your design to adjust it, or click it in the Layers panel.')) : null),
    // Only the layer, its pixels and the selection matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustOn, activeNow, doc?.selection, editor.revision, language],
  )
  const adjustLayer = adjustOn && !adjustBlocked ? activeNow : undefined
  // A whole layer keeps its adjustments as a setting that can be changed again; a selected part is
  // changed in its pixels.
  const adjustWhole = !doc?.selection
  const storedAdjust = adjustWhole && adjustLayer?.adjust ? adjustLayer.adjust : NO_ADJUSTMENTS
  const adjustments =
    adjustEdit && adjustEdit.layer === adjustLayer && adjustEdit.selection === (doc?.selection ?? null) ? adjustEdit.settings : storedAdjust
  const adjustChanged = !!adjustLayer && !sameAdjustments(adjustments, storedAdjust)
  const setAdjustments = (settings: Adjustments) => {
    const d = current()
    const layer = d && activeLayer(d)
    if (d && layer) setAdjustEdit({ layer, selection: d.selection, settings })
  }
  const screenScale = viewport.zoom * (window.devicePixelRatio || 1)
  // The preview may lag a moment behind a slider being dragged, so the slider itself never stutters.
  const previewSettings = useDeferredValue(adjustments)
  const adjustPreview = useMemo((): LayerOverride | null => {
    // Right after Apply or Cancel the preview stops at once, never showing old settings on new pixels.
    if (!adjustChanged || !adjustLayer || !doc) return null
    if (adjustWhole) return { layerId: adjustLayer.id, layer: { ...adjustLayer, adjust: isNeutral(previewSettings) ? null : previewSettings } }
    if (isNeutral(previewSettings)) return null
    return { layerId: adjustLayer.id, parts: previewParts(doc, layerPixels(adjustLayer), previewSettings, screenScale) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustChanged, adjustLayer, adjustWhole, doc?.selection, doc?.width, doc?.height, previewSettings, screenScale, editor.revision])
  const lookPictures = useMemo(
    () =>
      doc && adjustLayer
        ? lookThumbnails(doc, layerPixels(adjustLayer), LOOKS.map((look) => look.settings), LOOK_PICTURE_SIZE * (window.devicePixelRatio || 1))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustLayer, doc?.selection, editor.revision],
  )

  // Keeps the adjustments: as the layer's setting, or (for a selected part) in its pixels.
  function applyAdjust() {
    const d = current()
    const layer = d && activeLayer(d)
    const settings = adjustments
    setAdjustEdit(null)
    setComparing(false)
    if (!adjustChanged || !d || !layer) return
    if (!d.selection) {
      editor.change(isNeutral(settings) ? t('Remove adjustments') : adjustmentLabel(settings), (doc) =>
        updateLayer(doc, layer.id, { adjust: isNeutral(settings) ? null : settings }),
      )
      return
    }
    if (layer.kind !== 'raster') return
    const area = adjustArea(d, layerPixels(layer), settings)
    if (area) editor.paint(adjustmentLabel(settings), layer.id, area, (ctx, l) => paintAdjusted(ctx, l, d, settings, area))
  }

  function cancelAdjust() {
    setAdjustEdit(null)
    setComparing(false)
  }

  // Shapes: with Arrange or Shapes, the selected shape's look is changed in the Shape panel, and
  // the Color panel colors it. With Shapes and no shape selected, they set how new shapes look.
  const editingShape = (tool === 'move' || tool === 'shape' || tool === 'pen') && activeNow?.kind === 'shape' ? activeNow : null
  const shapePanelOn = !!doc && (editingShape !== null || tool === 'shape' || tool === 'pen')
  const photoMoveOn = photoMoving && tool === 'move' && editingShape?.fill.kind === 'photo'

  // The fill new shapes get.
  function defaultFill(): ShapeFill {
    const { fill, gradient } = shapeDefaults
    if (gradient) return { kind: 'gradient', gradient }
    return fill ? { kind: 'color', color: fill } : { kind: 'none' }
  }

  function newShape(box: TransformBox, names: string[]): ShapeLayer {
    const { geometry, outline, line } = shapeDefaults
    const isLine = geometry.type === 'line'
    return {
      id: createId('layer'),
      kind: 'shape',
      name: nextNumberedName(SHAPE_NAMES[geometry.type], names),
      visible: true,
      opacity: 1,
      locked: false,
      adjust: null,
      box,
      geometry,
      fill: isLine ? { kind: 'none' } : defaultFill(),
      outline: isLine ? line : outline,
    }
  }

  // A shape drawn with the Pen (its path in design coordinates). A closed one is filled like other
  // shapes; an open one is a line.
  function newPenShape(designPath: ShapePath, names: string[]): ShapeLayer {
    const { box, path } = fitPathToBox(designPath)
    const { outline, line } = shapeDefaults
    const closed = designPath.closed
    const fill = closed ? defaultFill() : { kind: 'none' as const }
    return {
      id: createId('layer'),
      kind: 'shape',
      name: nextNumberedName(closed ? t('Drawn shape') : t('Curve'), names),
      visible: true,
      opacity: 1,
      locked: false,
      adjust: null,
      box,
      geometry: { type: 'path', corners: 0, sides: 6, arrow: !closed && shapeDefaults.geometry.arrow, path },
      fill,
      outline: closed ? (outline ?? (fill.kind === 'none' ? line : null)) : line,
    }
  }

  const pen = usePen({
    doc,
    getDoc: () => editor.getDoc(),
    onCreate: (path) => {
      const d = current()
      if (!d) return
      const shape = newPenShape(path, d.layers.map((l) => l.name))
      editor.change(path.closed ? t('Draw shape') : t('Draw curve'), (doc) => ({ ...insertLayerAboveActive(doc, shape), selection: null }))
    },
    onChange: (layerId, patch, label) => editor.change(label, (d) => updateShape(d, layerId, patch)),
    preview: (path) => newPenShape(path, []),
  })

  // Why the picked things can't be made into one shape, or null when they can.
  function combineProblem(d: EditorDocument, ids: string[]): string | null {
    const things = d.layers.filter((l) => ids.includes(l.id))
    if (things.some((l) => l.kind !== 'shape' || !combinable(l))) return t('Only shapes can be made into one shape. Pick just shapes (not lines, text or photos).')
    if (things.some((l) => l.locked)) return t('Something picked is locked. Unlock it first.')
    return null
  }

  // Makes one shape out of the picked shapes. It takes the look of the bottom one and its place.
  function combineShapes(ids: string[], mode: CombineMode) {
    const d = current()
    if (!d) return
    const reason = combineProblem(d, ids)
    if (reason) return problem(reason)
    const shapes = d.layers.filter((l): l is ShapeLayer => ids.includes(l.id) && l.kind === 'shape')
    const outlines = combineAreas(shapes, mode)
    const bottom = shapes[0]
    const shape = combinedShape(bottom, outlines, createId('layer'), nextNumberedName(t('Shape'), d.layers.map((l) => l.name)))
    if (!shape) return problem(mode === 'overlap' ? t('These shapes don’t overlap, so nothing would be left.') : t('Nothing would be left of the shapes.'))
    const label = COMBINE_LABELS[mode]
    editor.change(label, (doc) => {
      const at = doc.layers.findIndex((l) => l.id === bottom.id)
      const kept = doc.layers.filter((l, i) => i === at || !ids.includes(l.id)).map((l) => (l.id === bottom.id ? shape : l))
      return { ...doc, layers: kept, activeLayerId: shape.id, selection: null }
    })
    pickOne(shape.id)
  }

  // Turns any shape into a pen shape with the same look, so its points can be changed one by one.
  function editPoints(layerId: string) {
    const d = current()
    const layer = d?.layers.find((l) => l.id === layerId)
    if (layer?.kind !== 'shape') return
    if (layer.geometry.type !== 'path') {
      const w = Math.abs(layer.box.width)
      const h = Math.abs(layer.box.height)
      const path = geometryToPath(layer.geometry, Math.max(w, 1e-6), Math.max(h, 1e-6), polygonPoints(layer.geometry, w, h))
      editor.change(t('Edit points'), (doc) => updateShape(doc, layer.id, { geometry: { ...layer.geometry, type: 'path', path } }))
    }
    editor.select(layer.id)
    setTool('pen')
    inform(t('Drag the points or lines to reshape it. Click a line to add a point; double-click a point to make it sharp or smooth.'))
  }

  function drawNewShape(box: TransformBox) {
    settle()
    const d = current()
    if (!d) return
    const shape = newShape(box, d.layers.map((l) => l.name))
    editor.change(DRAW_LABELS[shape.geometry.type], (doc) => ({ ...insertLayerAboveActive(doc, shape), selection: null }))
    // Back to Arrange, with handles on the new shape, ready to place and color it.
    setToolState('move')
  }

  // Changes the selected shape, or how new shapes look when none is selected.
  function changeShape(label: string, patch: (shape: ShapeLayer) => Partial<ShapeLayer>, defaults: (d: ShapeDefaults) => ShapeDefaults, mergeKey?: string) {
    const d = current()
    const layer = d && activeLayer(d)
    if (layer?.kind === 'shape' && (tool === 'move' || tool === 'shape' || tool === 'pen')) {
      // With several things picked, every shape among them changes.
      const many = manyIn(d)
      const shapes = many && d ? d.layers.filter((l): l is ShapeLayer => many.includes(l.id) && l.kind === 'shape') : [layer]
      editor.change(label, (doc) => shapes.reduce((next, s) => updateShape(next, s.id, patch(s)), doc), {
        mergeKey: mergeKey && `${mergeKey}:${shapes.map((s) => s.id).join()}`,
      })
    } else {
      setShapeDefaults(defaults)
    }
  }

  const shapeShown: ShapeLayer | null = !shapePanelOn
    ? null
    : (editingShape ?? (tool === 'pen' ? newPenShape(SAMPLE_PEN_PATH, []) : newShape({ cx: 0, cy: 0, width: 1, height: 1, rotation: 0 }, [])))
  const shapeIsLine = !!shapeShown && isLineShape(shapeShown.geometry)
  const shapeTarget: ColorTarget = shapeIsLine ? 'outline' : colorTarget
  // The color the Color panel shows while coloring a shape.
  const shapeColor: string | null = !shapeShown
    ? null
    : shapeTarget === 'outline'
      ? (shapeShown.outline?.color ?? '#1b1d23')
      : shapeShown.fill.kind === 'color'
        ? shapeShown.fill.color
        : shapeShown.fill.kind === 'gradient'
          ? shapeShown.fill.gradient.stops[Math.min(gradientStop, shapeShown.fill.gradient.stops.length - 1)].color
          : color

  // A gradient for the picked shapes, or for new shapes when none is picked.
  function changeGradient(gradient: Gradient, label: string, mergeKey?: string) {
    changeShape(label, () => ({ fill: { kind: 'gradient', gradient } }), (d) => ({ ...d, gradient }), mergeKey ?? `shape-gradient-${label}`)
  }

  // The page's gradient. Its first color is also kept as the page's color.
  function changePageGradient(gradient: Gradient, label: string, mergeKey?: string) {
    editor.change(label, (d) => ({ ...d, background: gradient.stops[0].color, pageGradient: gradient }), { mergeKey: mergeKey ?? `page-gradient-${label}` })
  }

  function changePageFillKind(kind: 'color' | 'gradient') {
    const d = current()
    if (!d || (kind === 'gradient') === !!(d.background && d.pageGradient)) return
    if (kind === 'gradient') {
      setGradientStop(0)
      changePageGradient(gradientFrom(d.background ?? '#ffffff'), t('Page gradient'))
    } else {
      editor.change(t('Page color'), (doc) => ({ ...doc, background: doc.background ?? '#ffffff', pageGradient: null }))
    }
  }

  function changeFillKind(kind: 'color' | 'gradient') {
    if (!shapeShown || shapeShown.fill.kind === kind) return
    const fill = shapeShown.fill
    if (kind === 'gradient') {
      setGradientStop(0)
      changeGradient(gradientFrom(fill.kind === 'color' ? fill.color : color), t('Gradient fill'))
    } else {
      const hex = fill.kind === 'gradient' ? fill.gradient.stops[0].color : (shapeDefaults.fill ?? DEFAULT_SHAPES.fill!)
      changeShape(t('Fill color'), () => ({ fill: { kind: 'color', color: hex } }), (d) => ({ ...d, fill: hex, gradient: null }))
    }
  }

  function colorShape(hex: string) {
    rememberColor(hex)
    if (shapeTarget === 'outline') {
      changeShape(
        shapeIsLine ? t('Line color') : t('Outline color'),
        (s) => ({ outline: { ...s.outline, color: hex, width: s.outline?.width || NEW_OUTLINE_WIDTH } }),
        (d) => (shapeIsLine ? { ...d, line: { ...d.line, color: hex } } : { ...d, outline: { ...d.outline, color: hex, width: d.outline?.width || NEW_OUTLINE_WIDTH } }),
        'shape-outline-color',
      )
    } else if (shapeShown?.fill.kind === 'gradient') {
      const gradient = shapeShown.fill.gradient
      const index = Math.min(gradientStop, gradient.stops.length - 1)
      changeGradient({ ...gradient, stops: gradient.stops.map((s, i) => (i === index ? { ...s, color: hex } : s)) }, t('Gradient color'), `shape-gradient-color-${index}`)
    } else {
      changeShape(t('Fill color'), () => ({ fill: { kind: 'color', color: hex } }), (d) => ({ ...d, fill: hex, gradient: null }), 'shape-fill-color')
    }
  }

  // With several things picked, the Color panel colors every shape and text among them (a shape's
  // fill or outline, as chosen in the Shape panel; photos inside shapes stay).
  function colorMany(hex: string) {
    const d = current()
    const many = manyIn(d)
    if (!d || !many) return
    rememberColor(hex)
    const colored = (l: Layer): Layer => {
      if (l.kind === 'text') return changeText(l, { style: { color: hex, gradient: null } })
      if (l.kind !== 'shape') return l
      if (isLineShape(l.geometry) || shapeTarget === 'outline') return { ...l, outline: { ...l.outline, color: hex, width: l.outline?.width || NEW_OUTLINE_WIDTH } }
      return l.fill.kind === 'photo' || l.fill.kind === 'gradient' ? l : { ...l, fill: { kind: 'color', color: hex } }
    }
    editor.change(t('Color'), (doc) => ({ ...doc, layers: doc.layers.map((l) => (many.includes(l.id) ? colored(l) : l)) }), { mergeKey: `color:${many.join()}` })
  }

  function changeGeometry(patch: Partial<ShapeGeometry>) {
    const label = 'corners' in patch ? t('Round corners') : 'sides' in patch ? t('Change sides') : 'arrow' in patch ? t('Arrow head') : t('Change shape')
    changeShape(label, (s) => ({ geometry: { ...s.geometry, ...patch } }), (d) => ({ ...d, geometry: { ...d.geometry, ...patch } }), `shape-${Object.keys(patch)[0]}`)
  }

  function changeOutlineWidth(width: number) {
    changeShape(
      shapeIsLine ? t('Line thickness') : t('Outline width'),
      (s) => ({ outline: width > 0 || shapeIsLine ? { ...s.outline, color: s.outline?.color ?? '#1b1d23', width } : null }),
      (d) => (shapeIsLine ? { ...d, line: { ...d.line, width } } : { ...d, outline: width > 0 ? { ...d.outline, color: d.outline?.color ?? '#1b1d23', width } : null }),
      'shape-outline-width',
    )
  }

  // Solid, dashed or dotted, for the outline (or the line itself).
  function changeOutlineDash(dash: OutlineDash) {
    const label = dash === 'dashed' ? t('Dashed line') : dash === 'dotted' ? t('Dotted line') : t('Solid line')
    const withDash = (outline: ShapeOutline): ShapeOutline => (dash === 'solid' ? { color: outline.color, width: outline.width } : { ...outline, dash })
    changeShape(
      label,
      (s) => ({ outline: s.outline ? withDash(s.outline) : null }),
      (d) => (shapeIsLine ? { ...d, line: withDash(d.line) } : { ...d, outline: d.outline ? withDash(d.outline) : null }),
    )
  }

  function setPhotoFill(patch: Partial<Extract<ShapeFill, { kind: 'photo' }>>, label: string) {
    const layer = editingShape
    if (layer?.fill.kind !== 'photo') return
    const fill = layer.fill
    editor.change(label, (d) => updateShape(d, layer.id, { fill: { ...fill, ...patch } }), { mergeKey: `shape-photo-${Object.keys(patch).join()}:${layer.id}` })
  }

  // Places a layer in a new box: resizing and turning never lose any of a picture's quality.
  function placeLayer(layerId: string, box: TransformBox, label: string) {
    const layer = current()?.layers.find((l) => l.id === layerId)
    if (!layer) return
    editor.change(label, (d) => replaceLayer(d, placeInBox(layer, box)), { bytes: layer.kind === 'raster' && !layer.box ? canvasBytes(layer.canvas) : 0 })
  }

  // Picking several things. They count only with Arrange, while they're all still there and the
  // picked layer is one of them.
  function manyIn(d: EditorDocument | null): string[] | null {
    if (!d || !pickedState || tool !== 'move' || d.selection) return null
    const ids = d.layers.filter((l) => pickedState.includes(l.id)).map((l) => l.id)
    return ids.length >= 2 && ids.includes(d.activeLayerId) ? ids : null
  }
  const picked = manyIn(doc)
  // Forget them once they no longer count, so they don't come back later by surprise.
  useEffect(() => {
    if (pickedState && !picked) setPicked(null)
  }, [pickedState, picked])

  // What Arrange and the layer buttons work on: the things picked together, or the picked thing.
  function targets(): string[] {
    const d = current()
    if (!d) return []
    return manyIn(d) ?? (activeLayer(d) ? [d.activeLayerId] : [])
  }

  // Picks just one thing (even inside something kept together), or the page with ''.
  function pickOne(layerId: string) {
    setPicked(null)
    setPhotoMoving(false)
    editor.select(layerId)
  }

  // Picks several things; the top one becomes the picked layer. One picks just it, none the page.
  function pickMany(ids: string[]) {
    const d = current()
    if (!d) return
    const inOrder = d.layers.filter((l) => ids.includes(l.id)).map((l) => l.id)
    if (inOrder.length < 2) return pickOne(inOrder[0] ?? '')
    setPhotoMoving(false)
    setPicked(inOrder)
    editor.select(inOrder[inOrder.length - 1])
  }

  // Shift+click: adds a thing (with everything kept together with it) to what's picked, or takes it away.
  function togglePicked(layerId: string) {
    const d = current()
    if (!d) return
    if (tool !== 'move') setTool('move')
    const now = manyIn(d) ?? (activeLayer(d) ? [d.activeLayerId] : [])
    const these = pickedWith(d, layerId)
    pickMany(these.every((id) => now.includes(id)) ? now.filter((id) => !these.includes(id)) : [...now, ...these])
  }

  // Several things moved, resized or turned together, from one frame around them to another.
  function placeMany(ids: string[], from: TransformBox, to: TransformBox, label: string) {
    const d = current()
    if (!d) return
    const bytes = d.layers.reduce((sum, l) => (ids.includes(l.id) && l.kind === 'raster' && !l.box ? sum + canvasBytes(l.canvas) : sum), 0)
    editor.change(label, (doc) => ({ ...doc, layers: doc.layers.map((l) => (ids.includes(l.id) ? layerInFrame(l, from, to) : l)) }), { bytes })
  }

  const KEEP_TOGETHER_HINT = t('Pick two or more things first: drag a box around them on your design, or hold Shift and click each one.')

  // A name for things kept together, from what's in it: "Circle + Star", or "Circle + 2 more".
  function groupName(d: EditorDocument, ids: string[]): string {
    const names = new Map<string, string>()
    for (const layer of [...d.layers].reverse()) {
      if (ids.includes(layer.id)) names.set(layer.group?.id ?? layer.id, layer.group?.name ?? layer.name)
    }
    const [first, second] = names.values()
    return names.size === 2 ? `${first} + ${second}` : t('{first} + {count} more', { first, count: names.size - 1 })
  }

  // Why the picked things can't be kept together, or null if they can.
  function keepTogetherBlocker(d: EditorDocument | null): string | null {
    const ids = manyIn(d)
    if (!d || !ids) return KEEP_TOGETHER_HINT
    return thingCount(d, ids) < 2 ? t('They are already kept together.') : null
  }

  // The groups of what's picked, which Take apart lets go of.
  function pickedGroups(d: EditorDocument | null): string[] {
    if (!d) return []
    const ids = manyIn(d) ?? (activeLayer(d) ? [d.activeLayerId] : [])
    return [...new Set(d.layers.flatMap((l) => (ids.includes(l.id) && l.group ? [l.group.id] : [])))]
  }

  const organize = {
    keepTogether: () => {
      settle()
      const d = current()
      const ids = manyIn(d)
      const blocker = keepTogetherBlocker(d)
      if (!d || !ids || blocker) return problem(blocker ?? KEEP_TOGETHER_HINT)
      const name = groupName(d, ids)
      editor.change(t('Keep together'), (doc) => keepTogether(doc, ids, { id: createId('group'), name }))
      inform(t('Kept together as “{name}”. Click any part to pick it all; double-click to pick just one part.', { name }))
    },
    takeApart: () => {
      settle()
      const groups = pickedGroups(current())
      if (groups.length === 0) return problem(t('Pick something kept together first.'))
      editor.change(t('Take apart'), (d) => groups.reduce((doc, group) => takeApart(doc, group), d))
    },
    tidyUp: () => {
      settle()
      const d = current()
      const ids = manyIn(d)
      if (!d || !ids || thingCount(d, ids) < 2) return problem(KEEP_TOGETHER_HINT)
      editor.change(t('Tidy up'), (doc) => tidyUp(doc, ids))
      if (current() === d) inform(t('They are already neat.'))
    },
    lineUp: (edge: LineUpEdge) => {
      settle()
      const d = current()
      const ids = targets()
      if (!d || ids.length === 0) return problem(t('Pick something on your design first.'))
      if (ids.length === 1 && !usableLayer(t('line it up'))) return
      editor.change(LINE_UP_LABELS[edge], (doc) => lineUp(doc, ids, edge))
      if (current() === d) inform(t('It is already lined up.'))
    },
    spreadOut: (axis: 'x' | 'y') => {
      settle()
      const d = current()
      const ids = manyIn(d)
      if (!d || !ids || thingCount(d, ids) < 3) return problem(t('Pick three or more things first, to space them evenly.'))
      editor.change(axis === 'x' ? t('Space evenly across') : t('Space evenly down'), (doc) => spreadOut(doc, ids, axis))
      if (current() === d) inform(t('They are already evenly spaced.'))
    },
  }

  // Effects: the picked object's shadow, glow and outline, and how it mixes with what's below.
  // They're also under the Adjust sliders, so whichever tool people try first, effects are there.
  const effectsLayer =
    doc && !textEdit && !picked && (tool === 'move' || tool === 'shape' || tool === 'pen' || tool === 'text' || (adjustOn && !doc.selection)) ? activeNow : undefined
  const unit = doc ? effectUnit(doc.width, doc.height) : 1
  const effectPictures = useMemo(
    () =>
      doc && effectsLayer && effectsOpen
        ? effectThumbnails(doc, effectsLayer, EFFECT_LOOKS.map((look) => look.effects(unit)), LOOK_PICTURE_SIZE * (window.devicePixelRatio || 1), 66 / 50)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectsLayer, effectsOpen, editor.revision, doc?.background, unit],
  )
  const effectTarget = effectsLayer && effectColor?.layerId === effectsLayer.id && effectsLayer.effects?.[effectColor.kind] ? effectColor.kind : null

  function changeEffects(effects: LayerEffects, label: string, slider?: string) {
    const layer = effectsLayer
    if (!layer) return
    editor.change(label, (d) => updateLayer(d, layer.id, { effects: hasEffects(effects) ? effects : null }), { mergeKey: slider && `effects-${slider}:${layer.id}` })
  }

  function changeBlend(mode: BlendMode) {
    const layer = effectsLayer
    if (!layer) return
    editor.change(mode === 'normal' ? t('Mix normally') : t('Mix: {mode}', { mode: blendInfo(mode).name }), (d) => updateLayer(d, layer.id, { blend: mode === 'normal' ? undefined : mode }))
  }

  function colorEffect(hex: string) {
    const layer = effectsLayer
    const kind = effectTarget
    const effect = kind && layer?.effects?.[kind]
    if (!layer || !kind || !effect) return
    rememberColor(hex)
    changeEffects({ ...layer.effects!, [kind]: { ...effect, color: hex } }, kind === 'shadow' ? t('Shadow color') : kind === 'glow' ? t('Glow color') : t('Outline color'), `${kind}-color`)
  }

  // Text: typed right on the design. The Text panel changes the text being typed, or the text
  // picked with Arrange or the Text tool, or (with nothing picked) how new text looks.
  const pickedText = !textEdit && (tool === 'move' || tool === 'text') && activeNow?.kind === 'text' ? activeNow : null
  const textTarget: TextLayer | null = textEdit?.layer ?? pickedText
  const textPanelOn = !!doc && (textTarget !== null || tool === 'text')

  function setTextPick(next: { start: number; end: number } | null) {
    textPickRef.current = next
    setTextPickState(next)
  }

  function setTextEdit(next: TextEditState | null) {
    if (next?.layer.id !== textEditRef.current?.layer.id) setTextPick(null)
    textEditRef.current = next
    setTextEditState(next)
  }

  function updateTextEdit(change: (layer: TextLayer) => TextLayer) {
    const edit = textEditRef.current
    if (edit) setTextEdit({ ...edit, layer: change(edit.layer) })
  }

  // A font that loads while typing changes the letters' widths, so the box is fitted again.
  useEffect(() => onFontsLoaded(() => updateTextEdit(fitText)), [])

  function newTextStyle(d: EditorDocument, kind?: TextKind): TextStyle {
    const info = kind && TEXT_KINDS[kind]
    return {
      ...textDefaults,
      size: info ? textSizeFor(d.width, d.height, info.size) : (textDefaults.size ?? textSizeFor(d.width, d.height, 0.08)),
      weight: info ? nearestWeight(textDefaults.font, info.weight) : textDefaults.weight,
      lineHeight: info ? info.lineHeight : textDefaults.lineHeight,
      align: info ? info.align : textDefaults.align,
    }
  }

  function textObject(style: TextStyle, box: TransformBox, text: string, wrap: boolean): TextLayer {
    return { id: createId('layer'), kind: 'text', name: textName(text), visible: true, opacity: 1, locked: false, adjust: null, box, text, style, wrap }
  }

  // New text where the Text tool clicked (the first line starts there) or in a dragged box.
  function newTextAt(point: Point, area: Rect | null) {
    settle()
    const d = current()
    if (!d) return
    const style = newTextStyle(d)
    const line = style.size * style.lineHeight
    const layer = area
      ? textObject(style, { cx: area.x + area.width / 2, cy: area.y + line / 2, width: area.width, height: line, rotation: 0 }, '', true)
      : textObject(style, newTextBox(point, style), '', false)
    setTextEdit({ layer: fitText(layer), isNew: true, caret: 0, original: null })
  }

  // A ready-made heading, subheading or paragraph in the middle of the design, its words picked so
  // typing replaces them.
  function addText(kind: TextKind) {
    setTool('text')
    const d = current()
    if (!d) return
    const style = newTextStyle(d, kind)
    const center = { x: d.width / 2, y: d.height / 2 }
    const wrap = kind === 'body'
    const box = wrap ? { cx: center.x, cy: center.y, width: Math.round(d.width * 0.6), height: style.size * style.lineHeight, rotation: 0 } : newTextBox(center, style)
    const fitted = fitText(textObject(style, box, TEXT_KINDS[kind].sample, wrap))
    setTextEdit({ layer: { ...fitted, box: { ...fitted.box, cx: center.x, cy: center.y } }, isNew: true, caret: 'all', original: null })
    void loadFont(style, TEXT_KINDS[kind].sample)
  }

  // Starts typing in text already on the design, with the cursor at `caret`.
  function editText(layerId: string, caret: number | 'all') {
    settle()
    const layer = current()?.layers.find((l) => l.id === layerId)
    if (layer?.kind !== 'text') return
    if (!layer.visible) {
      problem(t('“{name}” is hidden. Click its eye in the Layers panel to show it, then change it.', { name: layer.name }))
      return
    }
    pickOne(layerId)
    setTextEdit({ layer, isNew: false, caret, original: layer })
  }

  // Keeps what was typed: new text joins the design (with handles ready to place it), changed text
  // is updated, and text with every letter taken out is removed.
  function finishText() {
    const edit = textEditRef.current
    if (!edit) return
    setTextEdit(null)
    const { layer, original } = edit
    const empty = !layer.text.trim()
    // Names follow the words, unless the text was given a name of its own.
    const autoNamed = !original || original.name === textName(original.text)
    const named = { ...layer, name: autoNamed ? textName(layer.text) : original.name }
    if (edit.isNew) {
      if (empty) return
      editor.change(t('Add text'), (d) => ({ ...insertLayerAboveActive(d, named), selection: null }))
      setToolState('move')
      return
    }
    // A box the text runs on from is never removed for being empty: the story fills it again.
    if (original?.flow) {
      if (sameText({ ...layer, box: original.box, wrap: original.wrap }, original)) return
      editor.change(t('Edit text'), (d) => {
        const next = editFlowPart(d, layer.id, layer.text, layer.spans)
        // A look chosen for all of the text while typing goes to every box of it.
        if (layer.style === original.style) return next
        return storyBoxes(next, layer).reduce((doc, box) => replaceLayer(doc, { ...box, style: layer.style }), next)
      })
      return
    }
    if (empty) editor.change(t('Delete text'), (d) => removeLayer(d, layer.id))
    else if (!original || !sameText(layer, original) || named.name !== original.name) editor.change(t('Edit text'), (d) => replaceLayer(d, named))
  }

  function changeTextStyle(patch: Partial<TextStyle>, label: string, mergeKey?: string) {
    if (textEditRef.current) {
      const pick = textPickRef.current
      // With some words picked, their font, boldness, slant and color change; everything else
      // (size, spacing, lining up) is for the whole text.
      const own = Object.keys(patch).every((key) => key === 'font' || key === 'weight' || key === 'italic' || key === 'color')
      if (pick && pick.end > pick.start && own) {
        updateTextEdit((layer) => changeText(layer, { spans: styleRange(layer.spans, layer.style, layer.text.length, pick.start, pick.end, patch) }))
      } else {
        updateTextEdit((layer) => changeText(layer, { style: patch }))
      }
      return
    }
    const d = current()
    const layer = d && activeLayer(d)
    if (layer?.kind === 'text' && (tool === 'move' || tool === 'text')) {
      // With several things picked, every text among them changes.
      const many = manyIn(d)
      const chosen = many && d ? d.layers.filter((l): l is TextLayer => many.includes(l.id) && l.kind === 'text') : [layer]
      // Boxes the text runs on through all look the same.
      const texts = [...new Map(chosen.flatMap((l) => (d ? storyBoxes(d, l) : [l])).map((l) => [l.id, l])).values()]
      editor.change(label, (doc) => texts.reduce((next, t) => replaceLayer(next, changeText(t, { style: patch })), doc), {
        mergeKey: mergeKey && `${mergeKey}:${texts.map((t) => t.id).join()}`,
      })
    } else {
      setTextDefaults((t) => ({ ...t, ...patch }))
    }
  }

  // The texts the Text panel changes: the picked one (and the boxes it runs on through), or every
  // picked text.
  function pickedTextIds(d: EditorDocument): string[] {
    const layer = activeLayer(d)
    if (layer?.kind !== 'text') return []
    const many = manyIn(d)
    const chosen = many ? d.layers.filter((l): l is TextLayer => many.includes(l.id) && l.kind === 'text') : [layer]
    return [...new Set(chosen.flatMap((l) => storyBoxes(d, l)).map((l) => l.id))]
  }

  // Saved text styles: used, kept, changed and removed from the Text panel.
  const textStyleControls = ((): TextStylesProps | null => {
    if (!doc) return null
    const target = textEdit?.layer ?? pickedText
    const saved = target ? findTextStyle(doc, target.styleId) : undefined
    return {
      styles: textStyles(doc),
      current: saved?.id ?? null,
      differs: !!saved && !!target && !matchesStyle(target.style, saved.style),
      target: target ? 'picked' : 'new',
      onApply: (id) => {
        const d = current()
        const style = d && findTextStyle(d, id)
        if (!d || !style) return
        if (textEditRef.current) updateTextEdit((layer) => ({ ...changeText(layer, { style: lookPatch(style.style) }), styleId: id }))
        else if (pickedText) editor.change(t('Use text style'), (next) => applyTextStyle(next, id, pickedTextIds(next)))
        else setTextDefaults((defaults) => ({ ...defaults, ...lookPatch(style.style) }))
      },
      onSave: () => {
        const d = current()
        if (!d) return
        const id = newStyleId(d)
        const name = nextStyleName(d)
        const editing = textEditRef.current
        const style = editing?.layer.style ?? pickedText?.style ?? newTextStyle(d)
        if (editing) updateTextEdit((layer) => ({ ...layer, styleId: id }))
        editor.change(t('Save text style'), (next) => saveTextStyle(next, name, style, editing ? [] : pickedText ? pickedTextIds(next) : [], id))
      },
      onUpdate: () => {
        const editing = textEditRef.current
        const layer = editing?.layer ?? pickedText
        if (!layer?.styleId) return
        const styleId = layer.styleId
        editor.change(t('Update text style'), (next) => updateTextStyle(next, styleId, layer.style))
      },
      onRename: (id, name) => editor.change(t('Rename text style'), (next) => renameTextStyle(next, id, name)),
      onRemove: (id) => {
        if (textEditRef.current?.layer.styleId === id) {
          updateTextEdit((layer) => {
            const { styleId: _, ...rest } = layer
            return rest
          })
        }
        editor.change(t('Remove text style'), (next) => removeTextStyle(next, id))
      },
    }
  })()

  // A gradient across all the letters. Its first color is kept as the text's color too.
  function changeTextGradient(gradient: Gradient, label: string, mergeKey?: string) {
    changeTextStyle({ gradient, color: gradient.stops[0].color }, label, mergeKey ?? `text-gradient-${label}`)
  }

  function changeTextFillKind(kind: 'color' | 'gradient') {
    const style = textEditRef.current?.layer.style ?? pickedText?.style ?? textDefaults
    if ((kind === 'gradient') === !!style.gradient) return
    if (kind === 'gradient') {
      setGradientStop(0)
      changeTextGradient(gradientFrom(style.color), t('Letter gradient'))
    } else {
      changeTextStyle({ gradient: null }, t('Text color'))
    }
  }

  // A new font is loaded before it's used, so the text's box fits its real letters.
  async function changeFont(id: string) {
    const target = textEditRef.current?.layer ?? pickedText
    const base = target?.style ?? { ...textDefaults, size: 16 }
    const weight = nearestWeight(id, base.weight)
    // Every picked text's letters, so they all fit their boxes once the font is in.
    const many = textEditRef.current ? null : manyIn(current())
    const letters = many ? (current()?.layers.flatMap((l) => (many.includes(l.id) && l.kind === 'text' ? [l.text] : [])).join('') ?? '') : (target?.text ?? '')
    await loadFont({ ...base, font: id, weight }, letters || 'Aא')
    changeTextStyle({ font: id, weight }, t('Change font'))
  }

  // A font pointed at in the font list, shown on the picked text (once it has loaded) until the
  // pointer moves on. Nothing is changed until a font is clicked.
  const [fontPreview, setFontPreview] = useState<string | null>(null)
  const fontPreviewWanted = useRef<string | null>(null)
  function previewFont(id: string | null) {
    fontPreviewWanted.current = id
    if (!id) return setFontPreview(null)
    const target = pickedText
    if (!target) return
    void loadFont({ ...target.style, font: id, weight: nearestWeight(id, target.style.weight) }, target.text || 'Aא').then(() => {
      if (fontPreviewWanted.current === id) setFontPreview(id)
    })
  }
  const fontPreviewLayer = useMemo(
    () =>
      fontPreview && pickedText && fontPreview !== pickedText.style.font
        ? changeText(pickedText, { style: { font: fontPreview, weight: nearestWeight(fontPreview, pickedText.style.weight) } })
        : null,
    [fontPreview, pickedText],
  )

  function changeWrap(wrap: boolean) {
    const label = wrap ? t('Wrap text in a box') : t('Fit box to text')
    if (textEditRef.current) {
      updateTextEdit((layer) => changeText(layer, { wrap }))
      return
    }
    if (pickedText) editor.change(label, (d) => replaceLayer(d, changeText(pickedText, { wrap })))
  }

  // An empty box after the picked text, for the words to run on into.
  function continueInAnotherBox() {
    const d = current()
    if (!d || !pickedText) return
    const gap = d.layout && d.layout.columns > 1 ? d.layout.gap : defaultGap(d.width, d.height)
    let added: string | null = null
    editor.change(t('Continue in another box'), (doc) => {
      const result = continueText(doc, pickedText.id, gap)
      added = result?.id ?? null
      return result?.doc ?? doc
    })
    if (added) pickOne(added)
  }

  // Letters can change size when their font arrives, so text running on from box to box is split again.
  const fontsVersion = useFontsVersion()
  useEffect(() => editor.reflow(), [fontsVersion])

  // The font the program starts with is ready before anyone types.
  const hasDoc = !!doc
  useEffect(() => {
    if (hasDoc) void loadFont({ ...DEFAULT_TEXT_STYLE, font: DEFAULT_FONT }, 'Aaא')
  }, [hasDoc])

  // Keeps the selected part's new size and angle. Returns false if it couldn't (too big).
  function applyTransform(box = transform?.box): boolean {
    if (!transform || !box || isIdentity(box, transform.session.original)) return true
    const { session } = transform
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
      problem(t('That would be too big to draw. Try making it a little smaller.'))
      return false
    }
    setTransformEdit(null)
    fillGapWhenReady(session.layerId, session.gap)
    return true
  }

  function cancelTransform() {
    setTransformEdit(null)
  }

  function applyCrop() {
    const d = current()
    if (!crop || !d || isIdentity(crop.box, fullFrame(d))) return
    const rect = cropRect(crop.box)
    editor.change(t('Crop'), (doc) => changeEveryPage(doc, (page) => cropDocument(page, rect)))
    // Keep the part you kept exactly where it was on screen.
    setViewport((v) => ({ ...v, panX: v.panX + rect.x * v.zoom, panY: v.panY + rect.y * v.zoom }))
    setCropEdit(null)
  }

  // Unfinished resizing or cropping is applied before doing anything else, so nothing gets mixed up.
  // Returns false if a resize couldn't be applied (it would be too big), which has been explained.
  function settle(): boolean {
    finishText()
    pen.finish()
    if (transformChanged && !applyTransform()) return false
    if (cropChanged) applyCrop()
    if (adjustChanged) applyAdjust()
    return true
  }

  function setTool(next: ToolId) {
    finishText()
    if (next !== tool) {
      if (tool === 'move') {
        if (!applyTransform()) return
        setTransformEdit(null)
        setPhotoMoving(false)
      }
      if (tool === 'crop') {
        applyCrop()
        setCropEdit(null)
      }
      if (tool === 'adjust') applyAdjust()
      if (tool === 'pen') pen.finish()
      // Adjusting an empty layer does nothing, so start on the top layer that has something on it.
      if (next === 'adjust') {
        const d = current()
        const layer = d && activeLayer(d)
        const empty = (l: Layer) => l.kind === 'raster' && isBlank(layerPixels(l).canvas)
        if (d && (!layer || empty(layer))) {
          const filled = [...d.layers].reverse().find((l) => l.visible && !empty(l))
          if (filled) editor.select(filled.id)
        }
      }
    }
    if (next === 'brush' || next === 'eraser') lastDrawToolRef.current = next
    setToolState(next)
  }

  function fitted(next: { width: number; height: number }, allowUpscale = true): Viewport {
    // The newest size, even when called after waiting (opening a file), when `workspace` from
    // back then may be out of date.
    const area = lastWorkspaceRef.current
    return fitViewport(next.width, next.height, area.width, area.height, { allowUpscale, padding: FIT_PADDING })
  }

  // `stored` means the design is already kept in this browser (it was opened from Your designs).
  function showDocument(next: EditorDocument, stored = false) {
    editor.load(next)
    autosave.start(next, stored)
    // Things picked in the design that was open before don't carry over, even when the same
    // design comes back from a file with the same layers.
    setPicked(null)
    setTransformEdit(null)
    setCropEdit(null)
    setCursor(null)
    setNotice(null)
    setFitPending(next)
  }

  // A design just opened is fitted once the screen has settled around it: the tools and panels
  // only appear with a design, which makes the workspace smaller, so fitting it any earlier would
  // leave the design off-center.
  const [fitPending, setFitPending] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    // Measured here and now: the size kept in `workspace` only catches up a moment later.
    const element = workspaceRef.current
    const size = element ? { width: element.clientWidth, height: element.clientHeight } : workspace
    if (!fitPending || !size.width || !size.height) return
    setViewport(fitViewport(fitPending.width, fitPending.height, size.width, size.height, { allowUpscale: false, padding: FIT_PADDING }))
    // When `workspace` catches up, the view is already right for it.
    lastWorkspaceRef.current = size
    setFitPending(null)
  }, [fitPending, workspace])

  // Before leaving the open design, its latest changes are saved in the browser. If that doesn't
  // work and they haven't been downloaded either, it asks first.
  const leaveTicketRef = useRef(0)
  async function leaveDesign(action: () => void) {
    // Stay put rather than lose a resize that couldn't be applied.
    if (!settle()) return
    // Saving takes a moment. If something else was asked for meanwhile (closing, then opening a
    // file), only the newest one happens, so a late "close" never closes the design just opened.
    const ticket = ++leaveTicketRef.current
    const saved = await autosave.flush()
    if (ticket !== leaveTicketRef.current) return
    if (saved || !editor.isDirty) {
      action()
    } else {
      pendingDiscardRef.current = action
      setDialog('discard')
    }
  }

  // Adds a picture to the open design as a layer of its own, keeping its original pixels.
  async function placePhoto(file: File, at?: Point) {
    try {
      const canvas = await imageFileToCanvas(file)
      settle()
      const d = current()
      if (!d) return
      const box = placementBox(canvas, d, at ?? { x: d.width / 2, y: d.height / 2 })
      const layer: PixelLayer = { ...layerFromCanvas(nameFromFile(file), canvas), box }
      editor.change(t('Add photo'), (doc) => ({ ...insertLayerAboveActive(doc, layer), selection: null }), { bytes: canvasBytes(canvas) })
      setTool('move')
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  // Puts a picture inside a shape, filling it.
  async function photoIntoShape(file: File, layerId: string) {
    try {
      const canvas = await imageFileToCanvas(file)
      settle()
      editor.change(t('Put photo in shape'), (d) => updateShape(d, layerId, { fill: { kind: 'photo', canvas, zoom: 1, x: 0, y: 0 } }), { bytes: canvasBytes(canvas) })
      editor.select(layerId)
      setTool('move')
      inform(t('The photo fills the shape. Use Photo size and Move photo in the Shape panel to show the part you want.'))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  // A picture dropped on the design goes inside the shape under it, or onto a layer of its own.
  async function dropFile(file: File, clientX: number, clientY: number) {
    const d = current()
    const rect = workspaceRef.current?.getBoundingClientRect()
    if (!d || !rect || (await isProjectDrop(file))) {
      void openFile(file)
      return
    }
    const point = screenToDocument(viewport, clientX - rect.left, clientY - rect.top)
    const under = layerAt(d, point)
    if (under?.kind === 'shape' && canFill(under.geometry)) void photoIntoShape(file, under.id)
    else void placePhoto(file, point)
  }

  async function isProjectDrop(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith(`.${EXPORT_FORMATS.project.extension}`) || !file.type.startsWith('image/')
  }

  // Opens the computer's file picker for one of the jobs a picked file can have.
  function pickFile(mode: 'open' | 'place' | { shape: string }) {
    const input = fileInputRef.current
    if (!input) return
    fileModeRef.current = mode
    input.accept = mode === 'open' ? `image/*,.${EXPORT_FORMATS.project.extension}` : 'image/*'
    input.click()
  }

  function handlePickedFile(file: File) {
    const mode = fileModeRef.current
    fileModeRef.current = 'open'
    if (mode === 'open') void openFile(file)
    else if (mode === 'place') void placePhoto(file)
    else void photoIntoShape(file, mode.shape)
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
      if (!file) throw new Error(t("“{name}” isn't in this browser anymore. It may have been deleted in another tab.", { name: design.name }))
      const next = await decodeProject(file, design.id)
      await leaveDesign(() => showDocument(next, true))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function createDocument({ name, width, height, background, ppi }: Omit<NewDocumentOptions, 'ppi'> & { ppi?: number }) {
    try {
      const next = createBlankDocument(name, width, height, background, ppi)
      setDialog(null)
      void leaveDesign(() => {
        setTool('move')
        showDocument(next)
      })
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

  // A ready layout becomes a new design: every part a shape or a text, its colors and text
  // styles kept as the design's own.
  async function startFromLayout(layout: LayoutInfo, colors: string) {
    try {
      await loadLayoutFonts(layout)
      const next = buildLayout(layout, colors, uniqueName(layout.name, await savedNames()))
      setDialog(null)
      void leaveDesign(() => {
        setTool('move')
        showDocument(next)
      })
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  async function download({ format, quality, fileName, pdf }: ExportOptions) {
    const d = current()
    if (!d) return
    try {
      downloadBlob(await exportDocument(d, format, quality / 100, pdf), fileName)
      editor.markSaved()
      setDialog(null)
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function rememberColor(used: string) {
    setRecentColors((recent) => [used, ...recent.filter((c) => c !== used)].slice(0, MAX_RECENT_COLORS))
  }

  function handleStroke(layerId: string, result: StrokeResult, label: string, grown?: PixelLayer) {
    editor.commitStroke(label, layerId, result, grown)
    if (tool === 'brush') rememberColor(color)
  }

  // Fix spots: what was brushed over is filled in from around it, using the picture nearby.
  function healArea(layerId: string, marks: { canvas: HTMLCanvasElement; x: number; y: number }) {
    const layer = current()?.layers.find((l) => l.id === layerId)
    if (layer?.kind !== 'raster') return
    const side = Math.max(marks.canvas.width, marks.canvas.height)
    const margin = Math.min(HEAL_MAX_MARGIN, Math.max(HEAL_MIN_MARGIN, side * 1.5))
    const area = intersectRect(layerBounds(layer), {
      x: Math.floor(marks.x - margin),
      y: Math.floor(marks.y - margin),
      width: Math.ceil(marks.canvas.width + margin * 2),
      height: Math.ceil(marks.canvas.height + margin * 2),
    })
    if (!area) return
    editor.paint(t('Fix spots'), layerId, area, (ctx, l) => healRegion(ctx, l, area, marks))
  }

  // A brush stroke where nothing can be painted on (the page, a shape, text, a locked picture) goes
  // on a new drawing right above what's picked.
  function newDrawingForStroke(): PixelLayer | null {
    const d = current()
    if (!d) return null
    const layer = createLayer(nextLayerName(d.layers), d.width, d.height)
    editor.startDrawing(layer)
    return layer
  }

  // Paints on a new drawing above what's picked, in one undo step.
  function paintNewDrawing(label: string, draw: (ctx: CanvasRenderingContext2D, layer: PixelLayer) => void) {
    const d = current()
    if (!d) return
    const layer = createLayer(nextLayerName(d.layers), d.width, d.height)
    const ctx = getContext2d(layer.canvas)
    ctx.save()
    draw(ctx, layer)
    ctx.restore()
    editor.change(label, (doc) => insertLayerAboveActive(doc, layer), { bytes: canvasBytes(layer.canvas) })
  }

  // The drawing or photo the selected layer is, if pixels can be painted on it right now.
  function drawingTarget(): PixelLayer | null {
    const d = current()
    const layer = d ? activeLayer(d) : undefined
    return layer?.kind === 'raster' && !layer.locked && layer.visible ? layer : null
  }

  function handlePickColor(hex: string) {
    setColor(hex)
    if (tool === 'picker') setToolState(lastDrawToolRef.current)
  }

  function handleMove(session: MoveSession, dx: number, dy: number) {
    const layer = current()?.layers.find((l) => l.id === session.layerId)
    editor.change(session.label, (d) => session.commit(d, dx, dy), { bytes: session.movesSelection && layer ? layerBytes(layer) : 0 })
    fillGapWhenReady(session.layerId, session.gap)
  }

  // A part was put down before the gap it left was filled: the gap is filled in a moment later, as
  // its own step, unless the picture changed in the meantime.
  function fillGapWhenReady(layerId: string, gap: GapFill | null) {
    if (!gap || gap.patch) return
    const layer = current()?.layers.find((l) => l.id === layerId)
    if (layer?.kind !== 'raster') return
    const { canvas } = layer
    const version = pixelVersion(canvas)
    inform(t('AI is filling the gap…'))
    void gap.ready.then((patch) => {
      const now = current()?.layers.find((l) => l.id === layerId)
      if (!patch || now?.kind !== 'raster' || now.canvas !== canvas || pixelVersion(canvas) !== version) return
      setNotice(null)
      editor.paint(t('Fill the gap'), layerId, gap.area, (ctx, l) => {
        // Only the see-through gap is filled; whatever was put down over it stays on top.
        ctx.globalCompositeOperation = 'destination-over'
        ctx.drawImage(patch, gap.area.x - l.x, gap.area.y - l.y)
      })
    })
  }

  // Memory a layer's pixels take, for the undo history.
  function layerBytes(layer: Layer): number {
    return layer.kind === 'raster' ? canvasBytes(layer.canvas) : 0
  }

  function handleSelect(selection: Selection | null, label: string) {
    editor.change(label, (d) => ({ ...d, selection }))
  }

  function handleFill(point: Point) {
    const d = current()
    if (!d) return
    const layer = activeLayer(d)
    // Clicking a shape colors it in, and clicking text colors its letters.
    const shape = layerAt(d, point)
    if (shape?.kind === 'text') {
      editor.select(shape.id)
      editor.change(t('Color text'), (doc) => replaceLayer(doc, { ...shape, style: { ...shape.style, color } }))
      rememberColor(color)
      return
    }
    if (shape?.kind === 'shape' && canFill(shape.geometry)) {
      editor.select(shape.id)
      editor.change(t('Fill shape'), (doc) => updateShape(doc, shape.id, { fill: { kind: 'color', color } }))
      rememberColor(color)
      return
    }
    if (layer && !layer.visible) {
      problem(t('“{name}” is hidden. Click its eye in the Layers panel to show it, then fill again.', { name: layer.name }))
      return
    }
    const target = drawingTarget()
    // On empty paper, with no drawing picked, the bucket colors the page itself.
    if (!target && !d.selection && sampleColor({ ...d, background: null }, point.x, point.y) === null) {
      editor.change(t('Page color'), (doc) => ({ ...doc, background: color }))
      rememberColor(color)
      return
    }
    const pieces = fillArea(d, point, color, Math.round(fillTolerance * 255))
    if (!pieces) return
    const { core, rim } = pieces
    const area = { x: core.x, y: core.y, width: core.canvas.width, height: core.canvas.height }
    const draw = (ctx: CanvasRenderingContext2D, l: PixelLayer) => {
      ctx.drawImage(core.canvas, core.x - l.x, core.y - l.y)
      // The rim slips underneath what's already there, so outlines keep their soft edges.
      ctx.globalCompositeOperation = 'destination-over'
      ctx.drawImage(rim.canvas, rim.x - l.x, rim.y - l.y)
    }
    if (target) editor.paint(t('Fill area'), target.id, area, draw)
    else paintNewDrawing(t('Fill area'), draw)
    rememberColor(color)
  }

  function changeBrushSize(direction: 1 | -1) {
    const update = (state: { settings: BrushSettings; presetId: string | null }) => ({
      ...state,
      settings: { ...state.settings, size: stepBrushSize(state.settings.size, direction) },
    })
    if (tool === 'eraser') setEraser(update)
    else if (tool === 'heal') setHealSize((size) => stepBrushSize(size, direction))
    else setBrush(update)
  }

  function zoomBy(direction: 1 | -1) {
    setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), workspace.width / 2, workspace.height / 2))
  }

  // The selected layer, if it can be changed; otherwise says why not.
  function usableLayer(doing: string): Layer | null {
    const d = current()
    const layer = d && activeLayer(d)
    if (!d) return null
    if (!layer) {
      problem(t('Pick something on your design first, then {doing}.', { doing }))
      return null
    }
    if (!layer.visible) {
      problem(t('“{name}” is hidden. Click its eye in the Layers panel to show it, then {doing} again.', { name: layer.name, doing }))
      return null
    }
    return layer
  }

  // The selected layer, if its pixels can be changed; shapes are changed as a whole instead.
  function paintableLayer(doing: string): PixelLayer | null {
    const layer = usableLayer(doing)
    if (layer && layer.kind !== 'raster') {
      problem(
        layer.kind === 'text'
          ? t("“{name}” is text, so you can't {doing} part of it. Change it with Arrange and the Text panel, or pick a paint layer.", { name: layer.name, doing })
          : t("“{name}” is a shape, so you can't {doing} part of it. Change it with Arrange and the Shape panel, or pick a paint layer.", { name: layer.name, doing }),
      )
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

  // While the magic selection is chosen, the AI gets the design ready ahead of time, a moment after
  // it last changed, so clicks are quick.
  const magicOn = tool === 'select' && selectionShape === 'magic' && !!doc
  useEffect(() => {
    if (!magicOn) return
    const timer = window.setTimeout(() => {
      const d = current()
      if (!d) return
      const { key, picture } = aiPicture(d)
      const stop = onAiProgress((share) =>
        setNotice({ message: t('Getting the magic selection ready. This happens only the first time: {percent}%', { percent: Math.round(share * 100) }), tone: 'info' }),
      )
      prepareThing(key, picture)
        .catch(() => {})
        .finally(stop)
    }, MAGIC_PREPARE_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicOn, editor.revision])

  // Magic selection: AI finds the thing that was clicked (or boxed) in everything that shows.
  async function magicSelect(target: { point: Point } | { box: Rect }, mode: SelectionMode) {
    const d = current()
    if (!d) return
    const { key, width, height, picture } = aiPicture(d)
    const sx = width / d.width
    const sy = height / d.height
    const points = 'point' in target ? [{ x: target.point.x * sx, y: target.point.y * sy, inside: true }] : []
    const box: [number, number, number, number] | undefined =
      'box' in target ? [target.box.x * sx, target.box.y * sy, (target.box.x + target.box.width) * sx, (target.box.y + target.box.height) * sy] : undefined
    setNotice({ message: t('Finding it…'), tone: 'info' })
    const stop = onAiProgress((share) =>
      setNotice({ message: t('Getting the magic selection ready. This happens only the first time: {percent}%', { percent: Math.round(share * 100) }), tone: 'info' }),
    )
    try {
      const found = await findThing(key, picture, points, box)
      const ops = maskToOps(found.mask, found.width, found.height, d.width / found.width, d.height / found.height)
      if (ops.length === 0) {
        problem(t('Nothing was found there. Click right on the thing you want, or drag a box around it.'))
        return
      }
      setNotice(null)
      setSelection(mode === 'add' ? t('Add to selection') : mode === 'subtract' ? t('Remove from selection') : t('Magic select'), (doc) => combineFound(doc.selection, ops, mode))
    } catch {
      problem(t("The magic selection couldn't start. Check that you're online, then try again."))
    } finally {
      stop()
    }
  }

  // Remove background: AI finds the main thing in a photo and everything around it becomes see-through.
  async function removeBackground(layerId: string) {
    const d = current()
    const layer = d?.layers.find((l) => l.id === layerId)
    if (!d || !layer || layer.kind !== 'raster') return
    const source = layer.canvas
    const scale = Math.min(1, AI_PICTURE_SIDE / Math.max(source.width, source.height))
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(1, Math.round(source.height * scale))
    const picture = () => {
      const small = createCanvas(width, height)
      const ctx = small.getContext('2d', { willReadFrequently: true })!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height)
    }
    const key = `layer:${canvasKey(source)}:${layerVersion(layer)}:${width}x${height}`
    setNotice({ message: t('Removing the background…'), tone: 'info' })
    const stop = onAiProgress((share) =>
      setNotice({ message: t('Getting the AI ready. This happens only the first time: {percent}%', { percent: Math.round(share * 100) }), tone: 'info' }),
    )
    try {
      // A box just inside the edges asks for the main thing in the photo.
      const inset = Math.max(1, Math.round(Math.min(width, height) * 0.01))
      const found = await findThing(key, picture, [], [inset, inset, width - inset, height - inset])
      const size = found.width * found.height
      let kept = 0
      for (let i = 0; i < size; i++) kept += found.mask[i] ? 1 : 0
      if (kept < size * 0.005 || kept > size * 0.97) {
        problem(t('The AI could not tell what to keep in this photo. Try Select → Magic: click the thing, then Invert and Delete.'))
        return
      }
      const mask = createCanvas(found.width, found.height)
      const maskCtx = getContext2d(mask)
      const pixels = maskCtx.createImageData(found.width, found.height)
      for (let i = 0; i < size; i++) pixels.data[i * 4 + 3] = found.mask[i] ? 255 : 0
      maskCtx.putImageData(pixels, 0, 0)
      const out = createCanvas(source.width, source.height)
      const ctx = getContext2d(out)
      ctx.drawImage(source, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(mask, 0, 0, source.width, source.height)
      setNotice(null)
      editor.change(t('Remove background'), (next) => {
        const now = next.layers.find((l) => l.id === layerId)
        return now && now.kind === 'raster' && now.canvas === source ? replaceLayer(next, { ...now, canvas: out }) : next
      }, { bytes: canvasBytes(out) })
      inform(t('Background removed. Press Undo if you want it back.'))
    } catch {
      problem(t("Remove background couldn't start. Check that you're online, then try again."))
    } finally {
      stop()
    }
  }

  // The selected part of the selected layer, or a message saying there's nothing there.
  function selectedPiece(): Piece | null {
    const d = current()
    const layer = d && activeLayer(d)
    if (!d) return null
    if (!layer) {
      problem(t('Pick a drawing or photo first (in the Layers panel or with Arrange), then copy part of it.'))
      return null
    }
    const piece = copySelected(layer, d)
    if (!piece || isBlank(piece.canvas)) {
      problem(d.selection ? t('There is nothing in the selected area on “{name}”.', { name: layer.name }) : t('“{name}” is empty, so there is nothing to copy.', { name: layer.name }))
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
      showDocument(createDocumentFromImage(t('Pasted picture'), canvas, canvas.width, canvas.height))
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
    editor.change(t('Paste'), (doc) => ({ ...insertLayerAboveActive(doc, layerFromCanvas(t('Pasted'), copy, x, y)), selection: null }), {
      bytes: canvasBytes(copy),
    })
    setTool('move')
    inform(t('Pasted on a new layer. Drag it to put it where you want.'))
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
    const layer = usableLayer(t('move it'))
    const d = current()
    if (!layer || !d) return
    if (d.selection && layer.kind !== 'raster') {
      problem(t('Only pictures and paint can be moved part by part. To move the whole thing, clear the selection first.'))
      return
    }
    if (!d.selection) {
      editor.change(t('Move layer'), (doc) => startMove(doc)?.commit(doc, dx, dy) ?? doc, { mergeKey })
      return
    }
    // Nudging the same part again keeps going from where it was first picked up, so the gap it
    // left is filled once and nothing of the picture is lost along the way.
    const last = nudgeRef.current
    const going = last && last.layer === layer && last.selection === d.selection && last.fillGap === fillGap
    const session = going ? last.session : startMove(d, fillGap)
    if (!session) return
    const total = { dx: (going ? last.dx : 0) + dx, dy: (going ? last.dy : 0) + dy }
    const put = () => {
      editor.change(session.label, (doc) => session.commit(doc, total.dx, total.dy), { mergeKey, bytes: layerBytes(layer) })
      const now = current()
      const moved = now?.layers.find((l) => l.id === session.layerId)
      nudgeRef.current = moved && now?.selection ? { session, ...total, layer: moved, selection: now.selection, fillGap } : null
    }
    put()
    const { gap } = session
    if (!gap || gap.patch) return
    inform(t('AI is filling the gap…'))
    // Once the gap is filled, the part is put down again the same way, now with the gap filled in,
    // unless something else changed in the meantime.
    void gap.ready.then((patch) => {
      const latest = nudgeRef.current
      const now = current()
      if (!patch || latest?.session !== session || latest.dx !== total.dx || latest.dy !== total.dy) return
      if (now?.selection !== latest.selection || !now.layers.includes(latest.layer)) return
      setNotice(null)
      put()
    })
  }

  // Whole-design changes: the view refits so the whole result is in sight.
  // Size changes apply to every page, so all pages stay the same size; `onePage` keeps a change
  // (like a flip) to the page being worked on.
  function changeWholeDesign(label: string, update: (d: EditorDocument) => EditorDocument, onePage = false) {
    settle()
    const d = current()
    if (!d) return
    const bytes = onePage ? documentBytes(d) : pageDocuments(d).reduce((sum, page) => sum + documentBytes(page), 0)
    editor.change(label, onePage ? update : (doc) => changeEveryPage(doc, update), { bytes })
    const next = current()
    if (next) setViewport(fitted(next, false))
  }

  const layers = {
    select: (layerId: string) => {
      settle()
      pickOne(layerId)
    },
    add: () => {
      settle()
      editor.change(t('New layer'), (d) => insertLayerAboveActive(d, createLayer(nextLayerName(d.layers), d.width, d.height)))
    },
    duplicate: () => {
      settle()
      const d = current()
      const ids = targets()
      if (!d || ids.length === 0) return
      const copies: string[] = []
      const copy = (layer: Layer) => {
        const made = duplicateLayer(layer)
        copies.push(made.id)
        return made
      }
      const bytes = d.layers.reduce((sum, l) => (ids.includes(l.id) ? sum + layerBytes(l) : sum), 0)
      editor.change(ids.length > 1 ? t('Duplicate') : t('Duplicate layer'), (doc) => duplicateLayers(doc, ids, copy, (g) => ({ id: createId('group'), name: t('{name} copy', { name: g.name }) })), { bytes })
      if (copies.length > 1) pickMany(copies)
    },
    remove: () => {
      settle()
      const d = current()
      const ids = targets()
      if (!d || ids.length === 0) return
      const bytes = d.layers.reduce((sum, l) => (ids.includes(l.id) ? sum + layerBytes(l) : sum), 0)
      editor.change(ids.length > 1 ? t('Delete') : t('Delete layer'), (doc) => removeLayers(doc, ids), { bytes })
    },
    move: (direction: 1 | -1) => {
      settle()
      const ids = targets()
      editor.change(direction > 0 ? t('Bring forward') : t('Send backward'), (d) => moveLayersBy(d, ids, direction))
    },
    toEnd: (end: 'front' | 'back') => {
      settle()
      const ids = targets()
      editor.change(end === 'front' ? t('Bring to front') : t('Send to back'), (d) => moveLayersTo(d, ids, end))
    },
    // Picks the page, so the Color panel colors it.
    pickPage: () => {
      settle()
      pickOne('')
      setTool('move')
    },
    seeThrough: (seeThrough: boolean) =>
      editor.change(seeThrough ? t('See-through page') : t('Page color'), (d) => ({ ...d, background: seeThrough ? null : '#ffffff', pageGradient: null })),
    rename: (layerId: string, name: string) => editor.change(t('Rename layer'), (d) => updateLayer(d, layerId, { name })),
    // Changes the opacity of everything picked together with the layer.
    opacity: (layerId: string, opacity: number) => {
      const ids = picked?.includes(layerId) ? picked : [layerId]
      editor.change(t('Change layer opacity'), (d) => ids.reduce((doc, id) => updateLayer(doc, id, { opacity }), d), { mergeKey: `opacity:${ids.join()}` })
    },
    toggleVisibility: (layerId: string) => {
      settle()
      const layer = current()?.layers.find((l) => l.id === layerId)
      if (layer) editor.change(layer.visible ? t('Hide layer') : t('Show layer'), (d) => updateLayer(d, layerId, { visible: !layer.visible }))
    },
    toggleLock: (layerId: string) => {
      const layer = current()?.layers.find((l) => l.id === layerId)
      if (layer) editor.change(layer.locked ? t('Unlock layer') : t('Lock layer'), (d) => updateLayer(d, layerId, { locked: !layer.locked }))
    },
    editAdjust: (layerId: string) => {
      settle()
      editor.select(layerId)
      setTool('adjust')
    },
    // Things kept together: picked, hidden and named as one.
    pickGroup: (groupId: string) => {
      settle()
      const d = current()
      if (!d) return
      if (tool !== 'move') setTool('move')
      pickMany(d.layers.filter((l) => l.group?.id === groupId).map((l) => l.id))
    },
    toggleGroupVisibility: (groupId: string) => {
      settle()
      const members = current()?.layers.filter((l) => l.group?.id === groupId) ?? []
      const visible = !members.some((l) => l.visible)
      editor.change(visible ? t('Show layer') : t('Hide layer'), (d) => members.reduce((doc, l) => updateLayer(doc, l.id, { visible }), d))
    },
    renameGroup: (groupId: string, name: string) =>
      editor.change(t('Rename layer'), (d) => ({ ...d, layers: d.layers.map((l) => (l.group?.id === groupId ? { ...l, group: { id: groupId, name } } : l)) })),
  }

  const pasteHint = t('Press {keys} to paste it as a new layer.', { keys: shortcut('mod', 'V') })

  type ExtraCommands = {
    nudge: (dx: number, dy: number) => void
    pasteFile: (file: File) => void
    openFile: (file: File) => void
    deleteObject: () => void
    // Delete with the Pen: the last point drawn, the picked point, or else the picked shape.
    penDelete: () => void
    hasSelection: () => boolean
    // True while text is being typed, even if the typing box isn't focused (say, after picking a font).
    isTyping: () => boolean
    // Enter and Esc while resizing or cropping.
    applyPending: () => boolean
    cancelPending: () => boolean
  }

  const commands: AppCommands & ExtraCommands = {
    newDesign: () => {
      settle()
      // The dialog opens right away; its suggested name is corrected once the kept designs are read.
      setNewDesignName(nextNumberedName(t('My design'), [], designCount))
      setDialog('new')
      void savedNames().then((names) => setNewDesignName(nextNumberedName(t('My design'), names, designCount)))
    },
    readyLayouts: () => {
      settle()
      setLayoutsKind('all')
      setLayoutsStart(undefined)
      setDialog('layouts')
    },
    open: () => pickFile('open'),
    addPhoto: () => {
      if (current()) pickFile('place')
    },
    addText: (kind) => {
      if (current()) addText(kind)
    },
    colorPage: () => {
      if (current()) layers.pickPage()
    },
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
    downloadPdf: () => {
      settle()
      if (!current()) return
      setExportFormat('pdf')
      setDialog('export')
    },
    downloadSvg: () => {
      settle()
      if (!current()) return
      setExportFormat('svg')
      setDialog('export')
    },
    renameDesign: () => {
      if (current()) setDialog('rename')
    },
    installApp: () => void app.install(),
    close: () =>
      void leaveDesign(() => {
        editor.close()
        autosave.stop()
      }),
    // Undo waits until a stroke is finished, so it never pulls pixels out from under the brush.
    // While resizing or cropping, it first takes back the unapplied change.
    undo: () => {
      if (strokeActiveRef.current) return
      // While drawing with the Pen, undo takes back the last point.
      if (tool === 'pen' && pen.removeLast()) return
      finishText()
      if (transformChanged) return cancelTransform()
      if (cropChanged) return setCropEdit(null)
      if (adjustChanged) return cancelAdjust()
      editor.undo()
    },
    redo: () => {
      if (pen.drawing) return
      if (strokeActiveRef.current || transformChanged || cropChanged || adjustChanged) return
      finishText()
      editor.redo()
    },
    copy: () => {
      settle()
      const piece = selectedPiece()
      if (!piece) return
      setClipboard(piece)
      inform(t('Copied. {hint}', { hint: pasteHint }))
    },
    cut: () => {
      settle()
      const d = current()
      if (!d?.selection) {
        problem(t('Select an area first, with the Select tool.'))
        return
      }
      const layer = paintableLayer(t('cut'))
      const area = editArea(d)
      const piece = layer && selectedPiece()
      if (!layer || !piece || !area) return
      setClipboard(piece)
      editor.paint(t('Cut'), layer.id, area, (ctx, l) => clearSelected(ctx, l, d))
      inform(t('Cut. {hint}', { hint: pasteHint }))
    },
    paste: () => {
      settle()
      const piece = getClipboard()
      if (piece) pastePiece(piece)
      else problem(t('Nothing to paste yet. Copy part of your design first, or copy a picture in another program and press {keys}.', { keys: shortcut('mod', 'V') }))
    },
    pasteFile: (file) => void pasteFile(file),
    openFile: (file) => void openFile(file),
    selectAll: () => {
      settle()
      if (current()) setSelection(t('Select all'), (d) => selectAll(d.width, d.height))
    },
    deselect: () => {
      settle()
      if (current()?.selection) setSelection(t('Deselect'), () => null)
    },
    invert: () => {
      settle()
      if (current()) setSelection(t('Invert selection'), (d) => invertSelection(d.selection, d.width, d.height))
    },
    fill: () => {
      settle()
      const d = current()
      const area = d && editArea(d)
      if (!d || !area) return
      // On a drawing or photo, it fills there; otherwise on a new drawing.
      const layer = drawingTarget()
      if (layer) editor.paint(t('Fill with color'), layer.id, area, (ctx, l) => fillSelected(ctx, l, d, color))
      else paintNewDrawing(t('Fill with color'), (ctx, l) => fillSelected(ctx, l, d, color))
      rememberColor(color)
    },
    deleteArea: () => {
      settle()
      const d = current()
      if (!d?.selection) {
        problem(t('Select an area first, with the Select tool. To remove a whole layer, use Delete layer.'))
        return
      }
      const layer = paintableLayer(t('delete'))
      const area = editArea(d)
      if (layer && area) editor.paint(t('Delete selected area'), layer.id, area, (ctx, l) => clearSelected(ctx, l, d))
    },
    toNewLayer: () => {
      settle()
      const d = current()
      const layer = d && activeLayer(d)
      const piece = selectedPiece()
      if (!layer || !piece) return
      editor.change(
        t('Copy to new layer'),
        (doc) => ({ ...insertLayerAboveActive(doc, layerFromCanvas(t('{name} copy', { name: layer.name }), piece.canvas, piece.x, piece.y)), selection: null }),
        { bytes: canvasBytes(piece.canvas) },
      )
    },
    center: () => {
      settle()
      const many = manyIn(current())
      if (many) {
        const before = current()
        editor.change(t('Center on design'), (doc) => centerTogether(doc, many))
        if (current() === before) inform(t('They are already in the middle.'))
        return
      }
      const layer = usableLayer(t('center it'))
      const d = current()
      if (!d || !layer) return
      const box = arrangeBox(layer)
      const bounds = d.selection ? selectionInfo(d.selection, d.width, d.height).bounds : box && polygonBounds(boxCorners(box))
      if (!bounds) {
        problem(t('“{name}” is empty, so there is nothing to center.', { name: layer.name }))
        return
      }
      const dx = Math.round((d.width - bounds.width) / 2 - bounds.x)
      const dy = Math.round((d.height - bounds.height) / 2 - bounds.y)
      if (dx === 0 && dy === 0) inform(t('It is already in the middle.'))
      else moveBy(dx, dy)
    },
    nudge: (dx, dy) => {
      const many = manyIn(current())
      if (many) editor.change(t('Move'), (d) => moveTogether(d, many, dx, dy), { mergeKey: 'nudge' })
      else moveBy(dx, dy, 'nudge')
    },
    hasSelection: () => !!current()?.selection,
    penDelete: () => {
      if (pen.removeLast() || pen.deletePoint()) return
      commands.deleteObject()
    },
    isTyping: () => textEditRef.current !== null,
    deleteObject: () => {
      if (manyIn(current())) return layers.remove()
      const layer = usableLayer(t('delete it'))
      if (!layer) return
      if (layer.locked) {
        problem(t('“{name}” is locked. Click its lock in the Layers panel to unlock it first.', { name: layer.name }))
        return
      }
      layers.remove()
    },
    applyPending: () => {
      if (tool === 'pen' && pen.finish()) return true
      if (transformChanged) return applyTransform(), true
      if (pickedText && tool === 'move' && !doc?.selection && !picked) return editText(pickedText.id, 'all'), true
      if (tool === 'crop' && cropChanged) return applyCrop(), true
      if (adjustChanged) return applyAdjust(), true
      return false
    },
    cancelPending: () => {
      if (textEditRef.current) return finishText(), true
      if (tool === 'pen' && pen.finish()) return true
      if (transformChanged) return cancelTransform(), true
      if (photoMoving) return setPhotoMoving(false), true
      if (picked) return pickOne(''), true
      if (tool === 'crop' && cropChanged) return setCropEdit(null), true
      if (adjustChanged) return cancelAdjust(), true
      return false
    },
    pageLayout: () => {
      settle()
      if (current()) setDialog('layout')
    },
    resizeDesign: () => {
      settle()
      if (current()) setDialog('resize')
    },
    cropToSelection: () => {
      const d = current()
      const bounds = d?.selection && selectionInfo(d.selection, d.width, d.height).bounds
      if (!bounds) {
        problem(t('Select an area first, with the Select tool.'))
        return
      }
      settle()
      editor.change(t('Crop to selection'), (doc) => changeEveryPage({ ...doc, selection: null }, (page) => cropDocument(page, bounds)))
      setViewport((v) => ({ ...v, panX: v.panX + bounds.x * v.zoom, panY: v.panY + bounds.y * v.zoom }))
    },
    rotateDesign: (direction) => changeWholeDesign(direction > 0 ? t('Turn design right') : t('Turn design left'), (d) => rotateDocument(d, direction)),
    flipDesign: (axis) =>
      changeWholeDesign(axis === 'horizontal' ? t('Flip design left to right') : t('Flip design upside down'), (d) => flipDocument(d, axis), true),
    addPage: () => {
      settle()
      editor.change(t('Add page'), (d) => addPage(d))
      // Like a new design, the empty page starts on Arrange with its first steps showing.
      setTool('move')
    },
    copyPage: () => {
      settle()
      const d = current()
      if (!d) return
      editor.change(t('Copy page'), (doc) => addPage(doc, true), { bytes: documentBytes(d) })
    },
    everyPage: () => {
      settle()
      const d = current()
      const active = d && activeLayer(d)
      if (!d || !active) return
      const on = !active.everyPage
      editor.change(on ? t('Show on every page') : t('Only on this page'), (doc) => setOnEveryPage(doc, targets(), on))
      inform(on ? t('It’s on every page now. Change it on any page and it changes on all of them.') : t('It’s on this page only now.'))
    },
    pageNumbers: () => {
      settle()
      const d = current()
      if (!d || hasPageNumbers(d)) return
      const style: TextStyle = { ...newTextStyle(d), size: textSizeFor(d.width, d.height, 0.03), align: 'center' }
      const margin = d.layout?.margin ?? 0
      const y = margin > style.size * 2 ? d.height - margin / 2 : d.height - style.size * 1.5
      const fitted = fitText(textObject(style, newTextBox({ x: d.width / 2, y }, style), '1', false))
      const layer: TextLayer = { ...fitted, name: t('Page number'), pageNumber: true, everyPage: createId('every'), box: { ...fitted.box, cx: d.width / 2, cy: y } }
      editor.change(t('Add page numbers'), (doc) => ({ ...insertLayerAboveActive(doc, layer), selection: null }))
      setTool('move')
      inform(t('Page numbers are on every page. Move one or change its look, and all of them follow.'))
    },
    deletePage: () => {
      settle()
      editor.change(t('Delete page'), (d) => removePage(d))
    },
    movePage: (direction) => {
      settle()
      editor.change(t('Move page'), (d) => movePage(d, direction))
    },
    goToPage: (direction) => {
      const d = current()
      if (!d) return
      settle()
      editor.goToPage(pageIndex(d) + direction)
    },
    layerAdd: layers.add,
    layerDuplicate: layers.duplicate,
    layerUp: () => layers.move(1),
    layerDown: () => layers.move(-1),
    layerToFront: () => layers.toEnd('front'),
    layerToBack: () => layers.toEnd('back'),
    layerToggle: () => activeNow && layers.toggleVisibility(activeNow.id),
    layerDelete: layers.remove,
    keepTogether: organize.keepTogether,
    takeApart: organize.takeApart,
    tidyUp: organize.tidyUp,
    lineUp: organize.lineUp,
    spreadOut: organize.spreadOut,
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
    showEffects: () => {
      if (!current()) return
      if (tool !== 'move' && tool !== 'shape' && tool !== 'text') setTool('move')
      setEffectsOpen(true)
    },
    removeBackground: () => {
      const layer = current() && activeLayer(current()!)
      if (layer?.kind === 'raster') void removeBackground(layer.id)
    },
  }

  const actions = buildActions(
    {
      doc,
      undoLabel: editor.undoLabel,
      redoLabel: editor.redoLabel,
      app,
      organize: { keepTogether: keepTogetherBlocker(doc), takeApart: pickedGroups(doc).length === 0 ? t('Pick something kept together first.') : null, picked },
    },
    commands,
  )

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
        // Stops some browsers from jumping to their own menu bar when Alt is let go (but never
        // while typing, where Alt can switch keyboard languages or make letters).
        if (hasDoc && !dialogOpen && !isTypingTarget(event.target)) event.preventDefault()
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

      // Keys that change objects never act on the text being typed, even when the typing box lost
      // focus to a panel.
      if (c.isTyping() && (code === 'Delete' || code === 'Backspace' || ARROWS[event.key])) return

      let action: (() => unknown) | undefined
      if (mod && code === 'KeyK') action = c.search
      else if (plain && event.key === '/') action = c.search
      else if (mod && event.altKey && code === 'KeyN') action = c.newDesign
      else if (mod && event.shiftKey && code === 'KeyO' && hasDoc) action = c.addPhoto
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
      else if (mod && code === 'KeyG' && hasDoc) action = event.shiftKey ? c.takeApart : c.keepTogether
      else if (event.altKey && !mod && code === 'Backspace' && hasDoc) action = c.fill
      else if (plain && (code === 'Delete' || code === 'Backspace') && hasDoc && currentTool === 'pen') action = c.penDelete
      else if (plain && (code === 'Delete' || code === 'Backspace') && c.hasSelection()) action = c.deleteArea
      else if (plain && (code === 'Delete' || code === 'Backspace') && hasDoc && currentTool === 'move') action = c.deleteObject
      else if (code === 'Escape' && c.hasSelection()) action = c.deselect
      else if (!mod && !event.altKey && ARROWS[event.key] && hasDoc && currentTool === 'move') {
        const step = event.shiftKey ? 10 : 1
        const [dx, dy] = ARROWS[event.key]
        action = () => c.nudge(dx * step, dy * step)
      } else if (mod && (code === 'Equal' || code === 'NumpadAdd') && hasDoc) action = c.zoomIn
      else if (mod && (code === 'Minus' || code === 'NumpadSubtract') && hasDoc) action = c.zoomOut
      else if (mod && event.altKey && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.actualSize
      else if (mod && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.fit
      else if (mod && code === 'BracketRight' && hasDoc) action = event.shiftKey ? c.layerToFront : c.layerUp
      else if (mod && code === 'BracketLeft' && hasDoc) action = event.shiftKey ? c.layerToBack : c.layerDown
      else if (plain && code === 'PageDown' && hasDoc) action = () => c.goToPage(1)
      else if (plain && code === 'PageUp' && hasDoc) action = () => c.goToPage(-1)
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

  // The installed app can open pictures and projects double-clicked on the computer.
  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue
    queue?.setConsumer((params) => {
      const handle = params.files?.[0]
      if (handle && 'getFile' in handle) void handle.getFile().then((file) => commandsRef.current.openFile(file))
    })
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
    if (file) void dropFile(file, event.clientX, event.clientY)
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

  const paintSettings = tool === 'eraser' ? eraser.settings : tool === 'heal' ? { ...brush.settings, size: healSize } : brush.settings
  const hintTool: ToolId = spaceHeld ? 'hand' : altHeld && tool === 'brush' ? 'picker' : tool
  const hintExtra =
    doc?.selection && (hintTool === 'brush' || hintTool === 'eraser' || hintTool === 'adjust')
      ? t('Only the selected area changes.')
      : doc?.selection && hintTool === 'move' && activeNow?.kind === 'raster' && fillGap
        ? t('Drag the selected part to move it. On a photo, AI fills the gap it leaves.')
        : doc?.selection && hintTool === 'move'
        ? t('The selected part moves.')
        : photoMoveOn
          ? t('Drag on the shape to slide its photo.')
          : undefined

  const box: BoxEditing | null =
    tool === 'move' && transform
      ? {
          kind: 'transform',
          value: transform.box,
          keepProportions,
          edges: true,
          onChange: setTransformBox,
          onRelease: (final) => applyTransform(final),
        }
      : tool === 'crop' && crop
        ? {
            kind: 'crop',
            value: crop.box,
            keepProportions: crop.shape !== 'free',
            edges: crop.shape === 'free',
            onChange: (next) => setCrop(tidyCropBox(next), crop.shape),
          }
        : null

  const override: LayerOverride | null =
    textEdit && !textEdit.isNew
      ? { layerId: textEdit.layer.id, layer: { ...textEdit.layer, visible: false } }
      : fontPreviewLayer
      ? { layerId: fontPreviewLayer.id, layer: fontPreviewLayer }
      : tool === 'move' && transform && transformChanged
      ? { layerId: transform.session.layerId, parts: transformParts(transform.session, transform.box) }
      : adjustPreview && !comparing
        ? adjustPreview
        : null

  // The Arrange bar: the selected part, or the selected object, or why nothing can be arranged.
  const arrangeBar = ((): ArrangeBarControls => {
    const base = {
      keepProportions,
      onKeepProportions: setKeepProportions,
      center: commands.center,
      forward: () => layers.move(1),
      backward: () => layers.move(-1),
      remove: commands.deleteObject,
      unlock: () => activeNow && layers.toggleLock(activeNow.id),
      flip: () => {},
      rotate90: () => {},
      keepTogether: organize.keepTogether,
      takeApart: organize.takeApart,
      tidyUp: organize.tidyUp,
      lineUp: organize.lineUp,
      spreadOut: organize.spreadOut,
      kept: false,
      locked: false,
      blocked: null,
      target: null,
      fillGap,
      onFillGap: setFillGap,
      ppi: doc ? documentPpi(doc) : DEFAULT_PPI,
    }
    const degrees = (box: TransformBox) => Math.round((normalizeAngle(box.rotation) * 180) / Math.PI)
    // Its size and top-left corner before turning, as shown in the boxes.
    const readBox = (box: TransformBox) => ({ width: Math.abs(box.width), height: Math.abs(box.height), x: box.cx - Math.abs(box.width) / 2, y: box.cy - Math.abs(box.height) / 2 })
    const describeTyped = (change: BoxChange) => (change.angle !== undefined ? t('Turn') : change.width !== undefined || change.height !== undefined ? t('Resize') : t('Move'))
    if (!doc) return { ...base, blocked: t('Click anything on your design to pick it.') }
    if (!activeNow) return { ...base, blocked: t('The page is picked: choose its color in the Color panel. Click anything on your design to pick it.') }
    if (doc.selection) {
      if (!transform) {
        const blocked =
          activeNow.kind !== 'raster'
            ? activeNow.kind === 'text'
              ? t('Text moves as a whole. Press {keys} to clear the selection, then drag it.', { keys: shortcut('mod', 'D') })
              : t('Shapes move as a whole. Press {keys} to clear the selection, then drag it.', { keys: shortcut('mod', 'D') })
            : t('There is nothing in the selected area on “{name}”.', { name: activeNow.name })
        return { ...base, blocked }
      }
      const part = transform.box
      return {
        ...base,
        target: { kind: 'part', name: activeNow.name, ...readBox(part), angle: degrees(part), place: (change) => applyTransform(changeBox(part, change, keepProportions)) },
        flip: (axis) => applyTransform(flipBox(part, axis)),
        rotate90: (direction) => applyTransform(rotateBox90(part, direction)),
      }
    }
    const frame = picked && frameOf(doc.layers.filter((l) => picked.includes(l.id) && l.visible))
    if (picked && frame) {
      const groups = pickedGroups(doc)
      // Exactly one thing kept together is picked, so it's called by its name.
      const one = groups.length === 1 && thingCount(doc, picked) === 1
      const name = one ? (doc.layers.find((l) => l.group?.id === groups[0])?.group?.name ?? '') : t('{count} things', { count: thingCount(doc, picked) })
      const placeAll = (to: TransformBox, label: string) => placeMany(picked, frame, to, label)
      return {
        ...base,
        kept: groups.length > 0,
        target: { kind: one ? 'group' : 'many', name, ...readBox(frame), angle: 0, place: (change) => placeAll(changeBox(frame, change, keepProportions), describeTyped(change)) },
        flip: (axis) => placeAll(flipBox(frame, axis), axis === 'horizontal' ? t('Flip left to right') : t('Flip upside down')),
        rotate90: (direction) => placeAll(rotateBox90(frame, direction), direction > 0 ? t('Turn right') : t('Turn left')),
        combine: (mode) => combineShapes(picked, mode),
        combineBlocked: combineProblem(doc, picked),
      }
    }
    if (!activeNow.visible) return { ...base, blocked: t('“{name}” is hidden. Click its eye in the Layers panel to show it.', { name: activeNow.name }) }
    if (activeNow.locked) return { ...base, locked: true, blocked: t("“{name}” is locked, so it doesn't move by accident.", { name: activeNow.name }) }
    const objectBox = arrangeBox(activeNow)
    if (!objectBox) return { ...base, blocked: t('There is nothing on “{name}” yet. Paint something, or click something else on your design to pick it.', { name: activeNow.name }) }
    return {
      ...base,
      target: {
        kind: 'object',
        name: activeNow.name,
        ...readBox(objectBox),
        angle: degrees(objectBox),
        place: (change) => placeLayer(activeNow.id, changeBox(objectBox, change, keepProportions), describeTyped(change)),
      },
      flip: (axis) => placeLayer(activeNow.id, flipBox(objectBox, axis), axis === 'horizontal' ? t('Flip left to right') : t('Flip upside down')),
      rotate90: (direction) => placeLayer(activeNow.id, rotateBox90(objectBox, direction), direction > 0 ? t('Turn right') : t('Turn left')),
      removeBackground: activeNow.kind === 'raster' ? () => void removeBackground(activeNow.id) : undefined,
    }
  })()

  const arrangeControls: ArrangeControls | null =
    tool === 'move' && doc && !doc.selection
      ? {
          keepProportions,
          picked,
          onPick: pickOne,
          onPickMany: pickMany,
          onToggle: togglePicked,
          onPlace: placeLayer,
          onPlaceMany: placeMany,
        }
      : null

  const shapeDrawing: ShapeDrawing | null =
    tool === 'shape' && doc
      ? {
          draft: (b) => newShape(b, []),
          onDraw: drawNewShape,
          onPick: (layerId) => {
            editor.select(layerId)
            setTool('move')
          },
        }
      : null

  const textTool: TextTool | null = tool === 'text' && doc ? { onNew: newTextAt, onEdit: editText } : null
  const textEditing: TextEditing | null = textEdit
    ? {
        layer: textEdit.layer,
        caret: textEdit.caret,
        onChange: (text, spans) => updateTextEdit((layer) => changeText(layer, { text, spans })),
        onSelect: (start, end) => setTextPick({ start, end }),
        onDone: finishText,
      }
    : null
  // How the picked words look, for the Text and Color panels (a setting they don't share keeps the
  // whole text's).
  const pickedWords = textEdit && textPick && textPick.end > textPick.start ? textPick : null
  const textShown: TextStyle | null = textTarget
    ? pickedWords
      ? { ...textTarget.style, ...sharedStyle(textTarget.spans, textTarget.style, pickedWords.start, pickedWords.end) }
      : textTarget.style
    : null

  // The color the Color panel shows and changes: the text's, a shape's, the page's (when it's
  // picked with Arrange), or the painting color.
  // With a gradient on the letters (and no words picked), the Color panel colors its chosen stop.
  const textGradient = textPanelOn && !pickedWords ? ((textShown ?? textDefaults).gradient ?? null) : null
  const textColor = textPanelOn ? (textGradient ? textGradient.stops[Math.min(gradientStop, textGradient.stops.length - 1)].color : (textShown?.color ?? textDefaults.color)) : null
  const pageColorOn = !!doc && !activeNow && tool === 'move' && !textEdit
  const effectColorShown = effectTarget ? (effectsLayer?.effects?.[effectTarget]?.color ?? null) : null
  // With several things picked, the Shape and Text panels change all the shapes or texts among them.
  const pickedShapes = picked && doc ? doc.layers.filter((l) => picked.includes(l.id) && l.kind === 'shape').length : 0
  const pickedTexts = picked && doc ? doc.layers.filter((l) => picked.includes(l.id) && l.kind === 'text').length : 0
  // With several things picked, it colors every shape and text among them.
  const manyColored = picked && doc && !textEdit ? [...doc.layers].reverse().filter((l) => picked.includes(l.id) && (l.kind === 'shape' || l.kind === 'text')) : []
  const manyColor = manyColored.length > 0 ? colorOfThing(manyColored[0], shapeTarget, color) : null
  const pageGradient = pageColorOn && doc?.background ? (doc.pageGradient ?? null) : null
  const pageShownColor = pageGradient ? pageGradient.stops[Math.min(gradientStop, pageGradient.stops.length - 1)].color : (doc?.background ?? '#ffffff')
  // Dots on the design for turning a straight gradient: on the picked shape, or on the picked page.
  const gradientHandles = ((): { box: TransformBox; gradient: Gradient; onChange: typeof changeGradient } | null => {
    if (!doc || tool !== 'move' || textEdit || transformChanged || adjustOn) return null
    if (editingShape && !(picked && picked.length > 1) && editingShape.fill.kind === 'gradient' && editingShape.fill.gradient.type === 'linear' && !isLineShape(editingShape.geometry)) {
      return { box: editingShape.box, gradient: editingShape.fill.gradient, onChange: changeGradient }
    }
    if (pickedText && !(picked && picked.length > 1) && pickedText.style.gradient?.type === 'linear') {
      return { box: pickedText.box, gradient: pickedText.style.gradient, onChange: changeTextGradient }
    }
    if (pageGradient && pageGradient.type === 'linear') {
      return { box: { cx: doc.width / 2, cy: doc.height / 2, width: doc.width, height: doc.height, rotation: 0 }, gradient: pageGradient, onChange: changePageGradient }
    }
    return null
  })()
  const panelColor = effectColorShown ?? textColor ?? shapeColor ?? manyColor ?? (pageColorOn ? pageShownColor : null)
  const onPanelColor =
    effectColorShown !== null
      ? colorEffect
      : manyColor !== null
      ? colorMany
      : textColor !== null
      ? (hex: string) => {
          rememberColor(hex)
          if (textGradient) {
            const index = Math.min(gradientStop, textGradient.stops.length - 1)
            changeTextGradient({ ...textGradient, stops: textGradient.stops.map((s, i) => (i === index ? { ...s, color: hex } : s)) }, t('Gradient color'), `text-gradient-color-${index}`)
          } else changeTextStyle({ color: hex }, t('Text color'), 'text-color')
        }
      : shapeColor !== null
        ? colorShape
        : pageColorOn
          ? (hex: string) => {
              rememberColor(hex)
              if (pageGradient) {
                const index = Math.min(gradientStop, pageGradient.stops.length - 1)
                changePageGradient({ ...pageGradient, stops: pageGradient.stops.map((s, i) => (i === index ? { ...s, color: hex } : s)) }, t('Gradient color'), `page-gradient-color-${index}`)
              } else editor.change(t('Page color'), (d) => ({ ...d, background: hex }), { mergeKey: 'page-color' })
            }
          : setColor

  // Changing a color everywhere: the Color panel shows it, and every pick changes it in the whole design.
  const recolorOn = recolor && doc && doc.id === recolor.before.id && doc.activeLayerId === recolor.activeLayerId && tool === recolor.tool && !textEdit ? recolor : null
  const recolorLabel = t('Change color everywhere')
  function recolorTo(hex: string) {
    if (!recolorOn) return
    const { before, from, key } = recolorOn
    editor.change(recolorLabel, (d) => goToPage(recolorEverywhere(before, from, hex), pageIndex(d)), { mergeKey: key, mergeAlways: true })
    setRecolor({ ...recolorOn, now: hex, changed: true })
  }
  const designColorsShown: DesignColors | undefined = doc
    ? {
        colors: designColors(doc),
        uses: (hex) => colorUses(doc, hex),
        onKeep: (hex) => editor.change(t('Keep color'), (d) => keepColor(d, hex)),
        onForget: (hex) => editor.change(t('Stop keeping color'), (d) => forgetColor(d, hex)),
        changing: recolorOn ? recolorOn.now : null,
        onStartChange: (hex) => {
          const d = current()
          if (d) setRecolor({ from: hex, now: hex, before: d, key: createId('recolor'), activeLayerId: d.activeLayerId, tool, changed: false })
        },
        onDone: () => setRecolor(null),
        onPutBack: () => {
          if (recolorOn?.changed && editor.undoLabel === recolorLabel) editor.undo()
          setRecolor(null)
        },
      }
    : undefined

  return (
    <div className="flex h-full select-none flex-col" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <TopBar
        actions={actions}
        documentName={doc?.name ?? null}
        saveStatus={autosave.status}
        saveProblem={autosave.problem}
        onRename={commands.renameDesign}
        undoLabel={transformChanged ? t('Resize changes') : cropChanged ? t('Crop frame') : adjustChanged ? t('Adjustments') : editor.undoLabel}
        redoLabel={transformChanged || cropChanged || adjustChanged ? null : editor.redoLabel}
        onUndo={commands.undo}
        onRedo={commands.redo}
        onSearch={commands.search}
        onDownload={commands.download}
      />

      {/* Before a design is open there is nothing to use the tools on, so only the start screen shows. */}
      {doc && <ToolOptions
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
        arrange={arrangeBar}
        shapeType={shapeDefaults.geometry.type}
        pen={{
          drawing: pen.drawing,
          pointCount: pen.pointCount,
          canClose: pen.canClose,
          selectedPoint: pen.selectedPoint,
          finish: pen.finish,
          close: pen.close,
          removeLast: pen.removeLast,
          setSmooth: (smooth) => pen.selectedPoint && pen.selectedPoint.smooth !== smooth && pen.toggleSmooth(),
          deletePoint: pen.deletePoint,
        }}
        onShapeTypeChange={(type) => setShapeDefaults((d) => ({ ...d, geometry: { ...d.geometry, type } }))}
        onAddText={commands.addText}
        crop={{
          width: crop ? cropRect(crop.box).width : 0,
          height: crop ? cropRect(crop.box).height : 0,
          ppi: doc ? documentPpi(doc) : DEFAULT_PPI,
          shape: crop?.shape ?? 'free',
          onShape: changeCropShape,
          changed: cropChanged,
          apply: applyCrop,
          reset: () => setCropEdit(null),
        }}
        adjust={{
          target: doc && activeNow ? (doc.selection ? t('Changes the selected part of “{name}”', { name: activeNow.name }) : t('Changes “{name}”', { name: activeNow.name })) : null,
          blocked: adjustBlocked,
          changed: adjustChanged,
          comparing,
          onCompare: setComparing,
          apply: applyAdjust,
          cancel: cancelAdjust,
        }}
        fillTolerance={fillTolerance}
        onFillToleranceChange={setFillTolerance}
        healSize={healSize}
        onHealSizeChange={setHealSize}
      />}

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        {doc && <ToolDock tool={tool} onToolChange={setTool} onAddPhoto={commands.addPhoto} />}

        <main
          ref={workspaceRef}
          // The start screen sits on the bright room itself; the table with its dots appears with a design.
          className={`relative min-w-0 flex-1 overflow-hidden ${doc ? 'rounded-card border border-line bg-workspace shadow-card' : ''}`}
          style={doc ? DOT_BACKGROUND : undefined}
        >
          {doc ? (
            <>
              <CanvasView
                doc={shownDoc ?? doc}
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
                onHeal={healArea}
                onNewDrawing={newDrawingForStroke}
                onStrokeCancelled={() => editor.cancelDrawing()}
                onStrokeActiveChange={(activeStroke) => (strokeActiveRef.current = activeStroke)}
                onPickColor={handlePickColor}
                onMove={handleMove}
                fillGap={fillGap}
                onSelect={handleSelect}
                onMagicSelect={(target, mode) => void magicSelect(target, mode)}
                onBlocked={problem}
                override={override}
                box={box}
                onFill={handleFill}
                onCompareChange={(on) => setComparing(on && adjustChanged)}
                arrange={arrangeControls}
                shapes={shapeDrawing}
                pen={tool === 'pen' ? pen : null}
                onEditShape={editPoints}
                photoMove={
                  photoMoveOn
                    ? { onMove: (_id, x, y) => setPhotoFill({ x, y }, t('Move photo')) }
                    : null
                }
                textTool={textTool}
                textEditing={textEditing}
                onEditText={editText}
              />
              {gradientHandles && <GradientHandles {...gradientHandles} viewport={viewport} />}
              {doc.layers.length === 0 && tool === 'move' && !textEdit ? (
                <StartHere
                  onAddWords={() => addText('heading')}
                  onAddPhoto={commands.addPhoto}
                  onAddShape={() => setTool('shape')}
                  onDraw={() => setTool('brush')}
                />
              ) : (
                <ToolHint tool={hintTool} extra={hintExtra} />
              )}
              <ZoomControls
                zoom={viewport.zoom}
                onZoomIn={commands.zoomIn}
                onZoomOut={commands.zoomOut}
                onActualSize={commands.actualSize}
                onFit={commands.fit}
              />
              <DesignInfo doc={doc} cursor={cursor} />
              <PagesBar
                doc={doc}
                revision={editor.revision}
                onGoTo={(index) => {
                  settle()
                  editor.goToPage(index)
                }}
                onAdd={commands.addPage}
                onCopy={commands.copyPage}
                onMove={commands.movePage}
                onDelete={commands.deletePage}
                everyPage={{
                  label: activeLayer(doc)?.everyPage ? t('Only on this page') : t('Show on every page'),
                  disabled: !activeLayer(doc) || !canBeOnEveryPage(activeLayer(doc)!),
                  run: commands.everyPage,
                }}
                pageNumbers={{ disabled: hasPageNumbers(doc), run: commands.pageNumbers }}
              />
            </>
          ) : (
            <WelcomeScreen
              onPreset={createFromPreset}
              onCustom={commands.newDesign}
              onOpen={commands.open}
              onOpenDesign={openSaved}
              onLayouts={(kind, layoutId) => {
                setLayoutsKind(kind)
                setLayoutsStart(layoutId)
                setDialog('layouts')
              }}
            />
          )}
          {dropActive && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80">
              <p className="text-[15px] font-medium text-accent">
                {doc ? t('Drop a picture to add it, or drop it onto a shape to fill the shape') : t('Drop your picture or project to open it')}
              </p>
            </div>
          )}
        </main>

        <div className={`hidden w-[288px] shrink-0 flex-col gap-3 ${doc ? 'md:flex' : ''}`}>
          {/* The panels for what is picked take the room they need, up to about two thirds of the
              column (then they scroll); the Layers panel always keeps the rest, so it never slips
              off a short screen. */}
          <ScrollRegion className="max-h-[64%] shrink-0 gap-3 [@media(max-height:820px)]:max-h-[56%]">
            {adjustOn && doc ? (
              <AdjustPanel settings={adjustments} thumbnails={lookPictures} blocked={adjustBlocked} onChange={setAdjustments} />
            ) : (
              <ColorPanel
                color={recolorOn ? recolorOn.now : (panelColor ?? color)}
                recent={recentColors}
                onChange={recolorOn ? recolorTo : onPanelColor}
                onPickFromDesign={() => setTool('picker')}
                design={designColorsShown}
              />
            )}
            {textPanelOn && !adjustOn && doc && (
              <TextPanel
                title={pickedTexts > 1 && !textEdit ? t('{count} texts', { count: pickedTexts }) : textTarget ? textTarget.name || t('Text') : t('New text')}
                style={textShown ?? { ...textDefaults, size: textDefaults.size ?? textSizeFor(doc.width, doc.height, 0.08) }}
                scope={textEdit ? (pickedWords ? 'words' : 'all') : null}
                wrap={textTarget?.wrap ?? false}
                hasRtl={!!textTarget && hasRtlLetters(textTarget.text)}
                sample={fontSample(textTarget?.text ?? '')}
                resolvedAlign={textTarget ? resolveAlign(textTarget.style.align, textLayout(textTarget).direction) : 'left'}
                onFont={(id) => void changeFont(id)}
                onPreviewFont={previewFont}
                onStyle={changeTextStyle}
                onWrap={changeWrap}
                onFillKind={changeTextFillKind}
                onGradient={changeTextGradient}
                gradientStop={gradientStop}
                onGradientStop={setGradientStop}
                flow={textTarget?.flow && doc ? { box: textTarget.flow.index + 1, boxes: storyBoxes(doc, textTarget).length } : null}
                onContinue={pickedText && !pickedText.everyPage && !textEdit && pickedTexts <= 1 ? continueInAnotherBox : undefined}
                styles={textStyleControls}
              />
            )}
            {pageColorOn && !adjustOn && doc && (
              <PagePanel
                gradient={pageGradient}
                onFillKind={changePageFillKind}
                onGradient={changePageGradient}
                gradientStop={gradientStop}
                onGradientStop={setGradientStop}
              />
            )}
            {shapeShown && !adjustOn && (
              <ShapePanel
                title={pickedShapes > 1 ? t('{count} shapes', { count: pickedShapes }) : editingShape ? editingShape.name : t('New shapes')}
                editing={editingShape !== null}
                geometry={shapeShown.geometry}
                fill={shapeShown.fill}
                outline={shapeShown.outline}
                colorTarget={shapeTarget}
                onColorTarget={(target) => {
                  setEffectColor(null)
                  setColorTarget(target)
                }}
                onGeometry={changeGeometry}
                onNoFill={() => changeShape(t('No fill'), () => ({ fill: { kind: 'none' } }), (d) => ({ ...d, fill: null, gradient: null }))}
                onNoOutline={() => changeShape(t('No outline'), () => ({ outline: null }), (d) => ({ ...d, outline: null }))}
                onOutlineWidth={changeOutlineWidth}
              onOutlineDash={changeOutlineDash}
                onFillKind={changeFillKind}
                onGradient={changeGradient}
                gradientStop={gradientStop}
                onGradientStop={(index) => {
                  setEffectColor(null)
                  setColorTarget('fill')
                  setGradientStop(index)
                }}
                onEditPoints={editingShape && pickedShapes < 2 && !editingShape.geometry.parts && !(tool === 'pen' && editingShape.geometry.type === 'path') ? () => editPoints(editingShape.id) : undefined}
                onChoosePhoto={editingShape && pickedShapes < 2 ? () => pickFile({ shape: editingShape.id }) : undefined}
                photo={
                  editingShape?.fill.kind === 'photo'
                    ? {
                        zoom: editingShape.fill.zoom,
                        moving: photoMoving,
                        onZoom: (zoom) => setPhotoFill({ zoom }, t('Photo size')),
                        onToggleMove: () => setPhotoMoving(!photoMoving),
                        onRemove: () => editor.change(t('Remove photo'), (d) => updateShape(d, editingShape.id, { fill: { kind: 'color', color: DEFAULT_SHAPES.fill! } })),
                      }
                    : null
                }
              />
            )}
            {effectsLayer && (
              <EffectsPanel
                title={effectsLayer.name}
                open={effectsOpen}
                onOpen={(open) => {
                  if (!open) setEffectColor(null)
                  setEffectsOpen(open)
                }}
                effects={effectsLayer.effects ?? null}
                blend={effectsLayer.blend ?? 'normal'}
                unit={unit}
                thumbnails={effectPictures}
                colorTarget={effectTarget}
                onColorTarget={(kind) => setEffectColor(kind && { layerId: effectsLayer.id, kind })}
                onLook={(look) => {
                  setEffectColor(null)
                  const effects = look.effects(unit)
                  changeEffects(effects, effectsLabel(effects, unit))
                }}
                onChange={changeEffects}
                onBlend={changeBlend}
              />
            )}
          </ScrollRegion>
          <LayersPanel
            doc={doc}
            revision={editor.revision}
            picked={picked}
            onSelect={layers.select}
            onToggle={togglePicked}
            onPickGroup={layers.pickGroup}
            onToggleGroupVisibility={layers.toggleGroupVisibility}
            onRenameGroup={layers.renameGroup}
            onToggleVisibility={layers.toggleVisibility}
            onToggleLock={layers.toggleLock}
            onEditAdjust={layers.editAdjust}
            onOnlyThisPage={(id) => editor.change(t('Only on this page'), (d) => setOnEveryPage(d, [id], false))}
            onRename={layers.rename}
            onOpacity={layers.opacity}
            onAdd={layers.add}
            onDuplicate={layers.duplicate}
            onMove={layers.move}
            onDelete={layers.remove}
            onPickPage={layers.pickPage}
            onSeeThrough={layers.seeThrough}
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
          if (file) handlePickedFile(file)
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
      {dialog === 'layouts' && <LayoutsDialog kind={layoutsKind} layoutId={layoutsStart} onUse={(layout, colors) => void startFromLayout(layout, colors)} onClose={() => setDialog(null)} />}
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
      {dialog === 'layout' && doc && (
        <PageLayoutDialog
          doc={doc}
          onPreview={setLayoutPreview}
          onClose={() => setDialog(null)}
          onApply={(layout) => {
            setDialog(null)
            setLayoutPreview(null)
            editor.change(t('Margins and columns'), (d) => {
              const next = { ...d }
              if (hasLayout(layout)) next.layout = layout
              else delete next.layout
              return next
            })
          }}
        />
      )}
      {dialog === 'resize' && doc && (
        <ResizeDialog
          width={doc.width}
          height={doc.height}
          ppi={documentPpi(doc)}
          onClose={() => setDialog(null)}
          onResize={(width, height, ppi) => {
            setDialog(null)
            changeWholeDesign(t('Resize design'), (d) => ({ ...resizeDocument(d, width, height), ppi }))
          }}
        />
      )}
      {dialog === 'discard' && (
        <Dialog
          title={t("Throw away your changes?")}
          subtitle={t('{problem} If you continue, they will be lost. To keep them, choose Keep editing and then Download.', { problem: autosave.problem ?? t("Your latest changes couldn't be kept in this browser.") })}
          submitLabel={t("Throw away changes")}
          cancelLabel={t("Keep editing")}
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
