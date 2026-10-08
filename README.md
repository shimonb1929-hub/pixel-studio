# Pixel Studio

A design program that runs in the browser. The goal is to cover most of what people do in
Photoshop, Illustrator and InDesign — photo editing, drawing, vector shapes, text and page
layout — while staying simple enough for someone who has never used a design program.

## Principles

- **Plain language.** Every tool, button and option explains itself when you hover over it,
  in one or two short sentences.
- **Live explanations.** When an option has choices, the text under it describes what the
  current choice does, and updates as you change it.
- **Clean interface.** No decorative pictures, logos or emojis — only simple line icons on
  the tool buttons.

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
| `npm test` | Runs the automated tests |
| `npm run lint` | Checks the code for common mistakes |

## How the code is organized

```
src/
  editor/       The engine: document and layers, zoom math, drawing, opening and exporting files
  components/   The screens: menu, toolbars, canvas, layers panel, dialogs, tooltips
  App.tsx       Connects everything and handles keyboard shortcuts
```

Each layer is its own off-screen canvas. The visible canvas draws the layers on top of each
other at the current zoom, so editing never touches the screen directly.

## Roadmap

1. **Foundation** (done) — new image, open image (button or drag and drop), zoom and move
   around, export as PNG or JPG, layers panel, hover help everywhere.
2. **Drawing** — brush, eraser, color picker, color panel.
3. **Layers** — add, delete, reorder, rename, opacity.
4. **Undo and redo**, plus saving and reopening editable project files.
5. **Selections and changes** — select areas, move, crop, resize, rotate, flip.
6. **Adjustments and filters** — brightness, contrast, colors, blur, sharpen.
7. **Vector shapes** — rectangles, circles, lines and a pen tool, with editable fill and outline.
8. **Text** — text layers, fonts, sizes, paragraph settings.
9. **Pages and layout** — multi-page documents, guides, text boxes, PDF export.
