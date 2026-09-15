# The tessellation backdrop

The site's arrival screen is a full-viewport run of **tessellation-webgl** by
**Jérémie Piellard** — iterative tessellation with infinite zoom.

- Upstream: https://github.com/piellardj/tessellation-webgl
- Live demo: https://piellardj.github.io/tessellation-webgl/
- Licence: **MIT**, © 2021 Jérémie Piellard

## Licence obligations

MIT permits use, modification and redistribution, and requires that the copyright
notice and permission notice travel with the code. Both are satisfied:

- The full licence text ships at `public/tess/LICENSE`, served at `/tess/LICENSE`.
- `public/tess/main.js` carries a header comment naming the author, the licence, the
  upstream URL, and the one modification we made.

Do not strip either. If the vendored build is ever refreshed, re-apply the header.

## What is vendored, and why it sits in `public/`

`public/tess/` holds the author's **prebuilt** bundle rather than source:

| File | Origin |
|---|---|
| `main.js` | upstream `docs/script/main.js` + URL and palette patches |
| `worker.js` | upstream `docs/script/worker.js` + palette patch |
| `shaders/*.vert`, `*.frag` | upstream `docs/shaders/`, verbatim |
| `LICENSE` | upstream root, verbatim |
| `config.js` | **ours** — see below |

It bypasses the Astro/Vite pipeline deliberately: it is a self-contained webpack
IIFE that spawns its own Web Worker and fetches shaders at runtime, so it needs
stable, absolute URLs that survive bundling and hashing.

**Do not hand-edit the vendored bundles.** Every modification is expressed as a
patch in `scripts/vendor-tessellation.mjs`; run `node scripts/vendor-tessellation.mjs`
to re-download upstream and re-apply them. Each patch asserts it matched exactly once,
so if upstream moves, the script fails loudly instead of silently producing a bundle
with half the changes. It is deliberately not part of `npm run build` — a network
failure must never break a deploy.

### Patch 1 — absolute URLs (`main.js` only)

```
"script/worker.js?v=" → "/tess/worker.js?v="
"./shaders/"          → "/tess/shaders/"
```

Both are resolved against the *document* URL, not the script's. Left relative they
would 404 on any route other than `/`.

### Patch 2 — green palette (`main.js` **and** `worker.js`)

Upstream draws a uniformly random RGB root colour, then each subdivision level
random-walks every channel by up to ±`colorVariation`/2 — ±38 at the default
setting. That walk is what produces the variety, but across ~16 levels it drifts
anywhere in the colour cube, so biasing only the root would not keep a scene green.

Two changes, both required:

1. `Color.random` draws its hue from a **triangular** distribution peaking on
   green rather than sampling the RGB cube uniformly. Triangular, not a hard
   wedge: green is only the most *likely* hue, and the tails still reach orange
   and blue — which is what stops the scene reading as monochrome.
2. `Color.computeCloseColor` adds gentle mean-reversion, so the bias survives
   deep subdivision instead of washing out — but weakly enough that colours
   still travel a long way from where they started.

Because multithreading is on, **`worker.js` is what actually generates the
colours**; patching `main.js` alone would have no visible effect. Both carry their
own copy of the `Color` class.

### Tuning, and how it was calibrated

All the numbers live in the `PALETTE` object at the top of the vendoring script.
`HUE_SPREAD` (0 = always green, 180 = upstream) and `ANCHOR_PULL` (0 = drift
freely, 0.13+ = tightly held) are the two that matter.

Greenness is measurable, so it was calibrated rather than guessed. Counting hues
in 60°–190° across 6000 samples, before and after 16 subdivision levels:

| Setting | roots | after 16 levels |
|---|---|---|
| Upstream, unmodified | 36% | **37%** |
| `HUE_SPREAD 46 / PULL 0.13` — too green | 100% | **91%** |
| `HUE_SPREAD 132 / PULL 0.055` — current | 74% | **64%** |

37% is the natural baseline: the green band is simply ~36% of the hue circle, so
upstream's uniform sampling lands there by definition. The current setting sits at
the midpoint between that and the over-green version. Samples after 16 levels:
`#659bd0`, `#bbb66c`, `#39e079`, `#377901`, `#4d9780`, `#6aa342` — green-dominant
with blues, khakis and teals still present.

The harness that produced this table evaluates the patched functions pulled
straight out of the shipped `worker.js`, so it measures what actually deploys.

## `config.js` — why a shim rather than the control panel

Upstream ships as a demo page: the engine reads every setting live from a control
panel, through a global `Page` object provided by the author's demopage framework.
We want the visual, not the panel.

Rather than ship that framework (plus its CSS and markup) and then hide it,
`config.js` implements the ~25 methods the engine actually calls and answers each
with a fixed value. It must load **before** `main.js`, which reads `Page` the moment
it executes — hence both scripts sit at the end of `<body>`, neither deferred.

The shim also bridges real browser events to the observer arrays the engine
registers, and adds a `ResizeObserver` on the canvas. That last part matters: the
engine sizes its backing store from `clientWidth` in its constructor, which runs
before the stylesheet has laid the canvas out, so the first frame would otherwise
be rendered at a stale, much lower resolution.

## Settings

Ziqian's chosen configuration, which turns out to be upstream's defaults
throughout — worth knowing, because it means we are not fighting the author's
tuning anywhere:

| Setting | Value | Range |
|---|---|---|
| Primitive | Triangles | quads \| triangles |
| Density | 16 | 1–20 |
| Balance | 0.5 | 0–1 |
| Zooming speed | 0.3 | 0–1 |
| Multithreaded | on | — |
| Scaling | 1.0 | 0.25–1 |
| Colour variation | 0.3 | 0–1 |
| Blend in | on | — |
| Show indicators | off | — |
| Display lines | off | — |
| Lines colour | `#000000` | — |

All of them live in the `CONFIG` object at the top of `config.js`. Changing one is a
one-line edit; the ranges above are the author's own limits, so values outside them
are not meaningful.

## Verified

Shim installed, worker spawned, all four shaders fetched from `/tess/shaders/`, GL
context created, first frame drawn with the correct primitive. The subdivision
animation is driven by `requestAnimationFrame`, which Chrome suspends in background
tabs — so it can only be watched in a focused window, not in automated capture.

## Open items

- Visible credit to Jérémie Piellard somewhere on the site. Not required by MIT,
  but this is someone else's artwork carrying the whole first impression.
- `prefers-reduced-motion`: the zoom runs continuously and there is currently no
  static alternative.
- Mobile: `touch-action: none` hands gestures to the engine; untested on a phone.
- The canvas has no accessible content, so `/` currently carries almost no text.
  Whatever navigation comes next has to supply that.
