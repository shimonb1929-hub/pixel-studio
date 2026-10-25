# Working on Pixel Studio

Read [VISION.md](VISION.md) first: it holds the vision and core values every decision must serve.

## The goal (keep every decision tied to it)

Pixel Studio is Photoshop, Illustrator and InDesign in one program, in the browser.

- **Professional results**: anything you can make with the professional tools, you must be able to
  make here, at the same quality. Do not leave out advanced features; make them easy to reach.
- **Simple enough for a 15-year-old** who has never used a design program: plain words, good
  defaults, live previews before anything is kept, hover help on everything.
- **New and easy, not a copy**: reach the same results as the professional tools without their
  old-fashioned, hard-to-learn ideas (masks, channels, clipping paths, adjustment layers). Find a
  direct way instead: a photo goes inside a shape by dropping it on the shape; adjustments stay
  changeable on the layer itself. Layers are fine: they are simple.
- **English, Hebrew and Yiddish are all first-class**: right-to-left text must always work perfectly
  (typing, wrapping, numbers and punctuation inside it, fonts that have the letters). The text
  browser test checks that finished text matches what was shown while typing; keep it passing.
- **Everything is an object**: pictures, photos and shapes are all picked with a click, dragged to
  move, resized from a corner and turned with the round handle (the Arrange tool). Pictures keep
  their original pixels, so nothing gets blurry from resizing.

- **No pictures on the site itself**: no sample photos, preview pictures, template images or
  illustrations anywhere in the app, and never pictures of people. Previews show the user's own
  work, or plain shapes, colors and words. The user's own photos in their designs are fine.

## Naming and help (every thread must follow this)

- **Plain name first**: every tool, panel, setting and button gets a name a 10-year-old understands
  ("Color strength", "How solid", "Keep together", "Fix spots"), never the pro word alone
  ("Saturation", "Opacity", "Group", "Healing brush").
- **The pro word stays findable**: add the pro word to `PRO_NAMES` in `src/proNames.ts` (keyed by the
  English plain word). Every hover tip then ends with "Other programs call this …", the Help guide's
  Pro words list shows it, and searching Help for the pro word finds it. Pro words stay in English.
  If the same plain word means different things in different places (Size, Softness, Strength),
  pass `pro="…"` on that tip or slider instead. A test checks every `PRO_NAMES` word is still used.
- **Every tool explains itself**: a new tool in `src/tools.ts` needs `description` (what it does),
  `when` (when to use it), `hint` (how) and `pro`. A new kind of task people come to do gets a line
  in `GOALS` in `src/help.ts` ("I want to…", how, and the tool or action that does it).
- Hover tips stay short: one or two sentences of what it does, in everyday words.

When choosing what to build next, ask: what is the biggest gap between what a professional can make
with Photoshop, Illustrator or InDesign and what someone can make here? The README's design
principles and roadmap describe the plan.

## How the owner likes to work

- Do not send screenshots or images unless asked. Check visual work yourself, then report in words.
- Keep moving: when a stage is done, commit, push and say what is next.
- The live site runs on Railway and deploys from `main`. Push finished, fully tested stages straight
  to `main` (the owner asked for this); never push half-done work there.
- Before pushing, run `npm test`, `npm run lint`, `npm run build` and `npx playwright test`
  (do not edit files while the browser tests run: the dev server reloads the page).
