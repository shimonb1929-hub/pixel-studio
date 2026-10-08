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
  the current tool does.
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
| `npm test` | Runs the unit tests (zoom math, search, file names) |
| `npm run test:e2e` | Opens the program in a real browser and clicks through every feature |
| `npm run lint` | Checks the code for common mistakes |

Before the first `npm run test:e2e` on a new computer, run `npx playwright install chromium` once.

## How the code is organized

```
src/
  editor/        The engine: document and layers, zoom math, drawing, opening and downloading files
  components/    The screens: top bar, tool dock, canvas, layers, dialogs, search, tooltips
  actions.ts     Every action, described once in plain words; the menu, search and tips read it
  tools.ts       The tools, their explanations and hints
  presets.ts     The ready-made sizes
  App.tsx        Connects everything and handles keyboard shortcuts
e2e/             Browser tests that use the program like a person would
```

Each layer is its own off-screen canvas. The visible canvas draws the layers on top of each
other at the current zoom, so editing never touches the screen directly.

## Roadmap

1. **Foundation** (done) — start from a ready-made or custom size, open a picture (button or
   drag and drop), zoom and move around, download as PNG or JPG, layers panel, search,
   hover help everywhere.
2. **Drawing** — brush, eraser, color picker, color panel.
3. **Layers** — add, delete, reorder, rename, opacity.
4. **Undo and redo**, plus saving and reopening editable project files.
5. **Selections and changes** — select areas, move, crop, resize, rotate, flip.
6. **Adjustments and filters** — brightness, contrast, colors, blur, sharpen.
7. **Vector shapes** — rectangles, circles, lines and a pen tool, with editable fill and outline.
8. **Text** — text layers, fonts, sizes, paragraph settings.
9. **Pages and layout** — multi-page documents, guides, text boxes, PDF export.
