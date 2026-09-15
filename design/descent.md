# The Descent — navigation concept

Decided 2026-09-15 with Ziqian. Supersedes the scroll-through-a-garden homepage
(kept at `/garden` for reference). The brief: *infinity, fractal, manifold* — with the
sense of those ideas, not a reproduction of Manifold Garden.

## The idea

**The structure is the menu.** There is no nav bar. A Menger sponge floats in a void;
each of its six face tunnels is a destination. Clicking one flies the camera into it, and
the nested copy inside grows to fill the frame. You arrive one level deeper.

Why this form:

- **Fractal, literally.** A Menger sponge is self-similar at every scale, so the zoom
  never bottoms out. Manifold Garden tiles *periodically* — the same block repeated
  sideways. Recursing through *scale* is a different animal with the same DNA, which is
  what Ziqian asked for.
- **Manifold.** Every position in the descent is locally identical; only your path
  distinguishes where you are. That is the definition of a manifold — and manifold
  learning sits next to the high-dimensional data work in Ziqian's own publications, so
  the metaphor is his, not borrowed.
- **Six tunnels, six sections.** The form supplies exactly the right arity for free.

## The mechanism

The sponge is rendered as three nested copies at scales 1, ⅓ and ⅑, all centred on the
origin. Because the ⅓ copy exactly fills the ⅓-wide tunnel, looking down any tunnel shows
the child, and through *its* tunnel the grandchild, and so on to a pinpoint.

Flying the camera from radius `D` to `D/3` leaves the child framed exactly as the parent
was at the start — same angular size — so descending a level needs no rebuild. The camera
simply returns to `D`.

**Two things that took iteration:**

1. **The radius must decay exponentially, not linearly.** Perceived zoom rate is
   logarithmic, so `r = D · 3^(−t)` is what reads as steady descent. A cubic ease-in
   spends most of the animation apparently motionless and then lurches.
2. **The reset cannot be mathematically seamless.** At the bottom of the dive the frame is
   filled by tunnel wall; after the reset it is filled by void. Making it truly seamless
   would require copies at scales 3, 9, … as well — but then the arrival view is not a
   single object floating in a void, which is the whole opening image. So the reset is
   *covered*: a veil in the accent colour rises over the last 45% of the dive and fades
   once the panel is open. The content arriving is what hides the cut, which is also the
   natural thing for the page to be doing at that moment.

## Pure minimal arrival

Ziqian chose no instructions at all — name only. That puts the entire burden of "this is
interactive" on behaviour, so the affordances are:

- the form leans toward the cursor, responding instantly to any movement;
- apertures glow, and hovering one brightens it while dimming the rest;
- the cursor becomes a pointer, and a label floats beside the aperture;
- after 4 idle seconds, whichever aperture faces the viewer breathes.

If analytics ever show people bouncing from `/` without interacting, the first thing to
try is a single line of text — that is the known risk of this choice.

## What is deliberately ordinary

Each destination is a **real route** (`/about`, `/research`, …), pre-rendered with its
panel already open, carrying its own `<title>` and canonical URL. Every panel is in the
DOM on every route. With JavaScript off or WebGL unavailable the page drops to a plain
list of links and stacked sections — a perfectly good website. The descent is an
enhancement layered over ordinary navigation, never a replacement for it.

## Open items

- Ascending is currently instant (Esc or the button). It should reverse the dive.
- Depth is not yet tracked or shown; descending twice into different sections should
  probably read as depth 2 with a breadcrumb.
- Touch has no hover, so labels need to be permanently visible and tap targets enlarged.
- The block reads slightly grey; worth warming toward the cream calibrated in
  `manifold-garden.md`.
