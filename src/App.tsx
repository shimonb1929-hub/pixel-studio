import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import type { Action } from './actions.ts'
import { CanvasView } from './components/CanvasView.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { Toast } from './components/Toast.tsx'
import { ToolDock } from './components/ToolDock.tsx'
import { TopBar } from './components/TopBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { DesignInfo, ToolHint, ZoomControls } from './components/WorkspaceOverlays.tsx'
import { createBlankDocument } from './editor/document.ts'
import { downloadBlob, exportDocument, openImageFile } from './editor/io.ts'
import type { EditorDocument, Point, ToolId, Viewport } from './editor/types.ts'
import { centeredViewport, fitViewport, nextZoomLevel, panBy, zoomAtPoint } from './editor/viewport.ts'
import { useElementSize } from './hooks/useElementSize.ts'
import { isTypingTarget, shortcut } from './keys.ts'
import type { SizePreset } from './presets.ts'
import { TOOLS } from './tools.ts'

type DialogId = 'new' | 'export' | 'search'

// Room left around a fitted design for the floating hint and zoom controls.
const FIT_PADDING = 64

// The same faint dots the canvas draws, so the empty workspace matches it.
const DOT_BACKGROUND = {
  backgroundImage: 'radial-gradient(rgba(27, 33, 48, 0.13) 0.85px, transparent 1.1px)',
  backgroundSize: '24px 24px',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export default function App() {
  const [doc, setDoc] = useState<EditorDocument | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [tool, setTool] = useState<ToolId>('hand')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [designCount, setDesignCount] = useState(0)
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  function fitted(next: { width: number; height: number }, allowUpscale = true): Viewport {
    return fitViewport(next.width, next.height, workspace.width, workspace.height, { allowUpscale, padding: FIT_PADDING })
  }

  function showDocument(next: EditorDocument) {
    setDoc(next)
    setCursor(null)
    setError(null)
    setViewport(fitted(next, false))
  }

  async function openFile(file: File) {
    try {
      showDocument(await openImageFile(file))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function createDocument({ name, width, height, background }: NewDocumentOptions) {
    try {
      showDocument(createBlankDocument(name, width, height, background))
      setDesignCount((count) => count + 1)
      setDialog(null)
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
      setDialog(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function toggleLayerVisibility(layerId: string) {
    setDoc((current) =>
      current && {
        ...current,
        layers: current.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)),
      },
    )
  }

  function zoomBy(direction: 1 | -1) {
    setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, direction), workspace.width / 2, workspace.height / 2))
  }

  const commands = {
    newDesign: () => setDialog('new'),
    open: () => fileInputRef.current?.click(),
    download: () => doc && setDialog('export'),
    close: () => {
      setDoc(null)
      setCursor(null)
    },
    zoomIn: () => doc && zoomBy(1),
    zoomOut: () => doc && zoomBy(-1),
    fit: () => doc && setViewport(fitted(doc)),
    actualSize: () => doc && setViewport(centeredViewport(doc.width, doc.height, workspace.width, workspace.height, 1)),
    search: () => setDialog('search'),
  }

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
      description: 'Close this design and go back to the start. Download it first if you want to keep it.',
      keywords: ['close', 'exit', 'finish', 'done', 'start over', 'home'],
      needsDocument: true,
      run: commands.close,
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
  const commandsRef = useRef(commands)
  const stateRef = useRef({ hasDoc: !!doc, dialogOpen: dialog !== null })
  useEffect(() => {
    commandsRef.current = commands
    stateRef.current = { hasDoc: !!doc, dialogOpen: dialog !== null }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setAltHeld(true)
      const { hasDoc, dialogOpen } = stateRef.current
      if (dialogOpen || isTypingTarget(event.target)) return
      const c = commandsRef.current
      const mod = event.ctrlKey || event.metaKey
      // event.code names the physical key, so shortcuts work with any keyboard language.
      const code = event.code

      // While a design is open, Space is the temporary Hand. Without one, Space presses buttons as usual.
      if (code === 'Space' && !mod && hasDoc) {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }

      let action: (() => unknown) | undefined
      if (mod && code === 'KeyK') action = c.search
      else if (!mod && !event.altKey && event.key === '/') action = c.search
      else if (mod && event.altKey && code === 'KeyN') action = c.newDesign
      else if (mod && !event.shiftKey && code === 'KeyO') action = c.open
      // Always stop the browser's own "save page" window; it would save this program, not the design.
      else if (mod && code === 'KeyS') action = c.download
      else if (mod && (code === 'Equal' || code === 'NumpadAdd') && hasDoc) action = c.zoomIn
      else if (mod && (code === 'Minus' || code === 'NumpadSubtract') && hasDoc) action = c.zoomOut
      else if (mod && event.altKey && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.actualSize
      else if (mod && (code === 'Digit0' || code === 'Numpad0') && hasDoc) action = c.fit
      else if (!mod && !event.altKey && code === 'KeyH') action = () => setTool('hand')
      else if (!mod && !event.altKey && code === 'KeyZ') action = () => setTool('zoom')

      if (action) {
        event.preventDefault()
        action()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setAltHeld(false)
      if (event.code === 'Space') {
        setSpaceHeld(false)
        // Stop Space from also pressing whichever button has focus.
        const { hasDoc, dialogOpen } = stateRef.current
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

  return (
    <div className="flex h-full select-none flex-col" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <TopBar actions={actions} documentName={doc?.name ?? null} onSearch={commands.search} onDownload={commands.download} />

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
                viewport={viewport}
                onViewportChange={setViewport}
                onCursorChange={setCursor}
                width={workspace.width}
                height={workspace.height}
                tool={tool}
                spaceHeld={spaceHeld}
                altHeld={altHeld}
              />
              <ToolHint tool={spaceHeld ? 'hand' : tool} />
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

        <LayersPanel doc={doc} onToggleVisibility={toggleLayerVisibility} />
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

      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </div>
  )
}
