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
- **Everything is an object.** Pictures, photos and shapes are all things you click to pick, drag
  to move, pull a corner to resize and turn with the round handle, all with one tool (Arrange).
  Pictures keep their original pixels, so making something tiny and then big again never blurs
  it. Bring forward and send backward put things in front of or behind each other.
- **Lining up happens by itself.** While you drag something, it clicks into line with the page's
  middle and edges and with other things' edges and middles, and into even gaps between things;
  thin pink guides show what lined up. Hold Alt to place it freely. A click or a tap never moves
  anything by accident.
- **A page, not a pile of sheets.** A new design is an empty page of a color (or see-through).
  Nothing has to be set up before you start: painting makes its own drawing, and photos, shapes
  and text each arrive as their own thing. Click an empty spot (or Page in the Layers panel) and
  the Color panel colors the page; the fill bucket does it too.
- **No old-fashioned tricks to learn.** The same results as the professional tools, without their
  hard ideas: drop a photo onto a shape and the shape is filled with it (no clipping masks), and a
  layer's adjustments stay changeable any time (no adjustment layers).
- **English, Hebrew and Yiddish, all first-class.** Type right on the design. Hebrew and Yiddish
  read right to left by themselves; numbers, English words and punctuation inside them land where
  a reader expects, even where lines wrap. What you see while typing is exactly what you get. 175
  free fonts come built in, 62 of them with Hebrew letters and 19 with every Yiddish letter and
  vowel point; fonts made only for English still show Hebrew in a matching Hebrew font, never as
  boxes.
- **Try first, then decide.** Cropping and adjusting colors show the result live. Nothing changes
  until you press Apply (or Enter); Esc puts it back. While adjusting, press and hold on the design
  to compare with how it was. Arranging shows the exact size and angle while you drag, and Undo
  names the step if you change your mind.
- **Looks before sliders.** Adjust starts with ready-made looks (Black & white, Old photo, Vivid,
  Warm, Cool, Soft, Dramatic, Dreamy), each previewed on your own picture. The sliders underneath
  (brightness, contrast, color strength, warmth, blur, sharpen) fine-tune any look.
- **Mistakes are safe.** Painting never goes onto the page, a shape, text or a locked photo: it
  goes on a drawing above, so the eraser only rubs out your drawing. An opened photo starts
  locked. Undo goes back up to 100 steps, and a stroke that made a new drawing is one step.
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
| `npm test` | Runs the unit tests (zoom math, colors, undo history, brushes, layers, search, project files, adjustments, boxes, text layout and reading order) |
| `npm run test:e2e` | Opens the program in a real browser, on a normal and a sharp (Retina) screen, and uses every feature |
| `npm run lint` | Checks the code for common mistakes |

Before the first `npm run test:e2e` on a new computer, run `npx playwright install chromium` once.

## Putting it online

The finished site is plain files (`npm run build` puts them in `dist/`), so any static host works.
The live site runs on Railway, which builds and publishes `main` on every push. Cloudflare Pages
or Netlify work too: build command `npm run build`, output folder `dist`. `public/_headers` tells the host which files
may be kept long and which must always be checked for updates; `.node-version` picks Node 22.

Once online, Chrome and Edge offer to install Pixel Studio as an app (also from Menu → Install as
an app). The installed app opens in its own window, works without internet (`pwa/service-worker.js`
keeps every file of the current version), and opens pictures and `.pixel` projects double-clicked
on the computer.

## How the code is organized

```
src/
  editor/
    stroke.ts    The brush engine: dabs, smoothing, pressure, and painting into a layer
    selection.ts Selections as shapes (rectangle, oval, freehand) that add, take away or invert
    objects.ts   What's on a layer: drawing shapes and pictures, finding what's under the pointer
    arrange.ts   Moving, resizing and turning objects without losing any quality
    compose.ts   Putting all layers together at full detail, for downloads and previews
    transform.ts Boxes with handles: resizing, turning, flipping and the math behind them
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
  text/
    layout.ts    Lines, wrapping, lining up and reading direction (with bidi-js for the Unicode rules)
    textLayer.ts Text objects: measured with the real fonts, drawn, and kept fitted to their box
    fonts.ts     The built-in fonts: loaded only when used, with Hebrew stand-ins for English-only fonts
    fontCatalog.ts  The font list, made by scripts/fonts/fetch.mjs
  components/    The screens: top bar, tool settings, canvas, color, layers, dialogs, search, tips
  hooks/         The editor state (document, layers, undo), automatic saving and element sizes
  actions.ts     Every action, described once in plain words; the menu, search and tips read it
  tools.ts       The tools, their explanations and hints
  presets.ts     The ready-made sizes
  App.tsx        Connects everything and handles keyboard shortcuts
e2e/             Browser tests that use the program like a person would
```

Under everything is the page: just a color, or nothing for a see-through design. On it are three
kinds of layers. A picture layer (a drawing or a photo) is its own off-screen canvas. Moved by whole
pixels it just gets a new position; resized or turned it gets a box, and is drawn from its
original pixels into that box, so nothing is lost however often it changes. Only painting on it
redraws its pixels at the new size. It grows when you paint past its edge, so nothing is ever cut
off by accident. A shape layer and a text layer are each a description (kind, box, fill, outline, corners, points),
drawn fresh at any size; a photo inside a shape is kept whole, with how big it is and which part
shows. Cropping and resizing the design only move layers and change their boxes, so undo, or
resizing back, brings back everything.

A brush stroke paints onto a separate stroke canvas and is shown on a preview of the layer while
you draw; when you let go, the changed area is copied into the layer and kept for undo.

Text is typed into a real browser text box laid exactly over the design (same font, size, spacing,
turn and zoom), so the cursor, selecting, copying and every keyboard, including Hebrew and Yiddish,
work as they do everywhere. When typing ends, the text is drawn on the design with the same layout:
the reading direction of every letter is worked out for the whole paragraph by the Unicode rules
for mixing directions, the paragraph is cut into lines, and each line is drawn as pieces that each
read one way. The baseline is measured from the browser itself, so nothing moves by even a pixel.
A browser test types mixed Hebrew, Yiddish, English, numbers and punctuation and checks that the
finished text matches what was on screen while typing.

The fonts are free fonts from Google Fonts (through Fontsource), under the SIL Open Font License or
the Apache License; each one's license is next to it in `public/fonts/<font>/LICENSE`. They're
loaded only when a design uses them and kept for offline use after that. `node scripts/fonts/fetch.mjs`
downloads them again and rebuilds the font list from `scripts/fonts/list.json`.

A project (`.pixel`) is the letters `PXSTUDIO`, a JSON description of the design (size, layers
with their kind, names, positions, boxes, visibility, opacity, locks and adjustments, shapes, text
with its font and settings, the page color, the selection), and then every picture's pixels as a PNG: each picture
layer, and each photo inside a shape, always at full size. Older projects (versions 1 to 3) still
open, with their paper as a layer. Designs kept in the browser use the same format. Saving happens a moment after
each change (and right away when you switch tabs or leave a design); only layers whose pixels
changed are encoded again, so saving stays quick on poster-size designs.

A whole layer keeps its adjustments as a setting: its pixels stay as they were, and the adjustment
can be changed or removed any time (the Layers panel shows which layers are adjusted). Adjusting
just a selected part changes those pixels.

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
5. **Objects** (done) — everything on the design is an object: one Arrange tool picks, moves,
   resizes, turns and flips anything without losing quality; shapes that stay sharp and editable
   (rectangles with round corners, ovals, polygons, stars, lines and arrows) with fill and outline
   colors; add photos (menu or drag and drop); drop a photo onto a shape to fill it, then zoom and
   slide it inside; lock and delete objects; adjustments that stay changeable; a page with its own
   color (or see-through) instead of a background layer; painting that makes its own drawing; bring
   forward, send backward, to front and to back; lining up and even gaps by themselves while dragging.
6. **Text** (done) — type on the design in English, Hebrew and Yiddish, with right-to-left text
   that never scrambles; quick headings, subheadings and paragraphs; 175 free fonts with live
   previews, Hebrew and Yiddish filters; size, boldness, italic, lining up, reading direction,
   letter and line spacing; boxes that wrap their lines; text resizes, turns and saves like any
   object.
7. **Shapes and the pen** (Illustrator) — a pen for curves with editable points; gradient fills;
   outline dashes and ends; combine shapes (join, cut out, overlap); align, distribute and snapping
   guides; SVG export.
8. **More text** — different fonts and colors inside one text, text along a path, text effects
   (outline, shadow, fill with a photo), your own font files, lists and columns.
9. **Pages and print** (InDesign) — multi-page documents, master pages, margins, columns and
   guides, text that flows from box to box, print-ready PDF with bleed.
10. **Pro layers and photo tools** (Photoshop) — blend modes, groups, effects (shadow, glow,
   outline), curves and levels, clone and heal, select by color and select subject, and an easy
   way to fade or hide parts of a layer (with a brush, never a mask to learn).
11. **Ready to sell** — accounts, saving to the cloud, payments and a free trial.
