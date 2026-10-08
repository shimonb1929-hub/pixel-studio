import { X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { CanvasView } from './components/CanvasView.tsx'
import { ExportDialog, type ExportOptions } from './components/ExportDialog.tsx'
import { LayersPanel } from './components/LayersPanel.tsx'
import { MenuBar, type MenuDef } from './components/MenuBar.tsx'
import { NewDocumentDialog, type NewDocumentOptions } from './components/NewDocumentDialog.tsx'
import { OptionsBar } from './components/OptionsBar.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { WelcomeScreen } from './components/WelcomeScreen.tsx'
import { createBlankDocument } from './editor/document.ts'
import { downloadBlob, exportDocument, openImageFile } from './editor/io.ts'
import type { EditorDocument, Point, ToolId, Viewport } from './editor/types.ts'
import { centeredViewport, fitViewport, nextZoomLevel, zoomAtPoint } from './editor/viewport.ts'
import { useElementSize } from './hooks/useElementSize.ts'
import { isTypingTarget, shortcut } from './keys.ts'

type DialogId = 'new' | 'export'

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
  const [untitledCount, setUntitledCount] = useState(0)
  const workspaceRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workspace = useElementSize(workspaceRef)

  function showDocument(next: EditorDocument) {
    setDoc(next)
    setCursor(null)
    setViewport(fitViewport(next.width, next.height, workspace.width, workspace.height, { allowUpscale: false }))
  }

  async function openFile(file: File) {
    setError(null)
    try {
      showDocument(await openImageFile(file))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function createDocument({ name, width, height, background }: NewDocumentOptions) {
    try {
      showDocument(createBlankDocument(name, width, height, background))
      setUntitledCount((count) => count + 1)
      setDialog(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function exportImage({ format, quality, fileName }: ExportOptions) {
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

  const commands = {
    newImage: () => setDialog('new'),
    open: () => fileInputRef.current?.click(),
    export: () => doc && setDialog('export'),
    close: () => {
      setDoc(null)
      setCursor(null)
    },
    zoomIn: () => setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, 1), workspace.width / 2, workspace.height / 2)),
    zoomOut: () => setViewport((v) => zoomAtPoint(v, nextZoomLevel(v.zoom, -1), workspace.width / 2, workspace.height / 2)),
    fit: () => doc && setViewport(fitViewport(doc.width, doc.height, workspace.width, workspace.height)),
    actualSize: () => doc && setViewport(centeredViewport(doc.width, doc.height, workspace.width, workspace.height, 1)),
  }

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

      if (code === 'Space' && !mod) {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }

      let action: (() => unknown) | undefined
      if (mod && event.altKey && code === 'KeyN') action = c.newImage
      else if (mod && !event.shiftKey && code === 'KeyO') action = c.open
      else if (mod && event.shiftKey && code === 'KeyE' && hasDoc) action = c.export
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
        if (!isTypingTarget(event.target) && !stateRef.current.dialogOpen) event.preventDefault()
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

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'New image…',
          shortcut: shortcut('mod', 'alt', 'N'),
          description: 'Start with an empty image. You choose how big it is and its background color.',
          onSelect: commands.newImage,
        },
        {
          label: 'Open…',
          shortcut: shortcut('mod', 'O'),
          description: 'Pick a picture file from your computer to edit. You can also drag a file onto the window.',
          onSelect: commands.open,
        },
        { separator: true },
        {
          label: 'Export as PNG or JPG…',
          shortcut: shortcut('mod', 'shift', 'E'),
          description: 'Save your image as a file you can share, print or upload.',
          disabled: !doc,
          onSelect: commands.export,
        },
        { separator: true },
        {
          label: 'Close image',
          description: 'Closes this image. Anything you have not exported will be gone.',
          disabled: !doc,
          onSelect: commands.close,
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Zoom in',
          shortcut: shortcut('mod', '+'),
          description: 'Shows the image bigger so you can see small details. The image itself does not change.',
          disabled: !doc,
          onSelect: commands.zoomIn,
        },
        {
          label: 'Zoom out',
          shortcut: shortcut('mod', '-'),
          description: 'Shows the image smaller so you can see more of it. The image itself does not change.',
          disabled: !doc,
          onSelect: commands.zoomOut,
        },
        { separator: true },
        {
          label: 'Fit on screen',
          shortcut: shortcut('mod', '0'),
          description: 'Makes the whole image fit inside the window, as large as possible.',
          disabled: !doc,
          onSelect: commands.fit,
        },
        {
          label: 'Actual size (100%)',
          shortcut: shortcut('mod', 'alt', '0'),
          description: 'Shows the image at its real size: each pixel of the image takes one pixel of your screen.',
          disabled: !doc,
          onSelect: commands.actualSize,
        },
      ],
    },
  ]

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
    <div
      className="flex h-full select-none flex-col bg-zinc-900 text-zinc-200"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex h-9 shrink-0 items-stretch gap-2 border-b border-zinc-800 bg-zinc-950 pl-3">
        <span className="flex items-center pr-2 text-[13px] font-semibold text-zinc-100">Pixel Studio</span>
        <MenuBar menus={menus} />
        {doc && <span className="ml-auto flex items-center truncate pr-3 text-xs text-zinc-400">{doc.name}</span>}
      </header>

      <OptionsBar
        tool={tool}
        hasDocument={!!doc}
        onZoomIn={commands.zoomIn}
        onZoomOut={commands.zoomOut}
        onActualSize={commands.actualSize}
        onFit={commands.fit}
      />

      <div className="flex min-h-0 flex-1">
        <Toolbar tool={tool} onToolChange={setTool} />
        <main ref={workspaceRef} className="relative min-w-0 flex-1 overflow-hidden bg-workspace">
          {doc ? (
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
          ) : (
            <WelcomeScreen onNew={commands.newImage} onOpen={commands.open} />
          )}
          {dropActive && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10">
              <p className="text-sm font-medium text-zinc-100">Drop the file to open it</p>
            </div>
          )}
        </main>
        <LayersPanel doc={doc} onToggleVisibility={toggleLayerVisibility} />
      </div>

      <StatusBar doc={doc} zoom={viewport.zoom} cursor={cursor} />

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
        <NewDocumentDialog
          defaultName={`Untitled-${untitledCount + 1}`}
          onCreate={createDocument}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && doc && (
        <ExportDialog doc={doc} onExport={exportImage} onClose={() => setDialog(null)} />
      )}

      {error && (
        <div
          role="alert"
          className="fixed bottom-10 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-md border border-red-900 bg-red-950 px-4 py-2.5 text-sm text-red-100 shadow-xl"
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setError(null)}
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-300 hover:bg-red-900"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
