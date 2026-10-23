import type { Action } from './actions.ts'
import { LOOKS } from './editor/adjust.ts'
import { activeLayer } from './editor/layers.ts'
import type { LineUpEdge } from './editor/organize.ts'
import type { EditorDocument, ToolId } from './editor/types.ts'
import { shortcut } from './keys.ts'
import { TEXT_KINDS, type TextKind } from './text/presets.ts'
import { TOOLS } from './tools.ts'
import { inSentence, msg, t } from './i18n/i18n.ts'

export interface AppCommands {
  newDesign: () => void
  open: () => void
  addPhoto: () => void
  addText: (kind: TextKind) => void
  // Picks the page, so the Color panel colors it.
  colorPage: () => void
  download: () => void
  downloadProject: () => void
  downloadPdf: () => void
  renameDesign: () => void
  installApp: () => void
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
  layerToFront: () => void
  layerToBack: () => void
  layerToggle: () => void
  layerDelete: () => void
  keepTogether: () => void
  takeApart: () => void
  tidyUp: () => void
  lineUp: (edge: LineUpEdge) => void
  spreadOut: (axis: 'x' | 'y') => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  actualSize: () => void
  search: () => void
  biggerBrush: () => void
  smallerBrush: () => void
  setTool: (tool: ToolId) => void
  // Opens Adjust with a ready-made look ready to try.
  showLook: (lookId: string) => void
  // Opens the Effects panel for what is picked.
  showEffects: () => void
  removeBackground: () => void
}

interface ActionState {
  doc: EditorDocument | null
  undoLabel: string | null
  redoLabel: string | null
  app: { installed: boolean; canInstall: boolean }
  // Why what's picked can't be kept together or taken apart (null when it can), and the things
  // picked together, if several are.
  organize: { keepTogether: string | null; takeApart: string | null; picked: string[] | null }
}

const LINE_UPS: { edge: LineUpEdge; title: string; description: string; keywords: string[] }[] = [
  { edge: 'left', title: msg('Line up left edges'), description: msg('Move what is picked so their left edges line up. One thing on its own goes to the left edge of the page.'), keywords: ['align left', 'left'] },
  { edge: 'center', title: msg('Line up centers'), description: msg('Move what is picked so they line up through their centers, one above the other. One thing on its own goes to the middle of the page, left to right.'), keywords: ['align center', 'center horizontally', 'centre'] },
  { edge: 'right', title: msg('Line up right edges'), description: msg('Move what is picked so their right edges line up. One thing on its own goes to the right edge of the page.'), keywords: ['align right', 'right'] },
  { edge: 'top', title: msg('Line up tops'), description: msg('Move what is picked so their tops line up. One thing on its own goes to the top of the page.'), keywords: ['align top', 'top'] },
  { edge: 'middle', title: msg('Line up middles'), description: msg('Move what is picked so they line up through their middles, side by side. One thing on its own goes to the middle of the page, top to bottom.'), keywords: ['align middle', 'center vertically', 'centre'] },
  { edge: 'bottom', title: msg('Line up bottoms'), description: msg('Move what is picked so their bottoms line up. One thing on its own goes to the bottom of the page.'), keywords: ['align bottom', 'bottom'] },
]

const NOTHING_SELECTED = msg('Select an area first, with the Select tool.')

// Everything a person can do, in plain words. The menu, the search box and the hover tips all
// come from this one list.
export function buildActions({ doc, undoLabel, redoLabel, app, organize }: ActionState, c: AppCommands): Action[] {
  const active = doc ? activeLayer(doc) : undefined
  const activeIndex = doc && active ? doc.layers.indexOf(active) : -1
  const noLayerPicked = doc && !active ? t('Pick something on your design first.') : undefined
  const noSelection = doc && !doc.selection ? t(NOTHING_SELECTED) : undefined
  const pickSeveral = t('Pick two or more things first: drag a box around them on your design, or hold Shift and click each one.')

  return [
    {
      id: 'new',
      group: 'Design',
      title: t('New design…'),
      description: t('Start a fresh, empty design. You choose its size and background color.'),
      keywords: ['new', 'blank', 'start', 'create', 'canvas', 'empty', 'begin', 'make', 'size'],
      shortcut: shortcut('mod', 'alt', 'N'),
      run: c.newDesign,
    },
    {
      id: 'open',
      group: 'Design',
      title: t('Open…'),
      description: t('Pick a picture or a Pixel Studio project from your computer to edit it. You can also drop a file onto the window.'),
      keywords: ['open', 'photo', 'picture', 'image', 'upload', 'import', 'load', 'file', 'project', 'continue'],
      shortcut: shortcut('mod', 'O'),
      run: c.open,
    },
    {
      id: 'add-photo',
      group: 'Design',
      title: t('Add a photo…'),
      description:
        t('Put a picture from your computer into this design, on a layer of its own. It keeps all its quality, however often you resize it. Dropping a picture onto a shape fills the shape with it.'),
      keywords: ['add photo', 'add picture', 'insert', 'place', 'import', 'image', 'photo', 'picture', 'logo'],
      shortcut: shortcut('mod', 'shift', 'O'),
      needsDocument: true,
      run: c.addPhoto,
    },
    {
      id: 'color-page',
      group: 'Design',
      title: t('Color the page'),
      description: t('Picks the page, so the Color panel colors it. You can also click an empty spot on the page.'),
      keywords: ['background', 'background color', 'page color', 'paper color', 'backdrop', 'fill page'],
      needsDocument: true,
      run: c.colorPage,
    },
    ...(['heading', 'subheading', 'body'] as const).map((kind) => ({
      id: `add-${kind}`,
      group: 'Design' as const,
      title: TEXT_KINDS[kind].addTitle,
      description: t('{description} Type in English, Hebrew or Yiddish; Hebrew and Yiddish read right to left by themselves.', { description: TEXT_KINDS[kind].description }),
      keywords: ['text', 'type', 'write', 'words', 'letters', 'font', 'title', kind, kind === 'body' ? 'paragraph' : 'headline', 'hebrew', 'yiddish', 'caption'],
      needsDocument: true,
      run: () => c.addText(kind),
    })),
    {
      id: 'download',
      group: 'Design',
      title: t('Download…'),
      description: t('Save your design to your computer as a picture to share, a page to print (PDF), or a project to keep editing.'),
      keywords: ['save', 'export', 'download', 'share', 'png', 'jpg', 'jpeg', 'print', 'pdf', 'printer', 'file', 'keep'],
      shortcut: shortcut('mod', 'S'),
      needsDocument: true,
      run: c.download,
    },
    {
      id: 'download-pdf',
      group: 'Design',
      title: t('Download as PDF…'),
      description: t('Save your design as a PDF page, ready to print at home or at a print shop, or to send. Text stays sharp.'),
      keywords: ['pdf', 'print', 'printer', 'print shop', 'paper', 'bleed', 'crop marks', 'cut', 'send', 'email', 'document'],
      needsDocument: true,
      run: c.downloadPdf,
    },
    {
      id: 'download-project',
      group: 'Design',
      title: t('Download project…'),
      description:
        t('Save your design with all its layers as a project file. Open it again later to keep editing, or on another computer.'),
      keywords: ['save project', 'project', 'layers', 'backup', 'keep editing', 'later', 'another computer', 'move', 'file'],
      needsDocument: true,
      run: c.downloadProject,
    },
    {
      id: 'rename',
      group: 'Design',
      title: t('Rename design…'),
      description: t("Change your design's name. You'll see it under Your designs, and it becomes the file name when you download."),
      keywords: ['rename', 'name', 'title', 'call', 'label'],
      needsDocument: true,
      run: c.renameDesign,
    },
    {
      id: 'install',
      group: 'Design',
      title: t('Install as an app'),
      description:
        t('Add Pixel Studio to this computer, so it opens in its own window from your desktop or Start menu, like any other program, and works without internet.'),
      keywords: ['install', 'app', 'desktop', 'program', 'offline', 'start menu', 'dock', 'shortcut', 'application'],
      disabledReason: app.installed
        ? t('Pixel Studio is already installed. Open it from your desktop, Start menu or dock.')
        : app.canInstall
          ? undefined
          : t("This browser can't install it from here. In Chrome or Edge, click the install button at the right end of the address bar."),
      run: c.installApp,
    },
    {
      id: 'close',
      group: 'Design',
      title: t('Close design'),
      description: t('Close this design and go back to the start. It stays in this browser, so you can open it again from Your designs.'),
      keywords: ['close', 'exit', 'finish', 'done', 'start over', 'home'],
      needsDocument: true,
      run: c.close,
    },
    {
      id: 'undo',
      group: 'Edit',
      title: undoLabel ? t('Undo {step}', { step: inSentence(undoLabel) }) : t('Undo'),
      description: t('Take back your last change. Press again to keep going back.'),
      keywords: ['undo', 'back', 'oops', 'mistake', 'revert', 'take back'],
      shortcut: shortcut('mod', 'Z'),
      needsDocument: true,
      disabledReason: undoLabel ? undefined : t('Nothing to undo yet.'),
      run: c.undo,
    },
    {
      id: 'redo',
      group: 'Edit',
      title: redoLabel ? t('Redo {step}', { step: inSentence(redoLabel) }) : t('Redo'),
      description: t('Bring back a change you just undid.'),
      keywords: ['redo', 'again', 'forward', 'bring back'],
      shortcut: shortcut('mod', 'shift', 'Z'),
      needsDocument: true,
      disabledReason: redoLabel ? undefined : t('Nothing to redo. Redo works right after you undo.'),
      run: c.redo,
    },
    {
      id: 'copy',
      group: 'Edit',
      title: t('Copy'),
      description: t('Copy the selected part of the selected layer (or the whole layer if nothing is selected), so you can paste it.'),
      keywords: ['copy', 'duplicate', 'clipboard'],
      shortcut: shortcut('mod', 'C'),
      needsDocument: true,
      run: c.copy,
    },
    {
      id: 'cut',
      group: 'Edit',
      title: t('Cut'),
      description: t('Copy the selected part and remove it from the layer, so you can paste it somewhere else.'),
      keywords: ['cut', 'scissors', 'take out', 'remove and paste'],
      shortcut: shortcut('mod', 'X'),
      needsDocument: true,
      disabledReason: noSelection,
      run: c.cut,
    },
    {
      id: 'paste',
      group: 'Edit',
      title: t('Paste'),
      description: t('Put what you copied onto a new layer. Pictures copied in other programs can be pasted too.'),
      keywords: ['paste', 'insert', 'put', 'clipboard'],
      shortcut: shortcut('mod', 'V'),
      run: c.paste,
    },
    {
      id: 'select-all',
      group: 'Select',
      title: t('Select all'),
      description: t('Select the whole design.'),
      keywords: ['select all', 'everything', 'whole'],
      shortcut: shortcut('mod', 'A'),
      needsDocument: true,
      run: c.selectAll,
    },
    {
      id: 'deselect',
      group: 'Select',
      title: t('Deselect'),
      description: t('Clear the selection, so you can work on the whole design again.'),
      keywords: ['deselect', 'select none', 'clear selection', 'unselect', 'nothing'],
      shortcut: shortcut('mod', 'D'),
      needsDocument: true,
      disabledReason: noSelection && t('Nothing is selected.'),
      run: c.deselect,
    },
    {
      id: 'invert',
      group: 'Select',
      title: t('Invert selection'),
      description: t('Swap what is selected and what is not.'),
      keywords: ['invert', 'reverse', 'opposite', 'swap', 'everything else'],
      needsDocument: true,
      run: c.invert,
    },
    {
      id: 'fill',
      group: 'Select',
      title: t('Fill with color'),
      description: t('Fill the selected area of the selected layer with your current color. With nothing selected, fills the whole layer.'),
      keywords: ['fill', 'bucket', 'paint area', 'color in', 'flood'],
      shortcut: shortcut('alt', 'Backspace'),
      needsDocument: true,
      run: c.fill,
    },
    {
      id: 'delete-area',
      group: 'Select',
      title: t('Delete selected area'),
      description: t('Erase everything inside the selection on the selected layer.'),
      keywords: ['delete', 'erase area', 'clear', 'remove', 'cut out'],
      shortcut: 'Delete',
      needsDocument: true,
      disabledReason: noSelection,
      run: c.deleteArea,
    },
    {
      id: 'to-new-layer',
      group: 'Select',
      title: t('Copy to new layer'),
      description: t('Copy the selected part of the layer onto a new layer of its own, so you can move or change it separately.'),
      keywords: ['new layer from selection', 'separate', 'cut out', 'sticker', 'extract'],
      shortcut: shortcut('mod', 'J'),
      needsDocument: true,
      run: c.toNewLayer,
    },
    {
      id: 'center',
      group: 'Select',
      title: t('Center on design'),
      description: t('Move the selected part (or what is on the selected layer) so it sits exactly in the middle of your design.'),
      keywords: ['center', 'middle', 'align', 'centre'],
      needsDocument: true,
      run: c.center,
    },
    {
      id: 'layer-new',
      group: 'Layers',
      title: t('New layer'),
      description: t('Add an empty drawing above the selected layer. Painting makes one by itself when it needs to.'),
      keywords: ['add layer', 'new sheet', 'transparent layer', 'layer'],
      needsDocument: true,
      run: c.layerAdd,
    },
    {
      id: 'layer-duplicate',
      group: 'Layers',
      title: t('Duplicate layer'),
      description: t('Make an exact copy of the selected layer, placed right above it.'),
      keywords: ['copy layer', 'clone', 'duplicate'],
      needsDocument: true,
      run: c.layerDuplicate,
    },
    {
      id: 'layer-up',
      group: 'Layers',
      title: t('Bring forward'),
      description: t('Move the selected thing one step toward the front, over the one above it.'),
      keywords: ['move layer up', 'raise', 'front', 'arrange', 'order', 'on top', 'over'],
      shortcut: shortcut('mod', ']'),
      needsDocument: true,
      disabledReason: noLayerPicked ?? (doc && activeIndex === doc.layers.length - 1 ? t('This layer is already at the front.') : undefined),
      run: c.layerUp,
    },
    {
      id: 'layer-down',
      group: 'Layers',
      title: t('Send backward'),
      description: t('Move the selected thing one step toward the back, behind the one below it.'),
      keywords: ['move layer down', 'lower', 'back', 'behind', 'arrange', 'order', 'under'],
      shortcut: shortcut('mod', '['),
      needsDocument: true,
      disabledReason: noLayerPicked ?? (activeIndex === 0 ? t('This layer is already at the back.') : undefined),
      run: c.layerDown,
    },
    {
      id: 'layer-front',
      group: 'Layers',
      title: t('Bring to front'),
      description: t('Put the selected thing in front of everything else.'),
      keywords: ['front', 'top', 'on top', 'over everything', 'arrange', 'order', 'raise'],
      shortcut: shortcut('mod', 'shift', ']'),
      needsDocument: true,
      disabledReason: noLayerPicked ?? (doc && activeIndex === doc.layers.length - 1 ? t('This layer is already at the front.') : undefined),
      run: c.layerToFront,
    },
    {
      id: 'layer-back',
      group: 'Layers',
      title: t('Send to back'),
      description: t('Put the selected thing behind everything else (the page always stays at the very back).'),
      keywords: ['back', 'bottom', 'behind everything', 'arrange', 'order', 'lower'],
      shortcut: shortcut('mod', 'shift', '['),
      needsDocument: true,
      disabledReason: noLayerPicked ?? (activeIndex === 0 ? t('This layer is already at the back.') : undefined),
      run: c.layerToBack,
    },
    {
      id: 'layer-visibility',
      group: 'Layers',
      title: active && !active.visible ? t('Show layer') : t('Hide layer'),
      description: t('Hide or show the selected layer. Hidden layers are left out when you download.'),
      keywords: ['hide', 'show', 'visible', 'invisible', 'eye'],
      needsDocument: true,
      run: c.layerToggle,
    },
    {
      id: 'layer-delete',
      group: 'Layers',
      title: t('Delete layer'),
      description: t('Remove the selected layer and everything on it. You can undo this.'),
      keywords: ['remove layer', 'delete', 'trash', 'throw away'],
      needsDocument: true,
      disabledReason: noLayerPicked,
      run: c.layerDelete,
    },
    {
      id: 'keep-together',
      group: 'Layers',
      title: t('Keep together'),
      description: t('Make the picked things one: they are picked, moved and resized together. Double-click a part to change just it.'),
      keywords: ['group', 'combine', 'join', 'together', 'one'],
      shortcut: shortcut('mod', 'G'),
      needsDocument: true,
      disabledReason: organize.keepTogether ?? undefined,
      run: c.keepTogether,
    },
    {
      id: 'take-apart',
      group: 'Layers',
      title: t('Take apart'),
      description: t('Let the parts of something kept together be picked and moved on their own again.'),
      keywords: ['ungroup', 'separate', 'split', 'apart', 'break'],
      shortcut: shortcut('mod', 'shift', 'G'),
      needsDocument: true,
      disabledReason: organize.takeApart ?? undefined,
      run: c.takeApart,
    },
    {
      id: 'tidy-up',
      group: 'Layers',
      title: t('Tidy up'),
      description: t('Put the picked things in a neat row or column, with even gaps between them, lined up through their middles.'),
      keywords: ['tidy', 'neat', 'distribute', 'align', 'even', 'row', 'column', 'arrange'],
      needsDocument: true,
      disabledReason: organize.picked ? undefined : pickSeveral,
      run: c.tidyUp,
    },
    ...LINE_UPS.map(({ edge, title, description, keywords }): Action => ({
      id: `line-up-${edge}`,
      group: 'Line up',
      title: t(title),
      description: t(description),
      keywords: [...keywords, 'line up', 'align', 'arrange'],
      needsDocument: true,
      disabledReason: noLayerPicked,
      run: () => c.lineUp(edge),
    })),
    {
      id: 'space-across',
      group: 'Line up',
      title: t('Space evenly across'),
      description: t('Make the gaps between three or more picked things the same, left to right. The first and last stay put.'),
      keywords: ['distribute horizontally', 'even', 'spacing', 'gaps', 'spread'],
      needsDocument: true,
      disabledReason: organize.picked ? undefined : pickSeveral,
      run: () => c.spreadOut('x'),
    },
    {
      id: 'space-down',
      group: 'Line up',
      title: t('Space evenly down'),
      description: t('Make the gaps between three or more picked things the same, top to bottom. The first and last stay put.'),
      keywords: ['distribute vertically', 'even', 'spacing', 'gaps', 'spread'],
      needsDocument: true,
      disabledReason: organize.picked ? undefined : pickSeveral,
      run: () => c.spreadOut('y'),
    },
    {
      id: 'resize-design',
      group: 'Whole design',
      title: t('Resize design…'),
      description: t('Make the whole design, with every layer, bigger or smaller.'),
      keywords: ['resize', 'image size', 'scale', 'bigger', 'smaller', 'dimensions', 'pixels', 'shrink', 'enlarge', 'inches', 'print size', 'dpi', 'ppi', 'resolution'],
      needsDocument: true,
      run: c.resizeDesign,
    },
    {
      id: 'crop-to-selection',
      group: 'Whole design',
      title: t('Crop to selection'),
      description: t('Cut the design down to the selected area. Nothing is thrown away, so you can undo it.'),
      keywords: ['crop', 'trim', 'cut down', 'selection'],
      needsDocument: true,
      disabledReason: noSelection,
      run: c.cropToSelection,
    },
    {
      id: 'rotate-design-left',
      group: 'Whole design',
      title: t('Turn design left'),
      description: t('Turn the whole design a quarter turn to the left.'),
      keywords: ['rotate', 'turn', 'left', 'counterclockwise', 'sideways', 'portrait', 'landscape'],
      needsDocument: true,
      run: () => c.rotateDesign(-1),
    },
    {
      id: 'rotate-design-right',
      group: 'Whole design',
      title: t('Turn design right'),
      description: t('Turn the whole design a quarter turn to the right.'),
      keywords: ['rotate', 'turn', 'right', 'clockwise', 'sideways', 'portrait', 'landscape'],
      needsDocument: true,
      run: () => c.rotateDesign(1),
    },
    {
      id: 'flip-design-horizontal',
      group: 'Whole design',
      title: t('Flip design left to right'),
      description: t('Mirror the whole design, so the left side becomes the right side.'),
      keywords: ['flip', 'mirror', 'reverse', 'horizontal'],
      needsDocument: true,
      run: () => c.flipDesign('horizontal'),
    },
    {
      id: 'flip-design-vertical',
      group: 'Whole design',
      title: t('Flip design upside down'),
      description: t('Mirror the whole design top to bottom.'),
      keywords: ['flip', 'mirror', 'upside down', 'vertical'],
      needsDocument: true,
      run: () => c.flipDesign('vertical'),
    },
    {
      id: 'zoom-in',
      group: 'View',
      title: t('Zoom in'),
      description: t('See your design bigger, to work on small details. Your design itself does not change.'),
      keywords: ['bigger', 'closer', 'magnify', 'enlarge', 'larger', 'zoom'],
      shortcut: shortcut('mod', 'Plus'),
      needsDocument: true,
      run: c.zoomIn,
    },
    {
      id: 'zoom-out',
      group: 'View',
      title: t('Zoom out'),
      description: t('See your design smaller, so more of it fits. Your design itself does not change.'),
      keywords: ['smaller', 'farther', 'shrink', 'zoom', 'back', 'away'],
      shortcut: shortcut('mod', 'Minus'),
      needsDocument: true,
      run: c.zoomOut,
    },
    {
      id: 'fit',
      group: 'View',
      title: t('Fit on screen'),
      description: t('Show your whole design, as big as fits in the window.'),
      keywords: ['fit', 'whole', 'all', 'entire', 'screen', 'reset', 'center', 'see everything'],
      shortcut: shortcut('mod', '0'),
      needsDocument: true,
      run: c.fit,
    },
    {
      id: 'actual-size',
      group: 'View',
      title: t('Actual size (100%)'),
      description: t('Show your design at its real size: each pixel of your design takes one pixel of your screen.'),
      keywords: ['100', 'real', 'actual', 'original', 'pixels', 'true size'],
      shortcut: shortcut('mod', 'alt', '0'),
      needsDocument: true,
      run: c.actualSize,
    },
    {
      id: 'brush-bigger',
      group: 'Brush',
      title: t('Bigger brush'),
      description: t('Make the brush or eraser thicker.'),
      keywords: ['thicker', 'wider', 'brush size', 'increase size', 'bigger'],
      shortcut: ']',
      run: c.biggerBrush,
    },
    {
      id: 'brush-smaller',
      group: 'Brush',
      title: t('Smaller brush'),
      description: t('Make the brush or eraser thinner.'),
      keywords: ['thinner', 'narrower', 'brush size', 'decrease size', 'smaller'],
      shortcut: '[',
      run: c.smallerBrush,
    },
    {
      id: 'effects',
      group: 'Layers',
      title: t('Shadow, glow or outline…'),
      description: t("Give what is picked a shadow, a glow or an outline, or change how it mixes with what's below. You see each one on your design before you keep it."),
      keywords: ['shadow', 'drop shadow', 'glow', 'outer glow', 'outline', 'stroke', 'border', 'effects', 'fx', 'layer style', 'blend', 'blend mode', 'multiply', 'screen', 'overlay', 'mix'],
      needsDocument: true,
      disabledReason: noLayerPicked,
      run: c.showEffects,
    },
    {
      id: 'remove-background',
      group: 'Layers',
      title: t('Remove background'),
      description: t('AI finds the main thing in the picked photo and makes everything around it see-through. You can undo it.'),
      keywords: ['remove background', 'background eraser', 'cut out', 'cutout', 'transparent', 'see-through', 'isolate', 'remove bg', 'ai'],
      needsDocument: true,
      disabledReason: doc && active?.kind !== 'raster' ? t('Pick a photo or a drawing first: click it on your design.') : undefined,
      run: c.removeBackground,
    },
    ...LOOKS.filter((look) => look.id !== 'original').map(
      (look): Action => ({
        id: `look-${look.id}`,
        group: 'Looks',
        title: t('{look} look', { look: look.name }),
        description: t('{description} You see it first; press Apply to keep it.', { description: look.description }),
        keywords: [...look.keywords, 'look', 'filter', 'effect'],
        needsDocument: true,
        run: () => c.showLook(look.id),
      }),
    ),
    ...TOOLS.map(
      (tool): Action => ({
        id: `tool-${tool.id}`,
        group: 'Tools',
        title: t('{tool} tool', { tool: tool.name }),
        description: tool.description,
        keywords: tool.keywords,
        shortcut: tool.key,
        run: () => c.setTool(tool.id),
      }),
    ),
  ]
}
