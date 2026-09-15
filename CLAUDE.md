# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal website + blog for Ziqian Zheng at https://www.ziqianzheng.com, replacing a
Google Sites page. The domain is owned; DNS still points at Google Sites until this ships.

The visual direction has changed twice; all three stages still exist in the repo, and
`/` is whichever is current. **Current: the tessellation backdrop.**

| Route | Concept | Design note |
|---|---|---|
| `/` | Full-screen iterative tessellation (third-party, MIT) | `design/tessellation.md` |
| `/descent` + `/[section]` | Menger-sponge fractal descent navigation | `design/descent.md` |
| `/garden` | Scroll through Manifold Garden-style architecture | `design/manifold-garden.md` |

Read the relevant design note before touching anything visual. They record researched
specifics — measured palette values, AO and edge-line profiles, licence obligations —
that are easy to get wrong from intuition. `design/reference-rhinelab.md` covers what was
and wasn't worth taking from the original reference project.

## Third-party code

`public/tess/` vendors **tessellation-webgl** by Jérémie Piellard (MIT, © 2021). The
licence text ships at `public/tess/LICENSE` and a credit header sits atop both bundles.
**Do not strip either.**

**Never hand-edit `public/tess/main.js` or `worker.js`.** They are generated: every
modification lives as an asserted patch in `scripts/vendor-tessellation.mjs`. Run
`node scripts/vendor-tessellation.mjs` to re-download upstream and re-apply them. Note
that with multithreading on, `worker.js` is what actually generates colours, so palette
changes must touch both files.

To retune the palette, edit the `PALETTE` object in that script, re-run it, then run
`node scripts/measure-palette.mjs` — it reports what fraction of colours land in the
green hue band, before and after the 16-level subdivision walk. Judge by that number,
not by a still frame: almost every colour on screen is the product of the walk rather
than the root colour, so the root is misleading. See `design/tessellation.md` for the
calibration table.

## Workflow — verify locally, then push

**Pushing to `main` publishes.** The Actions workflow deploys every push straight to the
live domain, so there is no staging step between a push and the public site.

So: make the change, run `npm run build` to confirm it compiles, verify what can be
verified, then **stop and let Ziqian review it on localhost** before pushing. Committing
locally is fine; the push is the gate.

This matters more than it looks, because much of this site cannot be checked headlessly.
Chrome suspends `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver` and CSS
transitions in background tabs — so the tessellation renders only its first frame, the
freeze-and-choose interaction never fires, and canvas screenshots capture a stale
composite. Anything animated or interactive genuinely needs a human in a focused window.

Where automated checks *are* possible, prefer them: `scripts/measure-palette.mjs` for
colour, and synthetic-canvas tests for triangle detection (see `design/tessellation.md`).

## Commands

- `npm run dev` — dev server at http://localhost:4321. When Claude starts it, prefer
  `npx astro dev --background` (manage with `npx astro dev stop` / `status` / `logs`).
- `npm run build` — production build to `dist/`; also type-checks content frontmatter.
- `npm run preview` — serve the production build.

## Architecture

Astro static site (Node >= 22.12) with one Three.js island. No UI framework.

**Content is ordinary DOM; the 3D scene is decorative.** Every page works with JavaScript
off, without WebGL, and for a crawler. This is deliberate — the site's audience includes
recruiters and Google Scholar. Never move real content into the canvas.

- `src/data/profile.ts` — canonical profile, publications, teaching, education. Hand-typed
  TS rather than a content collection; it's a fixed list and the schema is expressive.
  The raw capture from the old site, with source URLs, is in `content/site-content.md`.
- `src/scene/palette.ts` — **source of truth for colour.** `src/styles/tokens.css` mirrors
  it for the DOM. Change both together.
- `src/scene/garden.ts` — the procedural scene. Boxes only; no textures, no models.
- `src/components/Garden.astro` — mounts the scene as a fixed backdrop, with a CSS
  gradient fallback that stands in when WebGL is unavailable.
- `src/layouts/Base.astro` — shell: backdrop, fixed HUD furniture, content slot.
- Blog posts stay in `src/content/blog/` as Markdown; schema in `src/content.config.ts`.
  Routing, the index, RSS and sitemap all follow automatically from adding a file.

### Scene notes

Hard-won details that will bite anyone editing `garden.ts`:

- **Never set `vertexColors: true` on the instanced material.** `BoxGeometry` has no
  colour attribute, so it multiplies every surface by an undefined attribute — black.
  Per-instance colour comes from `instanceColor` alone.
- The lattice **wraps around the camera** rather than extending; coordinates stay small
  and the world never ends. `buildCell`'s optional pieces must stay last, because the
  maximal cell defines the per-cell instance stride.
- The scene paints one frame **synchronously** at construction. Background tabs suspend
  `requestAnimationFrame` *and* CSS transitions, so a rAF-gated fade-in leaves the canvas
  blank there.
- Resolution is budgeted by **pixel count, not device ratio** — a 5K display at dpr 2 is
  13 megapixels and fill rate, not geometry, is the bottleneck.

### Testing the scene

`/garden-test?debug` is a dev-only page (noindex, unlinked). `?debug` preserves the
drawing buffer so screenshots of a background tab capture real pixels. In the console,
`__shot(seconds)` advances the scene deterministically, forces it visible, and reports
camera position and triangle count.

## Layout gotcha

The Astro blog template's `src/styles/global.css` pins `main` to 720px. `Base.astro` uses
`.shell` (a class) to win on specificity without unpicking that stylesheet, which the
article pages still depend on.

## Deployment

Not yet set up — no git repository or GitHub remote. Plan: GitHub Pages via a GitHub
Actions workflow on push, with `www.ziqianzheng.com` as the custom domain.
