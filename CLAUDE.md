# Working on Pixel Studio

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
