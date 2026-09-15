# Reference study: RhineLabUI (rhine.lubeiluchen.cc)

Studied 2026-09-15. Live site + source at github.com/LBEILC/RhineLabUI (MIT, 509 stars).
This is the site Ziqian pointed at as the target level of polish.

## What it actually is

A bespoke art project, not a template. 1,211 files. It reproduces a 35-second
sequence from an Arknights promo video frame-by-frame — the DESIGN.md logs camera
azimuth/elevation per frame, hand-calibrated lighting, and a dozen abandoned motion
experiments. Its 3D assets are Blender-authored GLBs committed to the repo
(`art/*.blend` → `public/assets/*.glb`).

**Do not try to clone this.** The transferable parts are the interaction
architecture and the UI grammar, not the assets or the pipeline.

## Stack

Runtime dependencies are tiny: `three` + `@kitlangton/rolling-number`. Build is
`vite` + `tsc` + `prettier`. No UI framework at all — DOM is built by hand in
`src/html.ts`. Everything else in that repo is tooling, verification screenshots,
and Blender scripts.

## Measured page weight (live, after full boot)

5.80 MB over 45 requests: **5.03 MB of it is GLB model fetches**, 538 KB CSS,
288 KB script, 79 KB fonts. JS heap 17 MB.

The implication for us: the code is cheap, the Blender assets are the entire cost.
A procedural-geometry scene skips ~5 MB and lands near ~300 KB total.

## The four screens

1. **Entry gate** — warm-white void, logo, "点击进入 →". Nothing else.
2. **Boot sequence** — brand lockup animates in, status lines type out.
3. **Archive array** (the money shot) — hundreds of instanced file cards receding
   in a strong diagonal perspective, camera at ~59° azimuth / 19° elevation with a
   narrow FOV to compress perspective. HUD overlays the corners. Arrow keys move
   between columns/rows, Enter opens.
4. **Detail view** — split: interactive 3D model on the left ("drag to inspect",
   360° viewer), typographic document panel on the right with a metadata grid,
   numbered tabs, abstract, and action row.

Plus a **search index modal** — a plain, fast, filterable table of all 40 records
over a blurred backdrop. Worth noting: even this maximalist project keeps a
conventional list view one keystroke away. We should too.

## UI grammar worth stealing

- Warm grey-white ground (`#eae5e1`), black text, warm amber-gold as the only
  accent/selection colour. Essentially monochrome plus one signal colour.
- Organised by **hairlines and compact typography**, not boxes or cards.
- Small-caps, wide letterspaced labels in the corners (`ARCHIVE / SELECT`,
  `INTERNAL DATABASE / READY`, `SESSION AUTHORIZED`) with a bilingual second line.
- Big numerals as state display: `01 / 08`, `COLUMN 03 / 05`, a live clock.
- Keyboard-first, with the key legend printed on screen (`←→ 切换列 / ↑↓ 前后档案
  / ENTER 读取`).
- Persistent brand block top-left, `POWERED BY` bottom-right — fixed furniture the
  3D scrolls behind.

## Motion principles from their DESIGN.md

- Critically-damped springs that **preserve velocity** — interrupting a transition
  continues from current position and speed rather than restarting.
- Idle "breathing": after 2.5s of no input, a slow drift (8s and 13s periods
  superimposed, ~2.8% of card height) with neighbours slightly phase-offset.
- Selection sends a ripple through neighbours, delayed and attenuated by distance.
- `prefers-reduced-motion` snaps to final state everywhere — treated as a
  first-class path, not an afterthought.
- Transitions are short and specific: 180ms detail in/out, 300ms modal in /
  200ms out, 150ms tab fade, 460ms number roll.

## What we take, what we drop

**Take:** the HUD grammar, the near-monochrome + one accent palette, hairline
layout, keyboard-first navigation with visible legend, velocity-preserving springs,
idle breathing, the always-available text index, the split detail view.

**Drop:** the Blender pipeline, the 5 MB of GLBs, the entry gate blocking content,
PWA/wallpaper/audio builds, and the frame-matched reproduction approach.
