# Pixel Studio

A design program that runs in the browser: Photoshop, Illustrator and InDesign in one —
photo editing, drawing, vector shapes, text and page layout.

The goal has two halves, and both matter equally:

- **Professional results.** Anything you can make with the professional tools, you should be
  able to make here, at the same quality. Advanced features are not left out; they are made
  easy to reach.
- **Simple enough for a 15-year-old** who has never used a design program. Every feature is
  explained in plain words, starts from a good default, and can be tried before it's kept.

## Design principles

Pixel Studio should feel obvious to a 15-year-old and still produce professional work.

- **Start from what you're making.** The first screen asks "What are you making today?" and
  offers ready-made sizes (square post, phone story, A4 page, poster…). One click and you're in.
  People coming back see their own designs first, with a preview of each.
- **Ask in your own words.** The "What do you want to do?" search (Ctrl+K) finds any action from
  everyday words: "save" finds Download, "bigger" finds Zoom in, "photo" finds Open.
- **Everything explains itself.** Every tool, button, menu item and option has a short,
  plain-language tip on hover. Options show a live note that describes the current choice.
  Buttons that can't be used yet still explain why and what to do first.
- **The program always says what will happen.** A hint at the top of the canvas describes what
  the current tool does, and Undo names the exact step it will take back ("Undo brush stroke").
- **Drawing that looks good from the first stroke.** Ready-made brushes (Pencil, Ink pen, Marker,
  Soft brush, Highlighter) each show a live sample. "Steady hand" smooths shaky lines, pen
  pressure works on drawing tablets, and one stroke never gets darker where it crosses itself.
- **Try first, then decide.** Resizing, turning, cropping and adjusting colors show the result live,
  with the exact size and angle. Nothing changes until you press Apply (or Enter); Esc puts it back.
  While adjusting, press and hold on the design to compare with how it was.
- **Looks before sliders.** Adjust starts with ready-made looks (Black & white, Old photo, Vivid,
  Warm, Cool, Soft, Dramatic, Dreamy), each previewed on your own picture. The sliders underneath
  (brightness, contrast, color strength, warmth, blur, sharpen) fine-tune any look.
- **Mistakes are safe.** Every design starts as paper with a clear sheet on top, so the eraser
  only rubs out your drawing. Undo goes back up to 100 steps.
- **Nothing is ever lost.** Every design is kept in the browser as you work, with all its layers,
  and "Saved" at the top says so. Closing the design, the tab or the whole browser is always
  safe: it waits under "Your designs" on the start screen. Download it as a Project to keep a
  copy or move it to another computer. If the browser can't keep designs (some private
  windows), the top says "Not saved", and closing with changes that aren't downloaded asks first.
- **Calm, light and clean.** Soft grays, white cards, one blue for "you can click this", and
  simple line icons with labels. No decorative pictures, logos or emojis.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the program locally and reloads on every change |
| `npm run build` | Checks the types and builds the finished site into `dist/` |
| `npm test` | Runs the unit tests (zoom math, colors, undo history, brushes, layers, search, project files, adjustments) |
| `npm run test:e2e` | Opens the program in a real browser, on a normal and a sharp (Retina) screen, and uses every feature |
| `npm run lint` | Checks the code for common mistakes |

Before the first `npm run test:e2e` on a new computer, run `npx playwright install chromium` once.

## How the code is organized

```
src/
  editor/
    stroke.ts    The brush engine: dabs, smoothing, pressure, and painting into a layer
    selection.ts Selections as shapes (rectangle, oval, freehand) that add, take away or invert
    transform.ts The Resize and rotate box: handles, turning, flipping and the math behind them
    flood.ts     Finding the area the fill bucket fills
    adjust.ts    Brightness, contrast, color strength, warmth, blur and sharpen, and the ready-made looks
    adjustSession.ts  Which part changes, quick previews at screen size, and the full-detail result
    history.ts   Undo and redo, with memory limits and "changed since download" tracking
    project.ts   Project files: every layer and setting in one file, checked carefully when opened
    library.ts   "Your designs": designs kept in the browser (IndexedDB)
    layers.ts    Adding, removing, moving and changing layers
    brushes.ts   The ready-made brushes and erasers
    color.ts     Color codes and the color picker math
    ...          The document, zoom math, drawing to screen, opening and downloading files
  components/    The screens: top bar, tool settings, canvas, color, layers, dialogs, search, tips
  hooks/         The editor state (document, layers, undo), automatic saving and element sizes
  actions.ts     Every action, described once in plain words; the menu, search and tips read it
  tools.ts       The tools, their explanations and hints
  presets.ts     The ready-made sizes
  App.tsx        Connects everything and handles keyboard shortcuts
e2e/             Browser tests that use the program like a person would
```

Each layer is its own off-screen canvas with a position, and grows when you paint or move
things past its edge, so nothing is ever cut off by accident. Cropping only moves the layers and
changes the design size, so undo brings back everything.

A brush stroke paints onto a separate stroke canvas and is shown on a preview of the layer while
you draw; when you let go, the changed area is copied into the layer and kept for undo.

A project (`.pixel`) is the letters `PXSTUDIO`, a JSON description of the design (size, layers
with their names, positions, visibility and opacity, the selection), and then each layer's
pixels as a PNG. Designs kept in the browser use the same format. Saving happens a moment after
each change (and right away when you switch tabs or leave a design); only layers whose pixels
changed are encoded again, so saving stays quick on poster-size designs.

Adjustments are worked out on the pixels themselves (no graphics-card tricks), so they look the
same in every browser. Previews only use as much detail as the screen shows. Blur is done on a
smaller copy when it's strong (a blurred picture has no fine detail to lose), and sharpening
compares each pixel with a soft copy the canvas makes by shrinking and enlarging the picture, which
keeps a 12-megapixel photo to well under a second. Blur repeats a photo's edge pixels rather than
pulling in see-through pixels, so blurred photos keep solid edges.

## Roadmap

1. **Foundation** (done) — start from a ready-made or custom size, open a picture (button or
   drag and drop), zoom and move around, download as PNG or JPG, search, hover help everywhere.
2. **Drawing** (done) — brushes and erasers with live samples, steady hand, pen pressure,
   straight lines, colors with a picker, swatches and recent colors, undo and redo, layers
   (add, duplicate, delete, reorder, rename, hide, opacity), protection against losing work.
3. **Selections, changes and saving** (done) — select areas (rectangle, oval, freehand; add,
   take away, invert), move, copy and paste, resize, turn and flip with handles, crop with
   ready-made shapes, resize or turn the whole design, fill bucket, automatic saving in the
   browser with "Your designs" on the start screen, project files with every layer, renaming.
4. **Adjustments and looks** (done) — ready-made looks with previews, brightness, contrast, color
   strength, warmth, blur and sharpen, on a layer or just the selected part, with press-and-hold
   to compare.
5. **Shapes and the pen** (Illustrator) — shape layers that stay sharp at any size and stay
   editable: rectangles, rounded corners, ovals, polygons, stars, lines and arrows; a pen for
   curves with editable points; fills (color and gradient) and outlines (width, dashes, ends);
   combine shapes (join, cut out, overlap); align, distribute and snapping guides; SVG export.
6. **Text** (all three) — text layers, fonts, size, spacing, alignment, paragraphs, text in a
   box and along a path, text effects.
7. **Pages and print** (InDesign) — multi-page documents, master pages, margins, columns and
   guides, text that flows from box to box, print-ready PDF with bleed.
8. **Pro layers and photo tools** (Photoshop) — blend modes, layer masks, layer groups, effects
   (shadow, glow, outline), adjustments that stay editable, curves and levels, clone and heal,
   select by color and select subject.
9. **Ready to sell** — accounts, saving to the cloud, payments and a free trial.
