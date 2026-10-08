import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { buildActions, type AppCommands } from './appActions.ts'
import { CanvasView } from './components/CanvasView.tsx'
import { ColorPanel } from './components/ColorPanel.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Dialog } from './components/Dialog.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { Toast, type Notice } from './components/Toast.tsx'
import { ToolDock } from './components/ToolDock.tsx'
import { ToolOptions } from './components/ToolOptions.tsx'
import { TopBar } from './components/TopBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { DesignInfo, ToolHint, ZoomControls } from './components/WorkspaceOverlays.tsx'
import { BRUSH_PRESETS, ERASER_PRESETS, stepBrushSize, type BrushSettings } from './editor/brushes.ts'
import { getClipboard, ownCopyCheck, setClipboard } from './editor/clipboard.ts'
import { createBlankDocument, createCanvas, createDocumentFromImage, createLayer, duplicateLayer, getContext2d, layerFromCanvas } from './editor/document.ts'
import { intersectRect } from './editor/geometry.ts'
import { downloadBlob, exportDocument, imageFileToCanvas, openImageFile } from './editor/io.ts'
import { activeLayer, insertLayerAboveActive, moveLayer, nextLayerName, removeLayer, updateLayer } from './editor/layers.ts'
import { startMove, type MoveSession } from './editor/move.ts'
import { clearSelected, contentBounds, copySelected, editArea, fillSelected, isBlank, type Piece } from './editor/pixels.ts'
import { invertSelection, selectAll, selectionInfo, type Selection, type SelectionMode, type SelectionShape } from './editor/selection.ts'
import type { StrokeResult } from './editor/stroke.ts'
import type { EditorDocument, Layer, Point, ToolId, Viewport } from './editor/types.ts'
import { centeredViewport, fitViewport, nextZoomLevel, panBy, zoomAtPoint } from './editor/viewport.ts'
import { useEditor } from './hooks/useEditor.ts'
import { useElementSize } from './hooks/useElementSize.ts'
import { isTypingTarget, shortcut } from './keys.ts'
import type { SizePreset } from './presets.ts'
import { TOOLS } from './tools.ts'

type DialogId = 'new' | 'export' | 'search' | 'discard'

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

export default function App() {
  const editor = useEditor()
  const { doc } = editor
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [tool, setToolState] = useState<ToolId>('brush')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [designCount, setDesignCount] = useState(0)
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
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const strokeActiveRef = useRef(false)
  const pendingDiscardRef = useRef<(() => void) | null>(null)
  // After picking a color, go back to the drawing tool you came from.
  const lastDrawToolRef = useRef<'brush' | 'eraser'>('brush')
  const workspace = useElementSize(workspaceRef)

  const problem = (message: string) => setNotice({ message, tone: 'problem' })
  const inform = (message: string) => setNotice({ message, tone: 'info' })

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

  // Closing the tab with changes that aren't downloaded asks first.
  useEffect(() => {
    if (!editor.isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers and Safari only ask when this is set too.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editor.isDirty])

  function setTool(next: ToolId) {
    if (next === 'brush' || next === 'eraser') lastDrawToolRef.current = next
    setToolState(next)
  }

  function fitted(next: { width: number; height: number }, allowUpscale = true): Viewport {
    return fitViewport(next.width, next.height, workspace.width, workspace.height, { allowUpscale, padding: FIT_PADDING })
  }

  function showDocument(next: EditorDocument) {
    editor.load(next)
    setCursor(null)
    setNotice(null)
    setViewport(fitted(next, false))
  }

  // Runs the action right away, or asks first if there are changes that would be lost.
  function guardDiscard(action: () => void) {
    if (editor.isDirty) {
      pendingDiscardRef.current = action
      setDialog('discard')
    } else {
      action()
    }
  }

  async function openFile(file: File) {
    try {
      const next = await openImageFile(file)
      guardDiscard(() => showDocument(next))
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function createDocument({ name, width, height, background }: NewDocumentOptions) {
    try {
      const next = createBlankDocument(name, width, height, background)
      setDialog(null)
      guardDiscard(() => {
        showDocument(next)
        setDesignCount((count) => count + 1)
      })
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function createFromPreset(preset: SizePreset) {
    createDocument({ name: preset.name, width: preset.width, height: preset.height, background: 'white' })
  }

  async function download({ format, quality, fileName }: ExportOptions) {
    if (!doc) return
    try {
      downloadBlob(await exportDocument(doc, format, quality / 100), fileName)
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
    const layer = doc?.layers.find((l) => l.id === session.layerId)
    editor.change(session.label, (d) => session.commit(d, dx, dy), { bytes: session.movesSelection && layer ? canvasBytes(layer.canvas) : 0 })
  }

  function handleSelect(selection: Selection | null, label: string) {
    editor.change(label, (d) => ({ ...d, selection }))
  }

  function changeBrushSize(direction: 1 | -1) {
    const update = (current: { settings: BrushSettings; presetId: string | null }) => ({
      ...current,
      settings: { ...current.settings, size: stepBrushSize(current.settings.size, direction) },
    })
    if (tool === 'eraser') setEraser(update)
    else setBrush(update)
  }

  function zoomBy(direction: 1 | -1) {
    setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), workspace.width / 2, workspace.height / 2))
  }

  // The selected layer, if it can be changed; otherwise says why not.
  function usableLayer(doing: string): Layer | null {
    const layer = doc && activeLayer(doc)
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
    const layer = doc && activeLayer(doc)
    if (!doc || !layer) return null
    const piece = copySelected(layer, doc)
    if (!piece || isBlank(piece.canvas)) {
      problem(doc.selection ? `There is nothing in the selected area on "${layer.name}".` : `"${layer.name}" is empty, so there is nothing to copy.`)
      return null
    }
    return piece
  }

  // Puts a picture on a new layer: where it was copied from, or in the middle if that's off the design.
  function pastePiece(piece: Piece | { canvas: HTMLCanvasElement; x?: number; y?: number }) {
    const { canvas } = piece
    if (!doc) {
      // With no design open, the pasted picture becomes a new design.
      showDocument(createDocumentFromImage('Pasted picture', canvas, canvas.width, canvas.height))
      return
    }
    const onDesign =
      piece.x !== undefined &&
      piece.y !== undefined &&
      intersectRect({ x: piece.x, y: piece.y, width: canvas.width, height: canvas.height }, { x: 0, y: 0, width: doc.width, height: doc.height })
    const x = onDesign ? piece.x! : Math.round((doc.width - canvas.width) / 2)
    const y = onDesign ? piece.y! : Math.round((doc.height - canvas.height) / 2)
    // A copy, so changing the pasted layer never changes what's on the clipboard.
    const copy = createCanvas(canvas.width, canvas.height)
    getContext2d(copy).drawImage(canvas, 0, 0)
    editor.change('Paste', (d) => ({ ...insertLayerAboveActive(d, layerFromCanvas('Pasted', copy, x, y)), selection: null }), {
      bytes: canvasBytes(copy),
    })
    setTool('move')
    inform('Pasted on a new layer. Drag it to put it where you want.')
  }

  async function pasteFile(file: File) {
    const ownCopy = ownCopyCheck()
    try {
      const canvas = await imageFileToCanvas(file)
      // Pixel Studio's own copy remembers where it came from, so it goes back in place.
      pastePiece(ownCopy(canvas.width, canvas.height) ?? { canvas })
    } catch (e) {
      problem(errorMessage(e))
    }
  }

  function moveBy(dx: number, dy: number, mergeKey?: string) {
    const layer = usableLayer('move it')
    if (!layer || !doc) return
    editor.change(doc.selection ? 'Move selected area' : 'Move layer', (d) => startMove(d)?.commit(d, dx, dy) ?? d, {
      mergeKey,
      bytes: doc.selection ? canvasBytes(layer.canvas) : 0,
    })
  }

  const layers = {
    add: () => editor.change('New layer', (d) => insertLayerAboveActive(d, createLayer(nextLayerName(d.layers), d.width, d.height))),
    duplicate: () =>
      editor.change(
        'Duplicate layer',
        (d) => {
          const layer = activeLayer(d)
          return layer ? insertLayerAboveActive(d, duplicateLayer(layer)) : d
        },
        { bytes: active ? canvasBytes(active.canvas) : 0 },
      ),
    remove: () => editor.change('Delete layer', (d) => removeLayer(d, d.activeLayerId), { bytes: active ? canvasBytes(active.canvas) : 0 }),
    move: (direction: 1 | -1) =>
      editor.change(direction > 0 ? 'Move layer up' : 'Move layer down', (d) => moveLayer(d, d.activeLayerId, direction)),
    rename: (layerId: string, name: string) => editor.change('Rename layer', (d) => updateLayer(d, layerId, { name })),
    opacity: (layerId: string, opacity: number) =>
      editor.change('Change layer opacity', (d) => updateLayer(d, layerId, { opacity }), { mergeKey: `opacity:${layerId}` }),
    toggleVisibility: (layerId: string) => {
      const layer = doc?.layers.find((l) => l.id === layerId)
      if (layer) editor.change(layer.visible ? 'Hide layer' : 'Show layer', (d) => updateLayer(d, layerId, { visible: !layer.visible }))
    },
  }

  const active = doc ? activeLayer(doc) : undefined
  const pasteHint = `Press ${shortcut('mod', 'V')} to paste it as a new layer.`

  const commands: AppCommands & { nudge: (dx: number, dy: number) => void; pasteFile: (file: File) => void; hasSelection: () => boolean } = {
    newDesign: () => setDialog('new'),
    open: () => fileInputRef.current?.click(),
    download: () => doc && setDialog('export'),
    close: () => guardDiscard(() => editor.close()),
    // Undo waits until a stroke is finished, so it never pulls pixels out from under the brush.
    undo: () => !strokeActiveRef.current && editor.undo(),
    redo: () => !strokeActiveRef.current && editor.redo(),
    copy: () => {
      const piece = selectedPiece()
      if (!piece) return
      setClipboard(piece)
      inform(`Copied. ${pasteHint}`)
    },
    cut: () => {
      if (!doc?.selection) {
        problem('Select an area first, with the Select tool.')
        return
      }
      const layer = usableLayer('cut')
      const area = editArea(doc)
      const piece = layer && selectedPiece()
      if (!layer || !piece || !area) return
      setClipboard(piece)
      editor.paint('Cut', layer.id, area, (ctx, l) => clearSelected(ctx, l, doc))
      inform(`Cut. ${pasteHint}`)
    },
    paste: () => {
      const piece = getClipboard()
      if (piece) pastePiece(piece)
      else problem(`Nothing to paste yet. Copy part of your design first, or copy a picture in another program and press ${shortcut('mod', 'V')}.`)
    },
    pasteFile: (file) => void pasteFile(file),
    selectAll: () => doc && setSelection('Select all', (d) => selectAll(d.width, d.height)),
    deselect: () => doc?.selection && setSelection('Deselect', () => null),
    invert: () => doc && setSelection('Invert selection', (d) => invertSelection(d.selection, d.width, d.height)),
    fill: () => {
      const layer = usableLayer('fill')
      const area = doc && editArea(doc)
      if (!doc || !layer || !area) return
      editor.paint('Fill with color', layer.id, area, (ctx, l) => fillSelected(ctx, l, doc, color))
      rememberColor(color)
    },
    deleteArea: () => {
      if (!doc?.selection) {
        problem('Select an area first, with the Select tool. To remove a whole layer, use Delete layer.')
        return
      }
      const layer = usableLayer('delete')
      const area = editArea(doc)
      if (layer && area) editor.paint('Delete selected area', layer.id, area, (ctx, l) => clearSelected(ctx, l, doc))
    },
    toNewLayer: () => {
      const layer = doc && activeLayer(doc)
      const piece = selectedPiece()
      if (!layer || !piece) return
      editor.change(
        'Copy to new layer',
        (d) => ({ ...insertLayerAboveActive(d, layerFromCanvas(`${layer.name} copy`, piece.canvas, piece.x, piece.y)), selection: null }),
        { bytes: canvasBytes(piece.canvas) },
      )
    },
    center: () => {
      const layer = usableLayer('center it')
      if (!doc || !layer) return
      const bounds = doc.selection ? selectionInfo(doc.selection, doc.width, doc.height).bounds : contentBounds(layer)
      if (!bounds) {
        problem(`"${layer.name}" is empty, so there is nothing to center.`)
        return
      }
      const dx = Math.round((doc.width - bounds.width) / 2 - bounds.x)
      const dy = Math.round((doc.height - bounds.height) / 2 - bounds.y)
      if (dx === 0 && dy === 0) inform('It is already in the middle.')
      else moveBy(dx, dy)
    },
    nudge: (dx, dy) => moveBy(dx, dy, 'nudge'),
    hasSelection: () => !!doc?.selection,
    layerAdd: layers.add,
    layerDuplicate: layers.duplicate,
    layerUp: () => layers.move(1),
    layerDown: () => layers.move(-1),
    layerToggle: () => active && layers.toggleVisibility(active.id),
    layerDelete: layers.remove,
    zoomIn: () => doc && zoomBy(1),
    zoomOut: () => doc && zoomBy(-1),
    fit: () => doc && setViewport(fitted(doc)),
    actualSize: () => doc && setViewport(centeredViewport(doc.width, doc.height, workspace.width, workspace.height, 1)),
    search: () => setDialog('search'),
    biggerBrush: () => changeBrushSize(1),
    smallerBrush: () => changeBrushSize(-1),
    setTool,
  }

  const actions = buildActions({ doc, undoLabel: editor.undoLabel, redoLabel: editor.redoLabel }, commands)

  // Keyboard and paste handlers live in effects, so they read the latest commands through refs.
  const commandsRef = useRef(commands)
  const stateRef = useRef({ hasDoc: !!doc, dialogOpen: dialog !== null, tool })
  useEffect(() => {
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

  const paintSettings = tool === 'eraser' ? eraser.settings : brush.settings
  const hintTool: ToolId = spaceHeld ? 'hand' : altHeld && tool === 'brush' ? 'picker' : tool
  const hintExtra = doc?.selection && (hintTool === 'brush' || hintTool === 'eraser') ? 'Only the selected area changes.' : undefined

  return (
    <div className="flex h-full select-none flex-col" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <TopBar
        actions={actions}
        documentName={doc?.name ?? null}
        undoLabel={editor.undoLabel}
        redoLabel={editor.redoLabel}
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
            <WelcomeScreen onPreset={createFromPreset} onCustom={commands.newDesign} onOpen={commands.open} />
          )}
          {dropActive && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80">
              <p className="text-[15px] font-medium text-accent">Drop your picture to open it</p>
            </div>
          )}
        </main>

        <div className="hidden w-[272px] shrink-0 flex-col gap-2 overflow-y-auto md:flex">
          <ColorPanel color={color} recent={recentColors} onChange={setColor} onPickFromDesign={() => setTool('picker')} />
          <LayersPanel
            doc={doc}
            revision={editor.revision}
            onSelect={editor.select}
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
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void openFile(file)
        }}
      />

      {dialog === 'new' && (
        <NewDocumentDialog defaultName={`My design ${designCount + 1}`} onCreate={createDocument} onClose={() => setDialog(null)} />
      )}
      {dialog === 'export' && doc && <ExportDialog doc={doc} onExport={download} onClose={() => setDialog(null)} />}
      {dialog === 'search' && <CommandPalette actions={actions} hasDocument={!!doc} onClose={() => setDialog(null)} />}
      {dialog === 'discard' && (
        <Dialog
          title="Throw away your changes?"
          subtitle="Your design has changes you haven't downloaded. If you continue, they will be lost. To keep them, choose Keep editing and then Download."
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
