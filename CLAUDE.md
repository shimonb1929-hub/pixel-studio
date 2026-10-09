# Working on Pixel Studio

## The goal (keep every decision tied to it)

Pixel Studio is Photoshop, Illustrator and InDesign in one program, in the browser.

- **Professional results**: anything you can make with the professional tools, you must be able to
  make here, at the same quality. Do not leave out advanced features; make them easy to reach.
- **Simple enough for a 15-year-old** who has never used a design program: plain words, good
  defaults, live previews before anything is kept, hover help on everything.

When choosing what to build next, ask: what is the biggest gap between what a professional can make
with Photoshop, Illustrator or InDesign and what someone can make here? The README's design
principles and roadmap describe the plan.

## How the owner likes to work

- Do not send screenshots or images unless asked. Check visual work yourself, then report in words.
- Keep moving: when a stage is done, commit, push and say what is next.
- Before pushing, run `npm test`, `npm run lint`, `npm run build` and `npx playwright test`
  (do not edit files while the browser tests run: the dev server reloads the page).
