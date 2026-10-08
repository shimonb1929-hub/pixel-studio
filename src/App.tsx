import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import type { Action } from './actions.ts'
import { CanvasView } from './components/CanvasView.tsx'
import { ColorPanel } from './components/ColorPanel.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Dialog } from './components/Dialog.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { Toast } from './components/Toast.tsx'
import { ToolDock } from './components/ToolDock.tsx'
import { ToolOptions } from './components/ToolOptions.tsx'
import { TopBar } from './components/TopBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { DesignInfo, ToolHint, ZoomControls } from './components/WorkspaceOverlays.tsx'
import { BRUSH_PRESETS, ERASER_PRESETS, stepBrushSize, type BrushSettings } from './editor/brushes.ts'
import { createBlankDocument, createLayer, duplicateLayer } from './editor/document.ts'
import { downloadBlob, exportDocument, openImageFile } from './editor/io.ts'
import { activeLayer, insertLayerAboveActive, moveLayer, nextLayerName, removeLayer, updateLayer } from './editor/layers.ts'
import type { StrokeResult } from './editor/stroke.ts'
import type { EditorDocument, Point, ToolId, Viewport } from './editor/types.ts'
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

// The same faint dots the canvas draws, so the empty workspace matches it.
const DOT_BACKGROUND = {
  backgroundImage: 'radial-gradient(rgba(27, 33, 48, 0.13) 0.85px, transparent 1.1px)',
  backgroundSize: '24px 24px',
}

const DEFAULT_BRUSH = BRUSH_PRESETS.find((p) => p.id === 'pen')!
const DEFAULT_ERASER = ERASER_PRESETS.find((p) => p.id === 'block')!

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function layerBytes(doc: EditorDocument): number {
  return doc.width * doc.height * 4
}

export default function App() {
  const editor = useEditor()
  const { doc } = editor
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [tool, setToolState] = useState<ToolId>('brush')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const strokeActiveRef = useRef(false)
  const pendingDiscardRef = useRef<(() => void) | null>(null)
  // After picking a color, go back to the drawing tool you came from.
  const lastDrawToolRef = useRef<'brush' | 'eraser'>('brush')
  const workspace = useElementSize(workspaceRef)

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
    setError(null)
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
      setError(errorMessage(e))
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
      setError(errorMessage(e))
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
      setError(errorMessage(e))
    }
  }

  function handleStroke(layerId: string, result: StrokeResult, label: string) {
    editor.commitStroke(label, layerId, result)
    if (tool === 'brush') setRecentColors((recent) => [color, ...recent.filter((c) => c !== color)].slice(0, MAX_RECENT_COLORS))
  }

  function handlePickColor(hex: string) {
    setColor(hex)
    if (tool === 'picker') setToolState(lastDrawToolRef.current)
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

  const layers = {
    add: () => editor.change('New layer', (d) => insertLayerAboveActive(d, createLayer(nextLayerName(d.layers), d.width, d.height))),
    duplicate: () =>
      editor.change(
        'Duplicate layer',
        (d) => {
          const layer = activeLayer(d)
          return layer ? insertLayerAboveActive(d, duplicateLayer(layer)) : d
        },
        { bytes: doc ? layerBytes(doc) : 0 },
      ),
    remove: () => editor.change('Delete layer', (d) => removeLayer(d, d.activeLayerId), { bytes: doc ? layerBytes(doc) : 0 }),
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

  const commands = {
    newDesign: () => setDialog('new'),
    open: () => fileInputRef.current?.click(),
    download: () => doc && setDialog('export'),
    close: () => guardDiscard(() => editor.close()),
    // Undo waits until a stroke is finished, so it never pulls pixels out from under the brush.
    undo: () => !strokeActiveRef.current && editor.undo(),
    redo: () => !strokeActiveRef.current && editor.redo(),
    zoomIn: () => doc && zoomBy(1),
    zoomOut: () => doc && zoomBy(-1),
    fit: () => doc && setViewport(fitted(doc)),
    actualSize: () => doc && setViewport(centeredViewport(doc.width, doc.height, workspace.width, workspace.height, 1)),
    search: () => setDialog('search'),
    biggerBrush: () => changeBrushSize(1),
    smallerBrush: () => changeBrushSize(-1),
  }

  const active = doc ? activeLayer(doc) : undefined
  const activeIndex = doc && active ? doc.layers.indexOf(active) : -1

  const actions: Action[] = [
    {
      id: 'new',
      group: 'Design',
      title: 'New design…',
      description: 'Start a fresh, empty design. You choose its size and background color.',
      keywords: ['new', 'blank', 'start', 'create', 'canvas', 'empty', 'begin', 'make', 'size'],
      shortcut: shortcut('mod', 'alt', 'N'),
      run: commands.newDesign,
    },
    {
      id: 'open',
      group: 'Design',
      title: 'Open a picture…',
      description: 'Pick a picture from your computer to edit it. You can also drop a file onto the window.',
      keywords: ['open', 'photo', 'picture', 'image', 'upload', 'import', 'load', 'file'],
      shortcut: shortcut('mod', 'O'),
      run: commands.open,
    },
    {
      id: 'download',
      group: 'Design',
      title: 'Download…',
      description: 'Save your design to your computer as a PNG or JPG picture you can share or print.',
      keywords: ['save', 'export', 'download', 'share', 'png', 'jpg', 'jpeg', 'print', 'file', 'keep'],
      shortcut: shortcut('mod', 'S'),
      needsDocument: true,
      run: commands.download,
    },
    {
      id: 'close',
      group: 'Design',
      title: 'Close design',
      description: 'Close this design and go back to the start. If it has changes you have not downloaded, you will be asked first.',
      keywords: ['close', 'exit', 'finish', 'done', 'start over', 'home'],
      needsDocument: true,
      run: commands.close,
    },
    {
      id: 'undo',
      group: 'Edit',
      title: editor.undoLabel ? `Undo ${editor.undoLabel.toLowerCase()}` : 'Undo',
      description: 'Take back your last change. Press again to keep going back.',
      keywords: ['undo', 'back', 'oops', 'mistake', 'revert', 'take back'],
      shortcut: shortcut('mod', 'Z'),
      needsDocument: true,
      disabledReason: editor.undoLabel ? undefined : 'Nothing to undo yet.',
      run: commands.undo,
    },
    {
      id: 'redo',
      group: 'Edit',
      title: editor.redoLabel ? `Redo ${editor.redoLabel.toLowerCase()}` : 'Redo',
      description: 'Bring back a change you just undid.',
      keywords: ['redo', 'again', 'forward', 'bring back'],
      shortcut: shortcut('mod', 'shift', 'Z'),
      needsDocument: true,
      disabledReason: editor.redoLabel ? undefined : 'Nothing to redo. Redo works right after you undo.',
      run: commands.redo,
    },
    {
      id: 'layer-new',
      group: 'Layers',
      title: 'New layer',
      description: 'Add a clear sheet above the selected layer, so you can paint without changing what is below.',
      keywords: ['add layer', 'new sheet', 'transparent layer', 'layer'],
      needsDocument: true,
      run: layers.add,
    },
    {
      id: 'layer-duplicate',
      group: 'Layers',
      title: 'Duplicate layer',
      description: 'Make an exact copy of the selected layer, placed right above it.',
      keywords: ['copy layer', 'clone', 'duplicate'],
      needsDocument: true,
      run: layers.duplicate,
    },
    {
      id: 'layer-up',
      group: 'Layers',
      title: 'Move layer up',
      description: 'Move the selected layer toward the front.',
      keywords: ['bring forward', 'raise', 'front', 'arrange', 'order'],
      needsDocument: true,
      disabledReason: doc && activeIndex === doc.layers.length - 1 ? 'This layer is already at the front.' : undefined,
      run: () => layers.move(1),
    },
    {
      id: 'layer-down',
      group: 'Layers',
      title: 'Move layer down',
      description: 'Move the selected layer toward the back.',
      keywords: ['send backward', 'lower', 'back', 'behind', 'arrange', 'order'],
      needsDocument: true,
      disabledReason: activeIndex === 0 ? 'This layer is already at the back.' : undefined,
      run: () => layers.move(-1),
    },
    {
      id: 'layer-visibility',
      group: 'Layers',
      title: active && !active.visible ? 'Show layer' : 'Hide layer',
      description: 'Hide or show the selected layer. Hidden layers are left out when you download.',
      keywords: ['hide', 'show', 'visible', 'invisible', 'eye'],
      needsDocument: true,
      run: () => active && layers.toggleVisibility(active.id),
    },
    {
      id: 'layer-delete',
      group: 'Layers',
      title: 'Delete layer',
      description: 'Remove the selected layer and everything on it. You can undo this.',
      keywords: ['remove layer', 'delete', 'trash', 'throw away'],
      needsDocument: true,
      disabledReason: doc && doc.layers.length <= 1 ? 'A design needs at least one layer.' : undefined,
      run: layers.remove,
    },
    {
      id: 'zoom-in',
      group: 'View',
      title: 'Zoom in',
      description: 'See your design bigger, to work on small details. Your design itself does not change.',
      keywords: ['bigger', 'closer', 'magnify', 'enlarge', 'larger', 'zoom'],
      shortcut: shortcut('mod', 'Plus'),
      needsDocument: true,
      run: commands.zoomIn,
    },
    {
      id: 'zoom-out',
      group: 'View',
      title: 'Zoom out',
      description: 'See your design smaller, so more of it fits. Your design itself does not change.',
      keywords: ['smaller', 'farther', 'shrink', 'zoom', 'back', 'away'],
      shortcut: shortcut('mod', 'Minus'),
      needsDocument: true,
      run: commands.zoomOut,
    },
    {
      id: 'fit',
      group: 'View',
      title: 'Fit on screen',
      description: 'Show your whole design, as big as fits in the window.',
      keywords: ['fit', 'whole', 'all', 'entire', 'screen', 'reset', 'center', 'see everything'],
      shortcut: shortcut('mod', '0'),
      needsDocument: true,
      run: commands.fit,
    },
    {
      id: 'actual-size',
      group: 'View',
      title: 'Actual size (100%)',
      description: 'Show your design at its real size: each pixel of your design takes one pixel of your screen.',
      keywords: ['100', 'real', 'actual', 'original', 'pixels', 'true size'],
      shortcut: shortcut('mod', 'alt', '0'),
      needsDocument: true,
      run: commands.actualSize,
    },
    {
      id: 'brush-bigger',
      group: 'Brush',
      title: 'Bigger brush',
      description: 'Make the brush or eraser thicker.',
      keywords: ['thicker', 'wider', 'brush size', 'increase size', 'bigger'],
      shortcut: ']',
      run: commands.biggerBrush,
    },
    {
      id: 'brush-smaller',
      group: 'Brush',
      title: 'Smaller brush',
      description: 'Make the brush or eraser thinner.',
      keywords: ['thinner', 'narrower', 'brush size', 'decrease size', 'smaller'],
      shortcut: '[',
      run: commands.smallerBrush,
    },
    ...TOOLS.map(
      (t): Action => ({
        id: `tool-${t.id}`,
        group: 'Tools',
        title: `${t.name} tool`,
        description: t.description,
        keywords: t.keywords,
        shortcut: t.key,
        run: () => setTool(t.id),
      }),
    ),
  ]

  // Keyboard handlers live in an effect, so they read the latest commands through a ref.
  const commandsRef = useRef({ ...commands, setTool })
  const stateRef = useRef({ hasDoc: !!doc, dialogOpen: dialog !== null })
  useEffect(() => {
    commandsRef.current = { ...commands, setTool }
    stateRef.current = { hasDoc: !!doc, dialogOpen: dialog !== null }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { hasDoc, dialogOpen } = stateRef.current
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
      else if (mod && (code === 'Equal' || code === 'NumpadAdd') && hasDoc) action = c.zoomIn
      else if (mod && (code === 'Minus' || code === 'NumpadSubtract') && hasDoc) action = c.zoomOut
      else if (mod && event.altKey && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.actualSize
      else if (mod && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.fit
      else if (plain && code === 'BracketRight') action = c.biggerBrush
      else if (plain && code === 'BracketLeft') action = c.smallerBrush
      else if (plain && !event.shiftKey) {
        const tool = TOOLS.find((t) => `Key${t.key}` === code)
        if (tool) action = () => c.setTool(tool.id)
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
    const reset = () => {
      setSpaceHeld(false)
      setAltHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
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
                onStroke={handleStroke}
                onStrokeActiveChange={(activeStroke) => (strokeActiveRef.current = activeStroke)}
                onPickColor={handlePickColor}
                onBlocked={setError}
              />
              <ToolHint tool={hintTool} />
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

      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </div>
  )
}
