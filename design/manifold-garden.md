# Design direction: Manifold Garden

The target look, from Ziqian: the polish level of [RhineLabUI](./reference-rhinelab.md)
with the visual language of **Manifold Garden** (William Chyr, 2019). This file records
what that language actually is — researched from the SIGGRAPH 2020 rendering paper, Chyr's
dev blog, and a colour analysis of the official press screenshots — and how we translate it.

## What the reference actually looks like

Six findings drive the implementation. Most of them contradict the obvious guess.

**1. The architecture is warm cream, not white.** Measured `#FAF4E5`, `#F4EAD4`,
`#EEE0C5` — hue 40–45°, saturation only 0.08–0.17. Rendering it `#ffffff` is most of the
difference between this look and a generic greybox demo.

**2. Accents are near-maximum chroma and very rare.** Measured `#FF0000`, `#FEE200`,
`#04EE31`. Across nine press screenshots, strongly-saturated pixels are **3.2% of all
pixels** — three screenshots have literally zero. The rule is ~95% cream plus ~3–5% pure
colour. Tasteful muted accents read as mud at that coverage.

**3. Six gravity colours, paired by axis.** Vertical blue↓/red↑, lateral orange/purple,
depth yellow/green. Blue is cyan-leaning, purple magenta-leaning. Colour encodes
*orientation*, not decoration.

**4. Ambient occlusion is the primary form-definer**, not shadows. Published AO radius is
3 units. Measured: every flat face carries a gentle ~15% luminance falloff toward its
borders. Chyr: *"Without AO, everything just looks too flat."*

**5. Painterly edge lines are the signature.** Measured profile across an edge:
`184 183 182 184 192 184 [148] 184 190 184 183` — a 1px dark core at ~15% contrast with a
faint bright halo either side. Not a uniform cartoon outline.

**6. There is no true horizon.** Because the world is a 3-torus, repetition converges into
a bright band that appears symmetrically **above and below** eye level, with deep indigo
beyond. Vertical repetition filling the sky is the genuinely uncanny part.

Also: no curves anywhere (every surface must have one of six normals), no skybox
(anything visible must be reachable), fog is white/cream, and the whole world is one
material with lerped colour.

## How we implement it

The constraints suit the web unusually well — no curves means everything is `BoxGeometry`,
and untextured is the shipped look rather than a compromise.

| Element | Approach |
|---|---|
| Architecture | Procedural boxes on a lattice, one `InstancedMesh`, ~7k instances |
| Infinity | 7×5×7 cell lattice that **wraps around the camera**, fog hiding the edge |
| AO + edges | Analytic in the fragment shader from each box's own face coordinates |
| Colour | Per-instance `instanceColor`; accent surfaces retint on section change |
| Sky | Inverted sphere, symmetric band-to-indigo gradient |
| Lighting | Warm hemisphere fill + weak sun; six normals give six discrete tones |

The AO/edge trick is the load-bearing one. Because every piece is a unit box, the distance
from a fragment to its face border is just `(0.5 - |localPos|)` scaled by the instance's
size — so both effects are exact, free, and free of the noise a screen-space AO pass adds.
The game's own edge technique reads individual MSAA subsamples, which WebGL cannot do.

**Cost: ~131 KB gzipped for the entire 3D layer**, against 5.8 MB for RhineLabUI — whose
weight is almost entirely Blender-authored GLB models. Procedural geometry skips all of it.

## Translation decisions

- **Sections own axis colours**, the way gravity directions do in the game: home orange,
  research blue, writing green, teaching yellow, about red. Scrolling into a section
  retints both the scene's accent surfaces and the CSS `--accent`. That scroll-driven
  recolour is our version of the gravity shift.
- **Accent surfaces are horizontal**, sitting on the decks. The game's coded surfaces are
  the ones you walk on, and an upward face takes the full key light — a vertical panel sits
  in ambient half the time and muds out to brown.
- **Type is uppercase geometric sans at wide tracking** (the game's own site runs Jost at
  5–8px letter-spacing). We use Futura/Jost/Century Gothic with a system fallback.
- **Ink is deep indigo `#1b2140`**, not black, so text belongs to the same world.

## Deliberately not done

- Recursive portals (stencil-based; fiddly, and the lattice already sells the infinity).
- Real shadow maps — AO plus six-tone normal shading reads correctly without them.
- A blocking entry gate. RhineLabUI has one; for a site that recruiters and Google Scholar
  visitors land on, content must be immediately present.

## Open items

- Self-host Jost so the display face is identical off macOS (currently falls back).
- Mobile tuning: the scene drops to a lower pixel budget, but the camera framing has not
  been checked on a narrow portrait viewport.
- A fast searchable index of publications and posts, in the spirit of RhineLabUI's
  `ARCHIVE INDEX` — the pragmatic escape hatch from the atmospheric version.
