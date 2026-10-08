import type { Action } from './actions.ts'
import { activeLayer } from './editor/layers.ts'
import type { EditorDocument, ToolId } from './editor/types.ts'
import { shortcut } from './keys.ts'
import { TOOLS } from './tools.ts'

export interface AppCommands {
  newDesign: () => void
  open: () => void
  download: () => void
  close: () => void
  undo: () => void
  redo: () => void
  copy: () => void
  cut: () => void
  paste: () => void
  selectAll: () => void
  deselect: () => void
  invert: () => void
  fill: () => void
  deleteArea: () => void
  toNewLayer: () => void
  center: () => void
  resizeDesign: () => void
  cropToSelection: () => void
  rotateDesign: (direction: 1 | -1) => void
  flipDesign: (axis: 'horizontal' | 'vertical') => void
  layerAdd: () => void
  layerDuplicate: () => void
  layerUp: () => void
  layerDown: () => void
  layerToggle: () => void
  layerDelete: () => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  actualSize: () => void
  search: () => void
  biggerBrush: () => void
  smallerBrush: () => void
  setTool: (tool: ToolId) => void
}

interface ActionState {
  doc: EditorDocument | null
  undoLabel: string | null
  redoLabel: string | null
}

const NOTHING_SELECTED = 'Select an area first, with the Select tool.'

// Everything a person can do, in plain words. The menu, the search box and the hover tips all
// come from this one list.
export function buildActions({ doc, undoLabel, redoLabel }: ActionState, c: AppCommands): Action[] {
  const active = doc ? activeLayer(doc) : undefined
  const activeIndex = doc && active ? doc.layers.indexOf(active) : -1
  const noSelection = doc && !doc.selection ? NOTHING_SELECTED : undefined

  return [
    {
      id: 'new',
      group: 'Design',
      title: 'New design…',
      description: 'Start a fresh, empty design. You choose its size and background color.',
      keywords: ['new', 'blank', 'start', 'create', 'canvas', 'empty', 'begin', 'make', 'size'],
      shortcut: shortcut('mod', 'alt', 'N'),
      run: c.newDesign,
    },
    {
      id: 'open',
      group: 'Design',
      title: 'Open a picture…',
      description: 'Pick a picture from your computer to edit it. You can also drop a file onto the window.',
      keywords: ['open', 'photo', 'picture', 'image', 'upload', 'import', 'load', 'file'],
      shortcut: shortcut('mod', 'O'),
      run: c.open,
    },
    {
      id: 'download',
      group: 'Design',
      title: 'Download…',
      description: 'Save your design to your computer as a PNG or JPG picture you can share or print.',
      keywords: ['save', 'export', 'download', 'share', 'png', 'jpg', 'jpeg', 'print', 'file', 'keep'],
      shortcut: shortcut('mod', 'S'),
      needsDocument: true,
      run: c.download,
    },
    {
      id: 'close',
      group: 'Design',
      title: 'Close design',
      description: 'Close this design and go back to the start. If it has changes you have not downloaded, you will be asked first.',
      keywords: ['close', 'exit', 'finish', 'done', 'start over', 'home'],
      needsDocument: true,
      run: c.close,
    },
    {
      id: 'undo',
      group: 'Edit',
      title: undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo',
      description: 'Take back your last change. Press again to keep going back.',
      keywords: ['undo', 'back', 'oops', 'mistake', 'revert', 'take back'],
      shortcut: shortcut('mod', 'Z'),
      needsDocument: true,
      disabledReason: undoLabel ? undefined : 'Nothing to undo yet.',
      run: c.undo,
    },
    {
      id: 'redo',
      group: 'Edit',
      title: redoLabel ? `Redo ${redoLabel.toLowerCase()}` : 'Redo',
      description: 'Bring back a change you just undid.',
      keywords: ['redo', 'again', 'forward', 'bring back'],
      shortcut: shortcut('mod', 'shift', 'Z'),
      needsDocument: true,
      disabledReason: redoLabel ? undefined : 'Nothing to redo. Redo works right after you undo.',
      run: c.redo,
    },
    {
      id: 'copy',
      group: 'Edit',
      title: 'Copy',
      description: 'Copy the selected part of the selected layer (or the whole layer if nothing is selected), so you can paste it.',
      keywords: ['copy', 'duplicate', 'clipboard'],
      shortcut: shortcut('mod', 'C'),
      needsDocument: true,
      run: c.copy,
    },
    {
      id: 'cut',
      group: 'Edit',
      title: 'Cut',
      description: 'Copy the selected part and remove it from the layer, so you can paste it somewhere else.',
      keywords: ['cut', 'scissors', 'take out', 'remove and paste'],
      shortcut: shortcut('mod', 'X'),
      needsDocument: true,
      disabledReason: noSelection,
      run: c.cut,
    },
    {
      id: 'paste',
      group: 'Edit',
      title: 'Paste',
      description: 'Put what you copied onto a new layer. Pictures copied in other programs can be pasted too.',
      keywords: ['paste', 'insert', 'put', 'clipboard'],
      shortcut: shortcut('mod', 'V'),
      run: c.paste,
    },
    {
      id: 'select-all',
      group: 'Select',
      title: 'Select all',
      description: 'Select the whole design.',
      keywords: ['select all', 'everything', 'whole'],
      shortcut: shortcut('mod', 'A'),
      needsDocument: true,
      run: c.selectAll,
    },
    {
      id: 'deselect',
      group: 'Select',
      title: 'Deselect',
      description: 'Clear the selection, so you can work on the whole design again.',
      keywords: ['deselect', 'select none', 'clear selection', 'unselect', 'nothing'],
      shortcut: shortcut('mod', 'D'),
      needsDocument: true,
      disabledReason: noSelection && 'Nothing is selected.',
      run: c.deselect,
    },
    {
      id: 'invert',
      group: 'Select',
      title: 'Invert selection',
      description: 'Swap what is selected and what is not.',
      keywords: ['invert', 'reverse', 'opposite', 'swap', 'everything else'],
      needsDocument: true,
      run: c.invert,
    },
    {
      id: 'fill',
      group: 'Select',
      title: 'Fill with color',
      description: 'Fill the selected area of the selected layer with your current color. With nothing selected, fills the whole layer.',
      keywords: ['fill', 'bucket', 'paint area', 'color in', 'flood'],
      shortcut: shortcut('alt', 'Backspace'),
      needsDocument: true,
      run: c.fill,
    },
    {
      id: 'delete-area',
      group: 'Select',
      title: 'Delete selected area',
      description: 'Erase everything inside the selection on the selected layer.',
      keywords: ['delete', 'erase area', 'clear', 'remove', 'cut out'],
      shortcut: 'Delete',
      needsDocument: true,
      disabledReason: noSelection,
      run: c.deleteArea,
    },
    {
      id: 'to-new-layer',
      group: 'Select',
      title: 'Copy to new layer',
      description: 'Copy the selected part of the layer onto a new layer of its own, so you can move or change it separately.',
      keywords: ['new layer from selection', 'separate', 'cut out', 'sticker', 'extract'],
      shortcut: shortcut('mod', 'J'),
      needsDocument: true,
      run: c.toNewLayer,
    },
    {
      id: 'center',
      group: 'Select',
      title: 'Center on design',
      description: 'Move the selected part (or what is on the selected layer) so it sits exactly in the middle of your design.',
      keywords: ['center', 'middle', 'align', 'centre'],
      needsDocument: true,
      run: c.center,
    },
    {
      id: 'layer-new',
      group: 'Layers',
      title: 'New layer',
      description: 'Add a clear sheet above the selected layer, so you can paint without changing what is below.',
      keywords: ['add layer', 'new sheet', 'transparent layer', 'layer'],
      needsDocument: true,
      run: c.layerAdd,
    },
    {
      id: 'layer-duplicate',
      group: 'Layers',
      title: 'Duplicate layer',
      description: 'Make an exact copy of the selected layer, placed right above it.',
      keywords: ['copy layer', 'clone', 'duplicate'],
      needsDocument: true,
      run: c.layerDuplicate,
    },
    {
      id: 'layer-up',
      group: 'Layers',
      title: 'Move layer up',
      description: 'Move the selected layer toward the front.',
      keywords: ['bring forward', 'raise', 'front', 'arrange', 'order'],
      needsDocument: true,
      disabledReason: doc && activeIndex === doc.layers.length - 1 ? 'This layer is already at the front.' : undefined,
      run: c.layerUp,
    },
    {
      id: 'layer-down',
      group: 'Layers',
      title: 'Move layer down',
      description: 'Move the selected layer toward the back.',
      keywords: ['send backward', 'lower', 'back', 'behind', 'arrange', 'order'],
      needsDocument: true,
      disabledReason: activeIndex === 0 ? 'This layer is already at the back.' : undefined,
      run: c.layerDown,
    },
    {
      id: 'layer-visibility',
      group: 'Layers',
      title: active && !active.visible ? 'Show layer' : 'Hide layer',
      description: 'Hide or show the selected layer. Hidden layers are left out when you download.',
      keywords: ['hide', 'show', 'visible', 'invisible', 'eye'],
      needsDocument: true,
      run: c.layerToggle,
    },
    {
      id: 'layer-delete',
      group: 'Layers',
      title: 'Delete layer',
      description: 'Remove the selected layer and everything on it. You can undo this.',
      keywords: ['remove layer', 'delete', 'trash', 'throw away'],
      needsDocument: true,
      disabledReason: doc && doc.layers.length <= 1 ? 'A design needs at least one layer.' : undefined,
      run: c.layerDelete,
    },
    {
      id: 'resize-design',
      group: 'Whole design',
      title: 'Resize design…',
      description: 'Make the whole design, with every layer, bigger or smaller.',
      keywords: ['resize', 'image size', 'scale', 'bigger', 'smaller', 'dimensions', 'pixels', 'shrink', 'enlarge'],
      needsDocument: true,
      run: c.resizeDesign,
    },
    {
      id: 'crop-to-selection',
      group: 'Whole design',
      title: 'Crop to selection',
      description: 'Cut the design down to the selected area. Nothing is thrown away, so you can undo it.',
      keywords: ['crop', 'trim', 'cut down', 'selection'],
      needsDocument: true,
      disabledReason: noSelection,
      run: c.cropToSelection,
    },
    {
      id: 'rotate-design-left',
      group: 'Whole design',
      title: 'Turn design left',
      description: 'Turn the whole design a quarter turn to the left.',
      keywords: ['rotate', 'turn', 'left', 'counterclockwise', 'sideways', 'portrait', 'landscape'],
      needsDocument: true,
      run: () => c.rotateDesign(-1),
    },
    {
      id: 'rotate-design-right',
      group: 'Whole design',
      title: 'Turn design right',
      description: 'Turn the whole design a quarter turn to the right.',
      keywords: ['rotate', 'turn', 'right', 'clockwise', 'sideways', 'portrait', 'landscape'],
      needsDocument: true,
      run: () => c.rotateDesign(1),
    },
    {
      id: 'flip-design-horizontal',
      group: 'Whole design',
      title: 'Flip design left to right',
      description: 'Mirror the whole design, so the left side becomes the right side.',
      keywords: ['flip', 'mirror', 'reverse', 'horizontal'],
      needsDocument: true,
      run: () => c.flipDesign('horizontal'),
    },
    {
      id: 'flip-design-vertical',
      group: 'Whole design',
      title: 'Flip design upside down',
      description: 'Mirror the whole design top to bottom.',
      keywords: ['flip', 'mirror', 'upside down', 'vertical'],
      needsDocument: true,
      run: () => c.flipDesign('vertical'),
    },
    {
      id: 'zoom-in',
      group: 'View',
      title: 'Zoom in',
      description: 'See your design bigger, to work on small details. Your design itself does not change.',
      keywords: ['bigger', 'closer', 'magnify', 'enlarge', 'larger', 'zoom'],
      shortcut: shortcut('mod', 'Plus'),
      needsDocument: true,
      run: c.zoomIn,
    },
    {
      id: 'zoom-out',
      group: 'View',
      title: 'Zoom out',
      description: 'See your design smaller, so more of it fits. Your design itself does not change.',
      keywords: ['smaller', 'farther', 'shrink', 'zoom', 'back', 'away'],
      shortcut: shortcut('mod', 'Minus'),
      needsDocument: true,
      run: c.zoomOut,
    },
    {
      id: 'fit',
      group: 'View',
      title: 'Fit on screen',
      description: 'Show your whole design, as big as fits in the window.',
      keywords: ['fit', 'whole', 'all', 'entire', 'screen', 'reset', 'center', 'see everything'],
      shortcut: shortcut('mod', '0'),
      needsDocument: true,
      run: c.fit,
    },
    {
      id: 'actual-size',
      group: 'View',
      title: 'Actual size (100%)',
      description: 'Show your design at its real size: each pixel of your design takes one pixel of your screen.',
      keywords: ['100', 'real', 'actual', 'original', 'pixels', 'true size'],
      shortcut: shortcut('mod', 'alt', '0'),
      needsDocument: true,
      run: c.actualSize,
    },
    {
      id: 'brush-bigger',
      group: 'Brush',
      title: 'Bigger brush',
      description: 'Make the brush or eraser thicker.',
      keywords: ['thicker', 'wider', 'brush size', 'increase size', 'bigger'],
      shortcut: ']',
      run: c.biggerBrush,
    },
    {
      id: 'brush-smaller',
      group: 'Brush',
      title: 'Smaller brush',
      description: 'Make the brush or eraser thinner.',
      keywords: ['thinner', 'narrower', 'brush size', 'decrease size', 'smaller'],
      shortcut: '[',
      run: c.smallerBrush,
    },
    ...TOOLS.map(
      (t): Action => ({
        id: `tool-${t.id}`,
        group: 'Tools',
        title: `${t.name} tool`,
        description: t.description,
        keywords: t.keywords,
        shortcut: t.key,
        run: () => c.setTool(t.id),
      }),
    ),
  ]
}
