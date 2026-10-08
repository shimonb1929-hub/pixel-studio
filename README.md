# Pixel Studio

A design program that runs in the browser. The goal is to cover most of what people do in
Photoshop, Illustrator and InDesign — photo editing, drawing, vector shapes, text and page
layout — while staying simple enough for a child or someone who has never used a design
program.

## Design principles

Pixel Studio should feel obvious to a 10-year-old and still be able to do real work.

- **Start from what you're making.** The first screen asks "What are you making today?" and
  offers ready-made sizes (square post, phone story, A4 page, poster…). One click and you're in.
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
- **Try first, then decide.** Resizing, turning and cropping show the result live while you drag,
  with the exact size and angle. Nothing changes until you press Apply (or Enter); Esc puts it back.
- **Mistakes are safe.** Every design starts as paper with a clear sheet on top, so the eraser
  only rubs out your drawing. Undo goes back up to 100 steps, and closing a design with changes
  you haven't downloaded asks first.
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
| `npm test` | Runs the unit tests (zoom math, colors, undo history, brushes, layers, search) |
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
    history.ts   Undo and redo, with memory limits and "changed since download" tracking
    layers.ts    Adding, removing, moving and changing layers
    brushes.ts   The ready-made brushes and erasers
    color.ts     Color codes and the color picker math
    ...          The document, zoom math, drawing to screen, opening and downloading files
  components/    The screens: top bar, tool settings, canvas, color, layers, dialogs, search, tips
  hooks/         The editor state (document, layers, undo) and element sizes
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

## Roadmap

1. **Foundation** (done) — start from a ready-made or custom size, open a picture (button or
   drag and drop), zoom and move around, download as PNG or JPG, search, hover help everywhere.
2. **Drawing** (done) — brushes and erasers with live samples, steady hand, pen pressure,
   straight lines, colors with a picker, swatches and recent colors, undo and redo, layers
   (add, duplicate, delete, reorder, rename, hide, opacity), protection against losing work.
3. **Selections and changes** (in progress) — done: select areas (rectangle, oval, freehand; add,
   take away, invert), move, copy and paste, resize, turn and flip with handles, crop with
   ready-made shapes, resize or turn the whole design, fill bucket. Next: save and reopen
   projects with all their layers, with automatic saving.
4. **Adjustments and filters** — brightness, contrast, colors, blur, sharpen.
5. **Vector shapes** — rectangles, circles, lines and a pen tool, with editable fill and outline.
6. **Text** — text layers, fonts, sizes, paragraph settings.
7. **Pages and layout** — multi-page documents, guides, text boxes, PDF export.
8. **Ready to sell** — accounts, saving to the cloud, payments and a free trial.
