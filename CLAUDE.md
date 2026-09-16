# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal site for Ziqian Zheng. **Live at https://www.ziqianzheng.com**, on GitHub Pages
with HTTPS, replacing a Google Sites page that is now unreachable from the domain.

The live site is two pages:

| Route | What it is |
|---|---|
| `/` | Full-screen tessellation. Moving the pointer freezes it, highlights a region and offers "about me". |
| `/about` | A calm, static page: intro, education, links, third-party credit. |

Everything else in `src/` is either supporting code or parked. See **Where things stand**
at the bottom for open threads.

## Working agreement

**Pushing to `main` publishes.** The Actions workflow deploys every push straight to the
live domain; there is no staging step.

So: make the change, run `npm run build`, verify what can be verified, then **stop and let
Ziqian review it at localhost:4321**. Committing locally is fine — the *push* is the gate.
He says "push online" when he is happy.

This matters more than it looks, because much of this site cannot be checked headlessly.
Chrome suspends `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver` and CSS
transitions in background tabs. The tessellation renders only its first frame, the
freeze-and-choose interaction never fires, and canvas screenshots capture a stale
composite. **Anything animated or interactive needs a human in a focused window.**

Where automated checks *are* possible, prefer them, and there are good ones:

- `node scripts/measure-palette.mjs` — how green the palette actually is.
- Synthetic-canvas tests for region picking: build a mosaic of known geometry in a 2D
  canvas, run `pickRegion` against it, and measure. This caught every bug in that module
  and is far more reliable than looking at a screenshot.

## Commands

```sh
npm run dev      # localhost:4321 — prefer `npx astro dev --background` when Claude starts it
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Node >= 22.12. `npx astro dev stop` / `status` / `logs` manage a background dev server.

## Architecture

Astro static site, no UI framework, no client framework. Two ideas carry everything:

**1. Content is ordinary DOM; the canvas is decorative.** Every page works with
JavaScript off, without WebGL, and for a crawler. The audience includes recruiters and
Google Scholar. Never move real content into the canvas.

**2. The tessellation is third-party.** It is a vendored build, patched by script, never
edited by hand. See below.

```
src/pages/index.astro     the arrival screen + the freeze-and-choose interaction
src/pages/about.astro     the about page
src/pages/[draft].astro   serves src/drafts/ in dev only; empty registry right now
src/scripts/pick-region.ts   chooses which region of the canvas to offer
src/data/profile.ts       canonical content: publications, teaching, education, links
src/styles/tokens.css     design tokens
public/tess/              the vendored renderer (see below)
scripts/                  maintenance, not part of the build
design/, docs/            research and deployment notes
src/archive/              parked work, not built — see its README
```

`content/site-content.md` is the raw capture of the old Google Sites page with source
URLs, kept as the provenance record for everything in `profile.ts`.

### Drafts — how to build a page without publishing it

Put the page in `src/drafts/` (same depth as `src/pages/`, so relative imports carry over
unchanged), register it in `src/pages/[draft].astro`, and guard any link *to* it with
`import.meta.env.DEV`. `getStaticPaths` returns nothing in a production build, so the URL
does not exist on the live site while `astro dev` serves it normally.

Publishing is undoing those three steps. This is how the about page was built.

Gotcha: **Astro hoists `getStaticPaths` into its own scope**, so it cannot read anything
else in the frontmatter — slugs must be written out inside it.

### The arrival interaction

In `src/pages/index.astro`, with region selection in `src/scripts/pick-region.ts`.

Pointer moves → the scene freezes → a region is chosen, outlined, and labelled → clicking
it or the label opens `/about` → three seconds of stillness resumes the zoom.

Two things worth knowing before changing it:

- **Freezing** works by `public/tess/config.js` reporting a zooming speed of `0`. The
  engine re-reads that value every frame and multiplies it by the frame delta, so the
  scene stops dead and resumes exactly where it left off, with no state to save.
- **Region selection reads pixels**, because the renderer keeps its geometry in a Web
  Worker and exposes none of it. It samples the canvas, flood-fills one primitive, absorbs
  neighbours breadth-first until the region is big enough, traces the outline and
  simplifies it. This requires the WebGL context to have `preserveDrawingBuffer`, which
  `config.js` secures by claiming the context *before* the engine asks for it.

Hard-won details in `pick-region.ts`, all of which caused real bugs:

- **The black background is the flood fill's favourite target** — it is the largest
  perfectly uniform area on screen whenever the scene does not fill the frame. Rejected by
  brightness and by how many canvas edges a region touches.
- **Size has two constraints, not one.** Prominence is relative to the viewport;
  reachability is absolute in CSS pixels, because a finger is the same size on any screen.
  A single percentage gets phones wrong.
- **Growth must be breadth-first.** An earlier version chose the neighbour nearest the
  centre of mass, which is equivalent but rescans the whole frontier each merge — at
  hundreds of merges that is quadratic and freezes the page.
- **Outline tracing must be bounded.** A ragged boundary can produce a six-figure point
  list, and running Douglas–Peucker over that repeatedly locks the browser.
- **Simplify iteratively, on the previous result** — not on the original outline each pass.
- Alignment with the underlying triangles is measurable: polygon area over true region
  area, where 1.000 is exact. Currently 0.975–1.011.

### Third-party renderer — do not hand-edit

`public/tess/` vendors **tessellation-webgl** by Jérémie Piellard (MIT, © 2021). The
licence ships at `public/tess/LICENSE`, a credit header sits atop both bundles, and a
visible credit is in the about page footer. **Do not strip any of them.**

`main.js` and `worker.js` are generated. Every modification is an asserted patch in
`scripts/vendor-tessellation.mjs`; run it to re-download upstream and re-apply them. With
multithreading on, **`worker.js` is what actually generates colours**, so palette changes
must touch both files — patching `main.js` alone has no visible effect.

To retune colour, edit `PALETTE` in that script, re-run it, then run
`scripts/measure-palette.mjs`. Judge by that number, not by a still frame: almost every
colour on screen is the product of a 16-level random walk, so the root colour misleads.
Calibration table in `design/tessellation.md`.

## Deployment

Live and automatic. `git push` to `main` publishes within about a minute.

Full detail in **`docs/deployment.md`** — DNS records, domain verification, access
control, and a long note on the HTTPS certificate failure mode that cost five hours.
Read that before touching anything domain-related.

## Design notes

- `design/tessellation.md` — the current arrival screen: licence, patches, palette
  calibration.
- `design/manifold-garden.md` — researched visual language (measured palette, AO and
  edge-line profiles) from an earlier direction. Still the best colour reference here.
- `design/descent.md`, `design/reference-rhinelab.md` — earlier directions, for context.

## Where things stand

**Done:** domain, HTTPS, deploy pipeline, arrival screen, interaction, about page.

**Waiting on Ziqian:**

- The CV still links to **Google Drive** (`links.cv` in `profile.ts`). He was asked to send
  the PDF so it can be served from the domain — the last Google dependency.
- **No current role is stated** now that WeRide is past tense. A deliberate blank, not an
  oversight; he may or may not want one.

**Ready to build when asked:** publications, teaching and writing pages. The content is
already structured in `profile.ts` — 11 publications with authors, venues and links — and
renders nowhere. Use the drafts mechanism.

**Known gaps:**

- `prefers-reduced-motion` is unhandled on the arrival screen; the zoom runs regardless.
- The tessellation has never been opened on a real phone.
- The blog is parked in `src/archive/` with the Astro template's sample posts. Restoring
  it means moving `blog/` and `rss.xml.js` back into `src/pages/` and putting real posts
  in `src/content/blog/`.
